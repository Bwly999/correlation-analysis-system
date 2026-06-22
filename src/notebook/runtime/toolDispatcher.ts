/**
 * Notebook 工具执行 dispatcher（在 iframe 主线程跑）。
 *
 * 把工具名分派到对应执行器，统一构造 ToolResult。
 *
 * 协议见 docs/design-doc/notebook-agent/工具集协议.md §6（工具执行端路由）。
 */

import {
  fsRead,
  fsWrite,
  fsEdit,
  fsList,
  fsGrep,
  type FsToolError,
} from './fsTools'
import {
  truncateOutputTail,
  type TruncationMeta,
} from './outputTruncate'
import type { OpfsDirectoryHandle } from '../shared/opfsAccess'
import type { BridgeWorkerHost } from './parentBridgeClient'
import type { NotebookTodoStore, TodoItem } from './notebookTodoStore'
import type { AskUserQueue, AskUserItem } from './askUserQueue'
import { NOTEBOOK_AGENT_TOOL_SPECS } from '../../shared/notebookAgentTools'

// ──────────────────────────────────────────────
// Pi SDK ToolResult 协议
// ──────────────────────────────────────────────

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  details: Record<string, unknown>
  isError?: boolean
}

const okResult = (details: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
  details,
})

const errorResult = (
  code: string,
  message: string,
  detail?: unknown,
): ToolResult => {
  const details = {
    error: { code, message, detail },
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
    details,
    isError: true,
  }
}

/**
 * 截断 Python exec 的 stdout / stderr，防止超长输出（print(df)、长 traceback）
 * 填满 Agent 上下文窗口。尾部保留——关键内容（traceback 末帧、最终结果）在末尾。
 *
 * 仅在触发截断时追加提示行（让 LLM 知道信息不全，建议改用落盘），
 * 并在 details 里挂 stdoutTruncation / stderrTruncation 元数据。
 */
const truncateExecOutput = (
  stdout: string,
  stderr: string,
): {
  stdout: string
  stderr: string
  stdoutTruncation?: TruncationMeta
  stderrTruncation?: TruncationMeta
} => {
  const outT = truncateOutputTail(stdout)
  const errT = truncateOutputTail(stderr)
  const result: {
    stdout: string
    stderr: string
    stdoutTruncation?: TruncationMeta
    stderrTruncation?: TruncationMeta
  } = { stdout: outT.content, stderr: errT.content }
  if (outT.truncation.truncated) {
    result.stdout = `${outT.content}\n\n[stdout 已截断：显示末尾 ${outT.truncation.outputLines} 行 / 共 ${outT.truncation.totalLines} 行（${outT.truncation.totalBytes} 字节）。如需完整输出请写入 artifacts/ 后用 fs_read 分段查看]`
    result.stdoutTruncation = outT.truncation
  }
  if (errT.truncation.truncated) {
    result.stderr = `${errT.content}\n\n[stderr 已截断：显示末尾 ${errT.truncation.outputLines} 行 / 共 ${errT.truncation.totalLines} 行（${errT.truncation.totalBytes} 字节）]`
    result.stderrTruncation = errT.truncation
  }
  return result
}

// ──────────────────────────────────────────────
// 依赖注入
// ──────────────────────────────────────────────

export interface ExecutableWorkerHost extends BridgeWorkerHost {
  exec: (code: string, timeoutMs?: number) => Promise<{
    ok: boolean
    stdout: string
    stderr: string
    errorType: string | null
    errorMessage?: string
    traceback?: string
    durationMs: number
  }>
  queryPackages: (
    action: 'list' | 'load',
    packages?: string[],
  ) => Promise<{
    action: 'list' | 'load'
    loaded: Array<{ name: string; version: string }>
    notLoaded: Array<{ name: string; version: string }>
    loadResults?: Array<{ name: string; ok: boolean; message?: string }>
  }>
}

export interface ToolDispatcherDeps {
  opfsRoot: OpfsDirectoryHandle
  workerHost: ExecutableWorkerHost
  todoStore: NotebookTodoStore
  askUserQueue: AskUserQueue
}

export interface ToolDispatcher {
  dispatch: (
    name: string,
    params: unknown,
    toolCallId: string,
  ) => Promise<ToolResult>
}

const KNOWN_TOOLS = new Set<string>(NOTEBOOK_AGENT_TOOL_SPECS.map((s) => s.name))

const DEFAULT_EXEC_TIMEOUT = 60_000

