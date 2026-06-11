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
          if (out.ok) {
            return okResult({
              execId: toolCallId,
              status: 'ok',
              stdout: out.stdout,
              stderr: out.stderr,
              elapsedMs: out.durationMs,
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
            stdout: out.stdout,
            stderr: out.stderr,
            elapsedMs: out.durationMs,
            error: out.errorMessage
              ? { code: out.errorType ?? 'python_exception', message: out.errorMessage }
              : undefined,
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
          return okResult({
            execId: toolCallId,
            status: out.ok ? 'ok' : 'error',
            stdout: out.stdout,
            stderr: out.stderr,
            elapsedMs: out.durationMs,
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
