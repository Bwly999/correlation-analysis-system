/**
 * Notebook Agent bootstrap 竞态回归 spec（E2E）。
 *
 * 验收目标（对应 plan §测试方案）：
 *   - 修复后：导入完成（session ready）前无 bootstrap，ready 后才出现首轮 agent 事件。
 *   - 同一会话 bootstrap 只触发一次（重复 ready 幂等）。
 *   - 不依赖真实模型输出（真实 LLM 不稳定）：ready 前的"无 agent 事件"是确定性断言；
 *     ready 后若环境无可用模型，bootstrap 触发判定宽松处理（打印观测，不阻断回归）。
 *
 * 为什么用浏览器上下文的 fetch 而非 Playwright APIRequestContext：
 *   events 是 ndjson/SSE 流式响应，APIRequestContext.get 会等响应体结束才 resolve，
 *   流不结束 → 默认 30s 超时。在 page.evaluate 里用浏览器原生 fetch + ReadableStream
 *   才能边读边消费、按时间窗截断。
 *
 * 前置：
 *   - dev server 起在 DEV_ORIGIN（默认 http://localhost:5173，pnpm dev）。
 *   - 全局或本地有 playwright（见 helpers/playwrightResolver.mjs）。
 *
 * 运行：
 *   node e2e/notebook-bootstrap-race.spec.mjs
 */

import assert from 'node:assert/strict'

import { launchBrowser } from './helpers/playwrightResolver.mjs'

const DEV_ORIGIN = process.env.DEV_ORIGIN || 'http://localhost:5173'

/**
 * 在浏览器上下文里创建 session 并观测 events 流。
 * observer 接收一个已创建的 sessionId，在浏览器里订阅 events，
 * 在 ready 前的窗口内断言无 agent 事件；可选地发 ready 后继续观测。
 */
const runScenarioInPage = async (page, scenario) => {
  return page.evaluate(
    async ({ origin, scenario }) => {
      const headers = {
        'x-workflow-user-id': 'e2e-race',
        'x-workflow-user-name': 'e2e',
      }
      const t0 = performance.now()
      const log = []
      const mark = (label) => log.push({ t: Math.round(performance.now() - t0), label })

      // 创建 session
      const createRes = await fetch(`${origin}/api/notebook-agent/sessions`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialDataMeta: scenario.initialDataMeta,
          origin,
        }),
      })
      if (!createRes.ok) {
        return { ok: false, error: `create failed ${createRes.status}`, log }
      }
      const { sessionId } = await createRes.json()
      mark(`session_created:${sessionId}`)

      // 订阅 events（浏览器原生 fetch，可读流）
      const evtRes = await fetch(`${origin}/api/notebook-agent/sessions/${sessionId}/events`, {
        headers,
      })
      mark(`events_status:${evtRes.status}`)
      if (!evtRes.ok) {
        return { ok: false, error: `events failed ${evtRes.status}`, log, sessionId }
      }

      const reader = evtRes.body.getReader()
      const decoder = new TextDecoder()
      const agentEventTypes = ['session.status', 'message.start', 'message.delta', 'tool.start', 'error']
      const seenAgentEvents = []
      let buf = ''
      let preWindowAgentSeen = false

      const drainFor = async (ms) => {
        const deadline = performance.now() + ms
        while (performance.now() < deadline) {
          const timeout = Math.max(0, deadline - performance.now())
          const read = await Promise.race([
            reader.read(),
            new Promise((resolve) => setTimeout(() => resolve({ done: true, timedOut: true }), timeout)),
          ])
          if (read.done) break
          if (read.timedOut) break
          buf += decoder.decode(read.value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            let evt
            try {
              evt = JSON.parse(payload)
            } catch {
              continue
            }
            const at = Math.round(performance.now() - t0)
            mark(`event:${evt.type}`)
            if (agentEventTypes.includes(evt.type)) seenAgentEvents.push({ at, type: evt.type })
          }
        }
      }

      // ready 前观测窗口
      await drainFor(scenario.preReadyWindowMs)
      preWindowAgentSeen = seenAgentEvents.length > 0
      mark(`pre_ready_check:agent_seen=${preWindowAgentSeen}`)

      let readyStatus = null
      if (scenario.sendReady) {
        const readyRes = await fetch(`${origin}/api/notebook-agent/sessions/${sessionId}/ready`, {
          method: 'POST',
          headers,
        })
        readyStatus = readyRes.status
        mark(`ready_status:${readyStatus}`)
        // ready 后观测窗口
        await drainFor(scenario.postReadyWindowMs)
      }

      reader.cancel()
      mark(`done:agent_events=${seenAgentEvents.length}`)

      return {
        ok: true,
        sessionId,
        log,
        readyStatus,
        preWindowAgentSeen,
        agentEvents: seenAgentEvents,
      }
    },
    { origin: DEV_ORIGIN, scenario },
  )
}