export const createToolDispatcher = (deps: ToolDispatcherDeps): ToolDispatcher => {
  const { opfsRoot, workerHost, todoStore, askUserQueue } = deps

  const dispatch = async (
    name: string,
    params: unknown,
    toolCallId: string,
  ): Promise<ToolResult> => {
    if (!KNOWN_TOOLS.has(name)) {
      return errorResult('unknown_tool', `未知工具：${name}`)
    }

    try {
      switch (name) {
        case 'python_exec_inline': {
          const p = params as { code?: string; timeoutMs?: number }
          if (typeof p?.code !== 'string') {
            return errorResult('invalid_arguments', 'python_exec_inline 缺少 code')
          }
          const timeout = Math.min(Math.max(p.timeoutMs ?? DEFAULT_EXEC_TIMEOUT, 1_000), 300_000)
          const out = await workerHost.exec(p.code, timeout)
          const t = truncateExecOutput(out.stdout, out.stderr)
          if (out.ok) {
            return okResult({
              execId: toolCallId,
              status: 'ok',
              stdout: t.stdout,
              stderr: t.stderr,
              elapsedMs: out.durationMs,
              ...(t.stdoutTruncation ? { stdoutTruncation: t.stdoutTruncation } : {}),
              ...(t.stderrTruncation ? { stderrTruncation: t.stderrTruncation } : {}),
            })
          }
          return okResult({
            execId: toolCallId,
            status:
              out.errorType === 'interrupted'
                ? 'interrupted'
                : out.errorType === 'timeout'
                  ? 'timeout'
                  : 'error',
            stdout: t.stdout,
            stderr: t.stderr,
            elapsedMs: out.durationMs,
            error: out.errorMessage
              ? { code: out.errorType ?? 'python_exception', message: out.errorMessage }
              : undefined,
            ...(t.stdoutTruncation ? { stdoutTruncation: t.stdoutTruncation } : {}),
            ...(t.stderrTruncation ? { stderrTruncation: t.stderrTruncation } : {}),
          })
        }
        case 'python_exec_file': {
          // M1 简化：读 .py 文件再走 inline；实际需要在 worker 内做无状态 exec_file
          const p = params as { path?: string; timeoutMs?: number }
          if (typeof p?.path !== 'string') {
            return errorResult('invalid_arguments', 'python_exec_file 缺少 path')
          }
          // 复用 fsRead 拿 content（不走截断：要执行需要全文）
          const r = await fsRead(opfsRoot, { path: p.path, limit: 1_000_000 })
          const timeout = Math.min(Math.max(p.timeoutMs ?? DEFAULT_EXEC_TIMEOUT, 1_000), 300_000)
          const out = await workerHost.exec(r.content, timeout)
          const t = truncateExecOutput(out.stdout, out.stderr)
          return okResult({
            execId: toolCallId,
            status:
              out.ok
                ? 'ok'
                : out.errorType === 'interrupted'
                  ? 'interrupted'
                  : out.errorType === 'timeout'
                    ? 'timeout'
                    : 'error',
            stdout: t.stdout,
            stderr: t.stderr,
            elapsedMs: out.durationMs,
            error: out.errorMessage
              ? { code: out.errorType ?? 'python_exception', message: out.errorMessage }
              : undefined,
            ...(t.stdoutTruncation ? { stdoutTruncation: t.stdoutTruncation } : {}),
            ...(t.stderrTruncation ? { stderrTruncation: t.stderrTruncation } : {}),
          })
        }
        case 'python_packages': {
          const p = params as { action?: 'list' | 'load'; packages?: string[] }
          const action = p?.action === 'load' ? 'load' : 'list'
          if (action === 'load' && (!Array.isArray(p?.packages) || p.packages!.length === 0)) {
            return errorResult('invalid_arguments', 'python_packages action=load 需要 packages 数组')
          }
          const result = await workerHost.queryPackages(action, action === 'load' ? p.packages : undefined)
          if (action === 'list') {
            // notLoaded 全量可达数百个，直接返回会撑爆 Agent 上下文。
            // list 只返回 loaded 全量（boot 预装的几个）+ notLoaded 数量提示；
            // Agent 想确认某包能否加载，用 action=load 试一次（不存在会在 loadResults 里报错）。
            return okResult({
              action,
              loaded: result.loaded,
              loadedCount: result.loaded.length,
              notLoadedCount: result.notLoaded.length,
              hint: `runtime 内另有 ${result.notLoaded.length} 个未加载的包；要加载某包用 action=load（不存在或加载失败会在 loadResults 里报错）`,
            })
          }
          // action=load：返回加载结果 + 最新 loaded 清单
          return okResult({
            action,
            loadResults: result.loadResults ?? [],
            loaded: result.loaded,
            loadedCount: result.loaded.length,
          })
        }
        case 'fs_read': {
          const r = await fsRead(opfsRoot, params as Parameters<typeof fsRead>[1])
          return okResult({ ...r })
        }
        case 'fs_write': {
          const r = await fsWrite(opfsRoot, params as Parameters<typeof fsWrite>[1])
          return okResult({ ...r })
        }
        case 'fs_edit': {
          const r = await fsEdit(opfsRoot, params as Parameters<typeof fsEdit>[1])
          return okResult({ ...r })
        }
        case 'fs_list': {
          const r = await fsList(opfsRoot, params as Parameters<typeof fsList>[1])
          return okResult({ path: r.path, entries: r.entries })
        }
        case 'fs_grep': {
          const r = await fsGrep(opfsRoot, params as Parameters<typeof fsGrep>[1])
          return okResult({
            pattern: r.pattern,
            matches: r.matches,
            truncated: r.truncated,
          })
        }
        case 'todo_write': {
          const p = params as { items?: TodoItem[] }
          if (!Array.isArray(p?.items)) {
            return errorResult('invalid_arguments', 'todo_write 缺少 items 数组')
          }
          todoStore.setItems(p.items)
          const stats = todoStore.getStats()
          return okResult({
            items: p.items,
            total: stats.total,
            inProgress: stats.inProgress,
            completed: stats.completed,
          })
        }
        case 'ask_user': {
          const p = params as Omit<AskUserItem, 'toolCallId'>
          const result = await askUserQueue.enqueue({
            toolCallId,
            question: p.question,
            header: p.header,
            options: p.options,
            multiSelect: p.multiSelect,
            recommendedIndex: p.recommendedIndex,
          })
          return okResult({ answers: result.answers })
        }
      }
      return errorResult('unknown_tool', `未路由：${name}`)
    } catch (err) {
      const code = (err as FsToolError).code
      const message = err instanceof Error ? err.message : String(err)
      if (code) {
        return errorResult(code, message)
      }
      return errorResult('tool_failed', message)
    }
  }

  return { dispatch }
}
