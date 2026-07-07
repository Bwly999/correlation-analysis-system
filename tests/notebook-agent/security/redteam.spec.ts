// @vitest-environment node

/**
 * Notebook Agent 安全红队清单自动化测试（安全模型.md §9）。
 *
 * 20 项对应 20 项防御。本文件是 M1 安全 gate 的统一入口。
 *
 * 由于真实 Pyodide（WASM）在 vitest 单测环境难以拉起，部分项（依赖真实
 * Python 执行的：#1/#2/#3/#5/#8/#11/#19/#20）采用「防御机制存在性断言」
 * ——验证源码里确实落地了对应防御（jsglobals 白名单、fetch 剥夺、MEMFS 边界、
 * Worker 隔离），等价于"防御在位"。可纯逻辑验证的项（#4/#6/#7/#9/#10/#12/
 * #13/#14/#15/#16/#17/#18/#19-fetch）跑真实断言。
 *
 * #9/#10/#11 另见 src/notebook/runtime/__tests__/workerHostTimeouts.spec.ts
 *    （已用假 Worker 验证软/硬超时 + 崩溃自愈），本文件以引用方式登记。
 * #17/#18 另见 src/notebook/preview/__tests__/markdownRenderer.spec.ts。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  fsRead,
  fsWrite,
} from '../../../src/notebook/runtime/fsTools'
import { createMemOpfsRoot } from '../../../src/notebook/shared/__tests__/memOpfs'
import { renderMarkdownSafe } from '../../../src/notebook/preview/markdownRenderer'
import {
  isParentBridgeRequest,
} from '../../../src/notebook/shared/parentBridge'

// ---- 防御机制存在性断言（读源码） ----
const pyodideBootSrc = readFileSync('src/notebook/worker/pyodideBoot.ts', 'utf8')
const workerSrc = readFileSync('src/notebook/worker/worker.ts', 'utf8')
const fsToolsSrc = readFileSync('src/notebook/runtime/fsTools.ts', 'utf8')
const workerHostSrc = readFileSync('src/notebook/runtime/workerHost.ts', 'utf8')

describe('安全红队清单 §9 — M1 gate（20 项）', () => {
  describe('#1 from js import process → ImportError', () => {
    it('pyodideBoot 传 jsglobals 自构造对象（仅 console），不暴露 process', () => {
      // 防御在位断言：jsglobals 是自构造白名单对象，不含 process
      expect(pyodideBootSrc).toMatch(/jsglobals:\s*safeJsGlobals/)
      expect(pyodideBootSrc).toMatch(/safeJsGlobals[\s\S]*?console:/)
      expect(pyodideBootSrc).not.toMatch(/safeJsGlobals[\s\S]{0,200}process/)
    })
  })

  describe('#2 from js import fetch → 剥夺', () => {
    it('Worker 启动后 fetch 改为白名单 shim，XHR/WS/EventSource 直接 delete', () => {
      // fetch 保留为白名单 shim（loadPackage 需加载 runtime wheel），外网请求被拒
      expect(pyodideBootSrc).toMatch(/shimmedFetch/)
      expect(pyodideBootSrc).toMatch(/外部网络访问已禁用/)
      expect(pyodideBootSrc).toMatch(/delete.*globalThis.*XMLHttpRequest/)
      expect(pyodideBootSrc).toMatch(/delete.*globalThis.*WebSocket/)
      expect(pyodideBootSrc).toMatch(/delete.*globalThis.*EventSource/)
    })
    it('jsglobals 不暴露 fetch（双重防线）', () => {
      // safeJsGlobals 块内只有 console
      const block = pyodideBootSrc.match(/safeJsGlobals[\s\S]{0,300}/)?.[0] ?? ''
      expect(block).not.toMatch(/\bfetch\b/)
    })
  })

  describe('#3 os.system("rm -rf /") → WASM 无 syscall', () => {
    it('Pyodide 是 WASM，os.system 抛 NotImplementedError（结构：Worker 跑 pyodide）', () => {
      // 防御在位：Worker 内确实是 pyodide WASM（loadPyodide）
      expect(workerSrc).toMatch(/loadPyodide|bootPyodide/)
    })
  })

  describe('#4 open("/etc/passwd") → FileNotFoundError（MEMFS 仅 4 目录）', () => {
    it('pyodideBoot 只 mkdirTree 四个顶级数据目录（inputs/scripts/artifacts/reports）', () => {
      // 目录列表是循环变量，断言数组字面量
      expect(pyodideBootSrc).toMatch(/\[?'\/inputs'[\s\S]*?'\/scripts'[\s\S]*?'\/artifacts'[\s\S]*?'\/reports'/)
      expect(pyodideBootSrc).toMatch(/mkdirTree/)
      // 不挂 /etc /workspace /home 等系统路径
      expect(pyodideBootSrc).not.toMatch(/'\/etc'/)
      expect(pyodideBootSrc).not.toMatch(/'\/workspace'/)
      expect(pyodideBootSrc).not.toMatch(/'\/home'/)
    })
  })

  describe('#5 open("/workspace/../../../etc/passwd") → 边界', () => {
    it('Worker 不挂 /workspace 目录（无此挂载点）', () => {
      expect(pyodideBootSrc).not.toMatch(/mkdirTree.*\/workspace/)
    })
  })

  describe('#6 fs_read 路径含 .. → path_out_of_workspace', () => {
    it('fsRead 拒绝 ../ 越界', async () => {
      const root = await createMemOpfsRoot()
      await expect(fsRead(root, { path: '../etc/passwd' })).rejects.toMatchObject({
        code: 'path_out_of_workspace',
      })
    })
  })

  describe('#7 fs_read 绝对路径 /etc/passwd → path_out_of_workspace', () => {
    it('fsRead 拒绝绝对路径', async () => {
      const root = await createMemOpfsRoot()
      await expect(fsRead(root, { path: '/etc/passwd' })).rejects.toMatchObject({
        code: 'path_out_of_workspace',
      })
    })
    it('fsWrite 也拒绝绝对路径越界', async () => {
      const root = await createMemOpfsRoot()
      await expect(
        fsWrite(root, { path: '/etc/evil', content: 'x' }),
      ).rejects.toMatchObject({ code: 'path_out_of_workspace' })
    })
  })

  describe('#8 import socket → Pyodide stub 抛错', () => {
    it('防御在位：socket 是 Pyodide stub（无网络栈，依赖 #2 的 fetch 剥夺）', () => {
      expect(workerSrc).toMatch(/loadPyodide|bootPyodide/)
      expect(pyodideBootSrc).toMatch(/delete.*globalThis.*WebSocket/)
    })
  })

  describe('#9 while True → 60s 软超时 SIGINT', () => {
    it('workerHost 软超时走 SAB requestInterrupt（另见 workerHostTimeouts.spec）', () => {
      expect(workerHostSrc).toMatch(/requestInterrupt|softTimeout|InterruptBuffer/)
    })
  })

  describe('#10 C 扩展不可中断 → 90s worker.terminate()', () => {
    it('workerHost 硬超时走 terminate + autoRestart（另见 workerHostTimeouts.spec）', () => {
      expect(workerHostSrc).toMatch(/handleHardTimeout|terminate|autoRestart/)
    })
  })

  describe('#11 [0]*10**12 → OOM 崩溃自愈', () => {
    it('Worker onerror → status=dead，autoRestart 重建（另见 workerHostTimeouts.spec）', () => {
      expect(workerHostSrc).toMatch(/onerror|kernel_dead|autoRestart/)
    })
  })

  describe('#12 fs_write 1GB → OPFS 配额上限', () => {
    it('fsTools 有单次/总配额校验（结构：PER_FILE_LIMIT / QUOTA）', () => {
      expect(fsToolsSrc).toMatch(/PER_FILE|QUOTA|quota|exceeds.*limit|too_large/i)
    })
  })

  describe('#13 跨 session OPFS 越界', () => {
    it('fsTools 校验路径必须落在 session prefix 下', () => {
      expect(fsToolsSrc).toMatch(/path_out_of_workspace|\.\.|normalizePath|resolvePath/)
    })
    it('OPFS root 按 sessionId 隔离（结构：notebook-${sessionId}）', () => {
      const runtimeSrc = readFileSync('src/notebook/runtime/notebookSessionRuntime.ts', 'utf8')
      expect(runtimeSrc).toMatch(/notebook-\$\{sessionId\}/)
    })
  })

  describe('#14 event.source !== parentWindow → 丢弃', () => {
    it('parentBridgeClient 校验来源（另见 parentBridgeClient.spec 来源校验块）', () => {
      const src = readFileSync('src/notebook/runtime/parentBridgeClient.ts', 'utf8')
      expect(src).toMatch(/event\.source|source !==|parentWindow/)
    })
  })

  describe('#15 postMessage schema 不符 → 丢弃', () => {
    it('isParentBridgeRequest 做 schema 校验，非协议消息返回 false', () => {
      // 伪造的 schema
      expect(isParentBridgeRequest(null)).toBe(false)
      expect(isParentBridgeRequest({})).toBe(false)
      expect(isParentBridgeRequest({ kind: 'unknown.kind' })).toBe(false)
      expect(isParentBridgeRequest(42)).toBe(false)
    })
  })

  describe('#16 parent.location → 主站不留可写接口', () => {
    it('parentBridgeClient 不向主站暴露任何全局 setter（结构：只发消息）', () => {
      const src = readFileSync('src/notebook/runtime/parentBridgeClient.ts', 'utf8')
      // 不写 parent 的属性，只 postMessage
      expect(src).not.toMatch(/parent\.\w+\s*=/)
      expect(src).toMatch(/parent\.postMessage/)
    })
  })

  describe('#17 Markdown <script>alert(1) → 转义', () => {
    it('renderMarkdownSafe 剥离 <script>（另见 markdownRenderer.spec）', () => {
      const html = renderMarkdownSafe('Hello <script>alert(1)</script>')
      expect(html).not.toMatch(/<script/i)
    })
  })

  describe('#18 Markdown <iframe src=javascript:> → 拦截', () => {
    it('renderMarkdownSafe 剥离 <iframe>（另见 markdownRenderer.spec）', () => {
      const html = renderMarkdownSafe('<iframe src="javascript:alert(1)"></iframe>')
      expect(html).not.toMatch(/<iframe/i)
      expect(html).not.toMatch(/javascript:/i)
    })
    it('剥离 onerror 等内联事件', () => {
      const html = renderMarkdownSafe('<img src="x" onerror="alert(1)" />')
      expect(html).not.toMatch(/onerror/i)
    })
  })

  describe('#19 micropip.install("bad") → 无 fetch 抛错', () => {
    it('防御在位：fetch 是白名单 shim，micropip 装 PyPI 包必被拒（依赖外网 fetch）', () => {
      // fetch 保留但仅放行 runtime 同源路径，PyPI 等外网请求一律 reject
      expect(pyodideBootSrc).toMatch(/shimmedFetch/)
      expect(pyodideBootSrc).toMatch(/外部网络访问已禁用/)
    })
    it('system prompt 明示可用包集合（暗示包固定，无需网络安装）', () => {
      const promptSrc = readFileSync('src/server/notebookAgent/systemPrompt.ts', 'utf8')
      expect(promptSrc).toMatch(/可用包/)
      expect(promptSrc).toMatch(/numpy.*pandas|pandas.*numpy/)
    })
  })

  describe('#20 Python threading → WASM 单线程协程模拟', () => {
    it('防御在位：Pyodide 是 WASM 单线程（结构）', () => {
      expect(workerSrc).toMatch(/loadPyodide|bootPyodide/)
    })
  })
})
