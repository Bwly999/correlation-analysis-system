/**
 * Pyodide 启动 + 安全锁定。
 *
 * 关键决策（详见 docs/design-doc/notebook-agent/安全模型.md）：
 *
 * 1) jsglobals 显式白名单：
 *    Python 端 `from js import xxx` 默认能拿到 self/globalThis 上的所有内容。
 *    我们传 jsglobals 自己构造的对象，只暴露 console，让 `from js import process`、
 *    `from js import importScripts` 等全部抛 ImportError。
 *
 * 2) fullStdLib: false：
 *    不打开 socket、ssl 等模块。运行时按需 loadPackage。
 *
 * 3) 不暴露 fetch / XMLHttpRequest：
 *    Worker 内 `self.fetch` 和 `self.XMLHttpRequest` 在加载完 Pyodide 后立即 delete，
 *    防止 Python 通过 pyodide.runPythonAsync('await fetch(...)') 这种通过 micropip 等
 *    路径触达 fetch（保险锁，主防线仍是 jsglobals）。
 */

import type { PyodideInterface } from 'pyodide'

export interface BootResult {
  pyodide: PyodideInterface
  pyodideVersion: string
}

export interface BootOptions {
  pyodideIndexUrl: string
  interruptBuffer: SharedArrayBuffer | null
  onProgress: (stage: string, detail?: string) => void
}

/** 安全 console 代理：只允许 log/warn/error/info，转发到 Worker postMessage */
const makeSafeConsole = (post: (level: string, args: unknown[]) => void) => {
  const proxy = (level: string) => (...args: unknown[]) => {
    post(level, args)
  }
  return {
    log: proxy('log'),
    warn: proxy('warn'),
    error: proxy('error'),
    info: proxy('info'),
    debug: () => {},
  }
}