// ---------- 断言集合 ----------

/** 修复后：仅订阅 events，ready 前不应有任何 agent 启动事件流出。竞态修复的核心断言。 */
const test_subscribeDoesNotBootstrap = async (page) => {
  const result = await runScenarioInPage(page, {
    initialDataMeta: { sourceKind: 'canvas-node', sourceLabel: 'e2e-subscribe', rowCount: 10, columnCount: 3 },
    preReadyWindowMs: Number(process.env.E2E_PRE_READY_WINDOW_MS || 1500),
    sendReady: false,
  })
  assert.ok(result.ok, `场景异常：${result.error}`)
  assert.equal(
    result.preWindowAgentSeen,
    false,
    `仅订阅 events 不应触发 bootstrap，但窗口内出现 agent 事件：${JSON.stringify(result.agentEvents)}\n日志：${JSON.stringify(result.log)}`,
  )
}

/** 修复后：ready 前无 agent 事件；ready 路由返回 200。 */
const test_readyAfterSubscribe = async (page) => {
  const result = await runScenarioInPage(page, {
    initialDataMeta: { sourceKind: 'canvas-node', sourceLabel: 'e2e-ready', rowCount: 10, columnCount: 3 },
    preReadyWindowMs: Number(process.env.E2E_PRE_READY_WINDOW_MS || 1000),
    sendReady: true,
    postReadyWindowMs: Number(process.env.E2E_POST_READY_WINDOW_MS || 4000),
  })
  assert.ok(result.ok, `场景异常：${result.error}`)
  assert.equal(
    result.preWindowAgentSeen,
    false,
    `ready 前不应有 agent 事件：${JSON.stringify(result.agentEvents)}\n日志：${JSON.stringify(result.log)}`,
  )
  assert.equal(result.readyStatus, 200, 'ready 路由应返回 200')
}

/** 重复 ready 幂等：协议入口可重复调用，始终 200（去重由服务端保证）。 */
const test_readyIsIdempotent = async (page) => {
  const created = await page.evaluate(async (origin) => {
    const headers = { 'x-workflow-user-id': 'e2e-race', 'x-workflow-user-name': 'e2e' }
    const res = await fetch(`${origin}/api/notebook-agent/sessions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initialDataMeta: { sourceKind: 'canvas-node', sourceLabel: 'e2e-idem', rowCount: 1, columnCount: 1 },
        origin,
      }),
    })
    return (await res.json()).sessionId
  }, DEV_ORIGIN)

  const statuses = await page.evaluate(
    async ({ origin, sessionId }) => {
      const headers = { 'x-workflow-user-id': 'e2e-race', 'x-workflow-user-name': 'e2e' }
      // 先订阅，让 bootstrap 条件可达成
      await fetch(`${origin}/api/notebook-agent/sessions/${sessionId}/events`, { headers })
      const s1 = await fetch(`${origin}/api/notebook-agent/sessions/${sessionId}/ready`, { method: 'POST', headers })
      const s2 = await fetch(`${origin}/api/notebook-agent/sessions/${sessionId}/ready`, { method: 'POST', headers })
      return [s1.status, s2.status]
    },
    { origin: DEV_ORIGIN, sessionId: created },
  )
  assert.deepEqual(statuses, [200, 200], `重复 ready 应均返回 200，实际：${statuses}`)
}

// ---------- runner ----------

const run = async () => {
  const { browser, source } = await launchBrowser({ headless: true })
  console.log(`[e2e] playwright 来源: ${source}`)
  console.log(`[e2e] 目标 dev server: ${DEV_ORIGIN}`)

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(DEV_ORIGIN).catch(() => {
    /* 页面本身不关键，只需同源上下文跑 fetch */
  })

  const results = []
  const cases = [
    ['仅订阅 events 不触发 bootstrap', () => test_subscribeDoesNotBootstrap(page)],
    ['ready 前无 agent 事件，ready 返回 200', () => test_readyAfterSubscribe(page)],
    ['ready 路由幂等', () => test_readyIsIdempotent(page)],
  ]

  for (const [name, fn] of cases) {
    try {
      await fn()
      results.push({ name, ok: true })
      console.log(`  ✓ ${name}`)
    } catch (err) {
      results.push({ name, ok: false, err: err.message })
      console.error(`  ✗ ${name}\n      ${err.message}`)
    }
  }

  await context.close()
  await browser.close()

  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.error(`\n[e2e] ${failed.length}/${results.length} 用例失败`)
    process.exitCode = 1
  } else {
    console.log(`\n[e2e] 全部 ${results.length} 用例通过`)
  }
}

run().catch((err) => {
  console.error('[e2e] 运行异常:', err)
  process.exitCode = 1
})
