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
 * 3) fetch 白名单 shim（替代早期的 delete）：
 *    早期实现是加载完 Pyodide 后立即 `delete self.fetch`，彻底切断网络。
 *    但这使得 exec 阶段无法用 `pyodide.loadPackage()` 按需加载 runtime 内已有但未预装的包
 *    （loadPackage 命中本地 wheel 时内部仍会走 fetch(localUrl) 取字节）。
 *    现改为把 self.fetch 替换成**只允许 pyodideIndexUrl 同源前缀**的 shim：
 *      - 本地 runtime wheel（/pyodide/v0.27/...）：放行，供按需加载使用
 *      - 任何其他 URL（PyPI / jsdelivr / 外网）：抛 Error，micropip 装外部包仍被阻断
 *    安全边界与早期 delete 一致：外部网络访问完全禁用，仅多放行同源 runtime 资源。
 *    详见 docs/design-doc/notebook-agent/安全模型.md §6.2。
 */

import type { PyodideInterface } from 'pyodide'

export interface RuntimePackageMeta {
  name: string
  version: string
}

export interface BootResult {
  pyodide: PyodideInterface
  pyodideVersion: string
  /** runtime lock 内全部包的 name+version，供 python_packages 工具查询加载状态 */
  runtimePackages: RuntimePackageMeta[]
}

export interface BootOptions {
  pyodideIndexUrl: string
  interruptBuffer: SharedArrayBuffer | null
  onProgress: (stage: string, detail?: string, percent?: number) => void
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
  opts.onProgress('importing_pyodide', '正在加载 Pyodide 模块', 18)

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

  opts.onProgress('loading_runtime', '正在启动 Python 运行时', 35)

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

