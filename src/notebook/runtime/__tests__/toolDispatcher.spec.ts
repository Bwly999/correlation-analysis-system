/**
 * toolDispatcher 单测。
 *
 * 路由表：
 *   python_exec_inline → workerHost.exec
 *   python_packages → workerHost.queryPackages
 *   fs_read/write/edit/list/grep → fsTools
 *   todo_write → notebookTodoStore.setItems
 *   ask_user → askUserQueue.enqueue
 *
 * 单测覆盖：
 *   - 工具名分派正确，调用对应实现
 *   - 工具抛错时统一构造 ToolResult { isError: true, details.error }
 *   - 未知工具 → unknown_tool error
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createToolDispatcher, type ToolDispatcherDeps } from '../toolDispatcher'
import {
  createMemOpfsRoot,
  type MemDirectoryHandle,
} from '../../shared/__tests__/memOpfs'
import { ensureWorkspaceTree, writeFile } from '../../shared/opfsAccess'
import { createNotebookTodoStore } from '../notebookTodoStore'
import { createAskUserQueue } from '../askUserQueue'
import type { BridgeWorkerHost } from '../parentBridgeClient'

const buildDeps = async (overrides?: Partial<ToolDispatcherDeps>) => {
  const root = createMemOpfsRoot()
  await ensureWorkspaceTree(root)
  const workerHost = {
    writeFs: vi.fn(),
    isBusy: () => false,
    exec: vi
      .fn()
      .mockResolvedValue({
        ok: true,
        stdout: 'hello\n',
        stderr: '',
        errorType: null,
        durationMs: 12,
      }),
    queryPackages: vi.fn().mockResolvedValue({
      action: 'list',
      loaded: [
        { name: 'numpy', version: '2.0.2' },
        { name: 'seaborn', version: '0.13.2' },
      ],
      notLoaded: [
        { name: 'networkx', version: '3.3' },
        { name: 'sympy', version: '1.13.0' },
      ],
    }),
  }
  const todoStore = createNotebookTodoStore()
  const askQueue = createAskUserQueue()

  return {
    root,
    deps: {
      opfsRoot: root,
      workerHost: workerHost as unknown as BridgeWorkerHost & {
        exec: (code: string) => Promise<unknown>
      },
      todoStore,
      askUserQueue: askQueue,
      ...overrides,
    } as ToolDispatcherDeps,
    workerHost,
    todoStore,
    askQueue,
  }
}

describe('toolDispatcher', () => {
  let env: Awaited<ReturnType<typeof buildDeps>>

  beforeEach(async () => {
    env = await buildDeps()
  })

  describe('python_exec_inline', () => {
    it('调 workerHost.exec 并把 stdout/status 写进 details', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch('python_exec_inline', {
        code: 'print("hello")',
      }, 'tc-1')
      expect(env.workerHost.exec).toHaveBeenCalledWith(
        'print("hello")',
        expect.any(Number),
      )
      expect(result.isError).toBeFalsy()
      const details = result.details as Record<string, unknown>
      expect(details.status).toBe('ok')
      expect(details.stdout).toBe('hello\n')
    })

    it('worker exec 返回错误 → tool result.isError=true', async () => {
      env.workerHost.exec = vi.fn().mockResolvedValue({
        ok: false,
        stdout: '',
        stderr: 'Traceback...',
        errorType: 'runtime_error',
        errorMessage: 'ZeroDivisionError',
        durationMs: 5,
      }) as unknown as typeof env.workerHost.exec
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch('python_exec_inline', { code: '1/0' }, 'tc-2')
      const details = result.details as Record<string, unknown>
      expect(details.status).toBe('error')
      expect(details.stderr).toMatch(/Traceback/)
    })

    it('短输出不截断，不含 truncation 字段', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch(
        'python_exec_inline',
        { code: 'print(1)' },
        'tc-short',
      )
      const details = result.details as Record<string, unknown>
      expect(details.stdout).toBe('hello\n') // 默认 mock
      expect(details.stdoutTruncation).toBeUndefined()
      expect(details.stderrTruncation).toBeUndefined()
    })

    it('超长 stdout 被截断并挂 stdoutTruncation + 追加提示', async () => {
      // 生成 5000 行 stdout，超过 2000 行默认上限
      const bigStdout = Array.from({ length: 5000 }, (_, i) => `line-${i}`).join('\n')
      env.workerHost.exec = vi.fn().mockResolvedValue({
        ok: true,
        stdout: bigStdout,
        stderr: '',
        errorType: null,
        durationMs: 10,
      }) as unknown as typeof env.workerHost.exec
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch(
        'python_exec_inline',
        { code: 'print(big)' },
        'tc-big',
      )
      const details = result.details as Record<string, {
        truncated?: boolean
        truncatedBy?: string
        totalLines?: number
      }>
      expect(details.stdoutTruncation?.truncated).toBe(true)
      expect(details.stdoutTruncation?.truncatedBy).toBe('lines')
      expect(details.stdoutTruncation?.totalLines).toBe(5000)
      // 截断后 stdout 含末尾行 + 提示
      expect(details.stdout as string).toMatch(/line-4999/)
      expect(details.stdout as string).toMatch(/stdout 已截断/)
      // stderrTruncation 不应出现（stderr 为空）
      expect(details.stderrTruncation).toBeUndefined()
    })

    it('python_exec_file 同样对超长输出截断', async () => {
      await writeFile(
        env.root,
        'scripts/big.py',
        Array.from({ length: 10 }, () => 'print(1)').join('\n'),
      )
      const bigStdout = Array.from({ length: 3000 }, (_, i) => `o-${i}`).join('\n')
      env.workerHost.exec = vi.fn().mockResolvedValue({
        ok: true,
        stdout: bigStdout,
        stderr: '',
        errorType: null,
        durationMs: 10,
      }) as unknown as typeof env.workerHost.exec
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch(
        'python_exec_file',
        { path: 'scripts/big.py' },
        'tc-file-big',
      )
      const details = result.details as Record<string, { truncated?: boolean }>
      expect(details.stdoutTruncation?.truncated).toBe(true)
    })
  })

  describe('fs_read', () => {
    it('正常读', async () => {
      await writeFile(env.root, 'reports/main.md', '# 报告')
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch('fs_read', { path: 'reports/main.md' }, 't')
      const details = result.details as Record<string, unknown>
      expect(details.content).toBe('# 报告')
    })

    it('文件不存在 → details.error.code=file_not_found', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch(
        'fs_read',
        { path: 'reports/nope.md' },
        't',
      )
      expect(result.isError).toBe(true)
      const details = result.details as Record<string, { code?: string }>
      expect(details.error?.code).toBe('file_not_found')
    })
  })

  describe('fs_write / fs_edit / fs_list / fs_grep 联通', () => {
    it('fs_write 然后 fs_grep 可命中', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      await dispatcher.dispatch(
        'fs_write',
        { path: 'scripts/a.py', content: 'lasso = 1' },
        't',
      )
      const r = await dispatcher.dispatch('fs_grep', { pattern: 'lasso' }, 't')
      const details = r.details as Record<string, unknown>
      expect((details.matches as unknown[]).length).toBe(1)
    })

    it('fs_edit + replace_all', async () => {
      await writeFile(env.root, 'scripts/a.py', 'foo foo foo')
      const dispatcher = createToolDispatcher(env.deps)
      const r = await dispatcher.dispatch(
        'fs_edit',
        { path: 'scripts/a.py', oldStr: 'foo', newStr: 'F', replaceAll: true },
        't',
      )
      const details = r.details as Record<string, unknown>
      expect(details.replacements).toBe(3)
    })
  })

  describe('todo_write', () => {
    it('写入并返回 stats', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      const r = await dispatcher.dispatch(
        'todo_write',
        {
          items: [
            { title: 'a', status: 'in_progress' },
            { title: 'b', status: 'pending' },
          ],
        },
        't',
      )
      const details = r.details as Record<string, unknown>
      expect(details.total).toBe(2)
      expect(details.inProgress).toBe(1)
    })
  })

  describe('ask_user', () => {
    it('挂起 promise，外部 resolve 后才完成', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      const promise = dispatcher.dispatch(
        'ask_user',
        {
          question: 'q',
          header: 'h',
          options: [{ label: 'A' }, { label: 'B' }],
        },
        'tc-x',
      )

      // 等异步任务排进队列
      await Promise.resolve()
      expect(env.askQueue.size()).toBe(1)

      env.askQueue.resolve('tc-x', { answers: [{ label: 'A', isCustom: false }] })
      const result = await promise
      const details = result.details as Record<string, unknown>
      expect((details.answers as { label: string }[])[0]?.label).toBe('A')
    })
  })

  describe('python_packages', () => {
    it('action=list：调 queryPackages("list")，返回 loaded 全量 + notLoaded 数量提示', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch('python_packages', {}, 't')
      expect(env.workerHost.queryPackages).toHaveBeenCalledWith('list', undefined)
      expect(result.isError).toBeFalsy()
      const details = result.details as Record<string, unknown>
      expect(details.action).toBe('list')
      expect(details.loadedCount).toBe(2)
      expect(details.notLoadedCount).toBe(2)
      // loaded 全量返回；notLoaded 只报数量（防上下文爆炸）
      expect((details.loaded as unknown[]).length).toBe(2)
      expect(details.notLoaded).toBeUndefined()
      expect(details.hint).toMatch(/未加载/)
    })

    it('action=load：缺 packages → invalid_arguments', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch('python_packages', { action: 'load' }, 't')
      expect(result.isError).toBe(true)
      const details = result.details as Record<string, { code?: string }>
      expect(details.error?.code).toBe('invalid_arguments')
    })

    it('action=load：返回 loadResults + 最新 loaded 清单', async () => {
      env.workerHost.queryPackages = vi.fn().mockResolvedValue({
        action: 'load',
        loaded: [
          { name: 'numpy', version: '2.0.2' },
          { name: 'networkx', version: '3.3' },
        ],
        notLoaded: [],
        loadResults: [
          { name: 'networkx', ok: true },
        ],
      }) as unknown as typeof env.workerHost.queryPackages
      const dispatcher = createToolDispatcher(env.deps)
      const result = await dispatcher.dispatch(
        'python_packages',
        { action: 'load', packages: ['networkx'] },
        't',
      )
      expect(env.workerHost.queryPackages).toHaveBeenCalledWith('load', ['networkx'])
      const details = result.details as Record<string, unknown>
      expect(details.action).toBe('load')
      expect((details.loadResults as Array<{ ok: boolean }>)[0]?.ok).toBe(true)
      expect(details.loadedCount).toBe(2)
    })
  })

  describe('未知工具', () => {
    it('返回 unknown_tool error', async () => {
      const dispatcher = createToolDispatcher(env.deps)
      const r = await dispatcher.dispatch('python_kernel_reset', {}, 't')
      expect(r.isError).toBe(true)
      const details = r.details as Record<string, { code?: string }>
      expect(details.error?.code).toBe('unknown_tool')
    })
  })
})