export const bootPyodide = async (opts: BootOptions): Promise<BootResult> => {
  opts.onProgress('loading_runtime', '加载 pyodide.asm.wasm')

  // Vite ?worker 生成的是 module worker，importScripts 不可用。
  // Pyodide 0.27 的 loadPyodide 会先试 importScripts，捕获 TypeError 后 fallback
  // 到 await import('pyodide.mjs')。Chrome module worker 抛的是 DOMException，
  // 这里 shim 成 TypeError，让 fallback 生效。
  ;(globalThis as { importScripts?: (...urls: string[]) => void }).importScripts = () => {
    throw new TypeError('importScripts is disabled in module workers')
  }

  const pyodideModule = (await import(
    /* @vite-ignore */ `${opts.pyodideIndexUrl}pyodide.mjs`
  )) as { loadPyodide: (config: unknown) => Promise<PyodideInterface> }
  const loadPyodide = pyodideModule.loadPyodide

  // 1) 构造受限 jsglobals
  //    注意：Python 侧 from js import 是基于「这个对象的 own/inherited 属性」判断的。
  //    我们传一个全新的普通对象，只挂 console，其他什么都没有。
  const safeJsGlobals: Record<string, unknown> = {
    console: makeSafeConsole((level, args) => {
      // 转发到主线程，便于调试
      ;(globalThis as { postMessage?: (m: unknown) => void }).postMessage?.({
        kind: 'exec_stream',
        requestId: '__console__',
        stream: level === 'error' ? 'stderr' : 'stdout',
        chunk: `[js.console.${level}] ${args.map((a) => String(a)).join(' ')}\n`,
      })
    }),
  }

  const pyodide = await loadPyodide({
    indexURL: opts.pyodideIndexUrl,
    lockFileURL: `${opts.pyodideIndexUrl}pyodide-lock.json`,
    packageBaseUrl: opts.pyodideIndexUrl,
    jsglobals: safeJsGlobals,
    fullStdLib: false,
    // 默认 stdout/stderr 走 console；我们后续在 exec 入口替换
  })

  // 2) 安全锁：删掉 Worker 全局上的 fetch / XMLHttpRequest（防 micropip 等模块绕过）
  //    Pyodide 0.27 在 Worker 内部仍然能找到 self.fetch；删它不会影响 wheel 加载
  //    （wheel 加载发生在 loadPyodide 内部，此时还没 delete）
  try {
    delete (globalThis as Record<string, unknown>).fetch
    delete (globalThis as Record<string, unknown>).XMLHttpRequest
    delete (globalThis as Record<string, unknown>).WebSocket
    delete (globalThis as Record<string, unknown>).EventSource
    delete (globalThis as Record<string, unknown>).importScripts
  } catch {
    // 部分 runtime 这些是 non-configurable，吞掉
  }

  // 3) 中断 buffer
  if (opts.interruptBuffer) {
    pyodide.setInterruptBuffer(new Uint8Array(opts.interruptBuffer))
  }

  // 4) 加载 Notebook M1 默认分析包集
  opts.onProgress('loading_packages', 'numpy + pandas + scipy + scikit-learn + matplotlib + statsmodels')
  await pyodide.loadPackage([
    'numpy',
    'pandas',
    'scipy',
    'scikit-learn',
    'matplotlib',
    'statsmodels',
  ])

  // 5) 创建工作区固定目录骨架（MEMFS 内）。
  //    inputs/   主站 import_csv 灌入数据
  //    scripts/  Agent fs_write 脚本
  //    artifacts/ Agent 产物（图、中间数据）
  //    reports/  Agent 撰写的报告
  //    架构上 OPFS 才是事实持久层，MEMFS 内的同名目录用作 Pyodide 端可见的工作区，
  //    通过 iframe 主线程在两者之间双向 sync（详见 docs/design-doc/notebook-agent/架构与数据流.md §3.4）。
  for (const dir of ['/inputs', '/scripts', '/artifacts', '/reports']) {
    try {
      pyodide.FS.mkdirTree(dir)
    } catch {
      // mkdirTree 在已存在时也可能抛 EEXIST，忽略
    }
  }

  // 让 python_exec_* 的相对路径与工作区根目录对齐。
  pyodide.FS.chdir('/')

  opts.onProgress('locking', 'sealing globals')
  // 6) 冻结 pyodide 对象本身，防止 Python 通过 sys 模块改其属性
  //    （这是对 host 端的保护，Python 侧仍能正常用）
  Object.freeze(safeJsGlobals)

  opts.onProgress('ready')
  return {
    pyodide,
    pyodideVersion: pyodide.version,
  }
}

/**
 * 在 Pyodide 内执行一段 Python 代码，捕获 stdout/stderr。
 *
 * 无状态语义：每次新建一个 module dict 作为 globals，
 * 与上一次 exec 互不影响（除了 sys.modules 缓存，那是预期内的）。
 */
export interface ExecOutcome {
  stdout: string
  stderr: string
  errorType: null | 'syntax_error' | 'runtime_error' | 'interrupted'
  errorMessage?: string
  traceback?: string
}

export const execPython = async (
  pyodide: PyodideInterface,
  code: string,
): Promise<ExecOutcome> => {
  let stdout = ''
  let stderr = ''

  pyodide.setStdout({
    batched: (text) => {
      stdout += text
    },
  })
  pyodide.setStderr({
    batched: (text) => {
      stderr += text
    },
  })

  // 每次新建 globals dict，达成无状态语义
  const globalsHandle = pyodide.toPy({})
  try {
    await pyodide.runPythonAsync(code, { globals: globalsHandle })
    return { stdout, stderr, errorType: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // pyodide 把 KeyboardInterrupt 包成普通 Error，需要从 message 关键字识别
    const isInterrupt = /KeyboardInterrupt/i.test(message)
    const isSyntax = /SyntaxError/i.test(message)
    return {
      stdout,
      stderr,
      errorType: isInterrupt ? 'interrupted' : isSyntax ? 'syntax_error' : 'runtime_error',
      errorMessage: message,
      traceback: message,
    }
  } finally {
    // 释放 PyProxy，避免内存泄漏
    if (
      globalsHandle &&
      typeof (globalsHandle as { destroy?: () => void }).destroy === 'function'
    ) {
      ;(globalsHandle as { destroy: () => void }).destroy()
    }
  }
}