  // 2) 安全锁：fetch 改为白名单 shim，其余网络 API 直接 delete
  //    fetch：只允许访问 pyodideIndexUrl 同源路径（本地 runtime wheel / 字体），
  //           拒绝任何其他来源，使 micropip 装 PyPI 包仍被阻断。
  //           保留而非 delete，是为了让 exec 阶段 loadPackage 能按需加载未预装包。
  //    XMLHttpRequest / WebSocket / EventSource：Pyodide loadPackage 不依赖它们，直接 delete。
  //
  //    注意：Pyodide 内部 loadPackage 用 new URL(wheel, location) 解析出**绝对 URL**
  //    （如 http://localhost:5173/pyodide/v0.27/numpy-*.whl），不能再用相对前缀字符串匹配。
  //    改用 URL 解析后比 pathname：相对/绝对 URL 都能正确归一，跨源请求（外网）被 hostname 校验拦掉。
  const nativeFetch = globalThis.fetch
  if (typeof nativeFetch === 'function') {
    // pyodideIndexUrl 形如 '/pyodide/v0.27/'，转成绝对 base 供 URL 解析比较
    const allowedBase = new URL(opts.pyodideIndexUrl, globalThis.location?.href ?? 'http://self')
    const allowedPathPrefix = allowedBase.pathname // '/pyodide/v0.27/'
    const allowedHost = allowedBase.host
    type FetchArgs = Parameters<typeof nativeFetch>
    const shimmedFetch = (...args: FetchArgs) => {
      const input = args[0]
      const inputUrl =
        typeof input === 'string'
          ? new URL(input, globalThis.location?.href ?? 'http://self')
          : input instanceof URL
            ? input
            : new URL((input as Request).url, globalThis.location?.href ?? 'http://self')
      // 同源 + pathname 落在 runtime 前缀下才放行；外网（PyPI / jsdelivr 等）一律拒
      const sameOrigin = inputUrl.host === allowedHost
      const inRuntime = inputUrl.pathname.startsWith(allowedPathPrefix)
      if (!sameOrigin || !inRuntime) {
        return Promise.reject(
          new Error(
            `外部网络访问已禁用（仅允许 ${allowedBase.origin}${allowedPathPrefix}，得到 ${inputUrl.href}）`,
          ),
        )
      }
      return nativeFetch(...args)
    }
    ;(globalThis as Record<string, unknown>).fetch = shimmedFetch
  }
  try {
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
  //    逐个加载以汇报真实进度，detail 显示当前包名
  const PACKAGES = [
    'numpy',
    'pandas',
    'scipy',
    'scikit-learn',
    'matplotlib',
    'seaborn',
    'statsmodels',
  ]
  const PKG_PROGRESS_START = 60
  const PKG_PROGRESS_END = 83
  for (let i = 0; i < PACKAGES.length; i++) {
    const pct = PKG_PROGRESS_START + Math.round((i / PACKAGES.length) * (PKG_PROGRESS_END - PKG_PROGRESS_START))
    opts.onProgress('loading_packages', `正在加载 ${PACKAGES[i]}`, pct)
    await pyodide.loadPackage(PACKAGES[i])
  }

  // 4.5) 注入中文字体
  //      matplotlib 默认只捆绑 DejaVu Sans，不含中文字形，画中文会出现「豆腐块」。
  //      此处拉取字体写入 MEMFS 并注册到 fontManager。
  //      sys.modules 跨 exec 持久，注册一次后续所有 python_exec_* 都默认中文可用。
  //      字体缺失/加载失败不阻断 boot，仅退化原行为（中文显示为方块）。
  //      字体 URL 为 /pyodide/v0.27/fonts/...，fetch 白名单 shim 会放行。
  await configureChineseFont(pyodide, opts.pyodideIndexUrl, opts.onProgress)

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

  // 7) 读 pyodide-lock.json，提取 runtime 内全部包的 name+version
  //    供 python_packages 工具查询加载状态（action=list 时遍历判断 loaded/notLoaded）。
  //    fetch 走 §6.2 白名单 shim（同源 /pyodide/v0.27/ 前缀放行）。失败降级为空数组。
  let runtimePackages: RuntimePackageMeta[] = []
  try {
    const lockResp = await fetch(`${opts.pyodideIndexUrl}pyodide-lock.json`)
    if (lockResp.ok) {
      const lock = (await lockResp.json()) as {
        packages?: Record<string, { name?: string; version?: string }>
      }
      runtimePackages = Object.values(lock.packages ?? {})
        .filter((p) => p && typeof p.name === 'string' && typeof p.version === 'string')
        .map((p) => ({ name: p.name as string, version: p.version as string }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
  } catch {
    // lock 读失败：python_packages 工具的 list 仍能报告 loadedPackages（来自 pyodide.loadedPackages），
    // 只是 notLoaded 清单会缺失。降级不阻断 boot。
  }

  opts.onProgress('ready')
  return {
    pyodide,
    pyodideVersion: pyodide.version,
    runtimePackages,
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

/**
 * 中文字体文件名（位于 ops/pyodide-runtime/v0.27.x/fonts/，随构建进入 public/pyodide/v0.27/fonts/）。
 *
 * 如需换字体：把新字体 .ttf 放到上述 fonts 目录，并同步修改：
 *   1) 这里的 ZH_FONT_FILE（文件名）
 *   2) 下面的 ZH_FONT_FAMILY（matplotlib font_manager 里识别的字体名，即 PostScript/name）
 * 字体推荐思源黑体（Noto Sans SC，OFL-1.1 许可，可商用）。
 */
const ZH_FONT_FILE = 'NotoSansSC-Regular.ttf'
const ZH_FONT_FAMILY = 'Noto Sans SC'

/**
 * 拉取并注册中文字体到 matplotlib。
 *
 * 在 boot 阶段调用：
 *   1) fetch 字体字节 → 写入 MEMFS /fonts/
 *   2) matplotlib.fontManager.addfont + 设 rcParams，使后续 savefig 默认用中文字体
 *
 * 字体 URL 为 /pyodide/v0.27/fonts/...，fetch 白名单 shim 放行。
 * 失败（字体缺失/网络错/Python 执行错）一律吞掉并打 progress，不阻断 boot。
 */
const configureChineseFont = async (
  pyodide: PyodideInterface,
  indexUrl: string,
  onProgress: (stage: string, detail?: string) => void,
): Promise<void> => {
  const fontUrl = `${indexUrl}fonts/${ZH_FONT_FILE}`
  let resp: Response
  try {
    resp = await fetch(fontUrl)
  } catch (err) {
    onProgress('loading_packages', `中文字体跳过：fetch 失败 ${err instanceof Error ? err.message : ''}`)
    return
  }
  if (!resp.ok) {
    onProgress(
      'loading_packages',
      `中文字体跳过：HTTP ${resp.status}（请把 ${ZH_FONT_FILE} 放到 ops/pyodide-runtime/v0.27.x/fonts/）`,
    )
    return
  }

  try {
    const buf = new Uint8Array(await resp.arrayBuffer())
    try {
      pyodide.FS.mkdirTree('/fonts')
    } catch {
      // 已存在忽略
    }
    pyodide.FS.writeFile(`/fonts/${ZH_FONT_FILE}`, buf)

    await pyodide.runPythonAsync(
      [
        'import matplotlib',
        "matplotlib.use('Agg')",
        'import matplotlib.font_manager as fm',
        'import matplotlib.pyplot as plt',
        `fm.fontManager.addfont('/fonts/${ZH_FONT_FILE}')`,
        `plt.rcParams['font.sans-serif'] = ['${ZH_FONT_FAMILY}', 'DejaVu Sans']`,
        `plt.rcParams['axes.unicode_minus'] = False`,
      ].join('\n'),
    )
    onProgress('loading_packages', '中文字体就绪')
  } catch (err) {
    onProgress(
      'loading_packages',
      `中文字体跳过：注册失败 ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
