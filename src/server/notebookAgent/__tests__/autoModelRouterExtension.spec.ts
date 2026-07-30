import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import type { WorkflowAiModelProfile } from '../../../ai/types.js'
import { __resetModelConcurrencyForTest } from '../modelConcurrencyRegistry.js'
import { createAutoRouterController } from '../autoModelRouterExtension.js'

// 捕获 handler 的 mock ExtensionAPI
type Handler = (event: any, ctx: any) => Promise<any | void> | any | void
interface CapturedApi {
  handlers: Map<string, Handler>
  setModel: ReturnType<typeof vi.fn>
  api: ExtensionAPI
}

const createCapturedApi = (): CapturedApi => {
  const handlers = new Map<string, Handler>()
  const setModel = vi.fn().mockResolvedValue(true)
  const api = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler)
    }),
    setModel,
  } as unknown as ExtensionAPI
  return { handlers, setModel, api }
}

const mkProfile = (over: Partial<WorkflowAiModelProfile>): WorkflowAiModelProfile => ({
  id: 'p',
  name: 'p',
  baseUrl: 'https://a.com/v1',
  model: 'm',
  enabled: true,
  source: 'system',
  ...over,
})

// 调用捕获的 handler（模拟 SDK emit）
const call = (captured: CapturedApi, event: string, ev: any = { type: event }, ctx: any = {}) =>
  captured.handlers.get(event)?.(ev, ctx)

describe('autoModelRouterExtension', () => {
  beforeEach(() => __resetModelConcurrencyForTest())

  it('before_agent_start：无并发限制时直接 setModel 第一个候选', async () => {
    const profiles = [mkProfile({ id: 'a', priority: 1 }), mkProfile({ id: 'b', priority: 2 })]
    const models = new Map([
      ['a', { id: 'a' } as any],
      ['b', { id: 'b' } as any],
    ])
    const switched: string[] = []
    const ctrl = createAutoRouterController({
      profiles,
      availableModels: models,
      onModelSwitched: (id) => switched.push(id),
      onModelError: () => {},
    })
    const captured = createCapturedApi()
    ctrl.extensionFactory(captured.api)

    await call(captured, 'before_agent_start')

    expect(captured.setModel).toHaveBeenCalledWith(models.get('a'))
    expect(switched).toEqual(['a'])
  })

  it('粘性：连续两轮使用同一模型，仅 setModel 一次', async () => {
    const profiles = [mkProfile({ id: 'a', priority: 1, maxConcurrency: 5 })]
    const models = new Map([['a', { id: 'a' } as any]])
    const switched: string[] = []
    const ctrl = createAutoRouterController({
      profiles,
      availableModels: models,
      onModelSwitched: (id) => switched.push(id),
      onModelError: () => {},
    })
    const captured = createCapturedApi()
    ctrl.extensionFactory(captured.api)

    // 第一轮
    await call(captured, 'before_agent_start')
    await call(captured, 'agent_end')
    // 第二轮
    await call(captured, 'before_agent_start')

    expect(switched).toEqual(['a']) // 第二轮粘性命中，不再 setModel
  })

  it('降级：优先模型占满时自动切到下一个空闲', async () => {
    const profiles = [
      mkProfile({ id: 'a', priority: 1, maxConcurrency: 1, baseUrl: 'https://a.com/v1' }),
      mkProfile({ id: 'b', priority: 2, maxConcurrency: 1, baseUrl: 'https://b.com/v1' }),
    ]
    const models = new Map([
      ['a', { id: 'a' } as any],
      ['b', { id: 'b' } as any],
    ])
    const switched: string[] = []
    const ctrl = createAutoRouterController({
      profiles,
      availableModels: models,
      onModelSwitched: (id) => switched.push(id),
      onModelError: () => {},
    })
    const captured = createCapturedApi()
    ctrl.extensionFactory(captured.api)

    // 预先用外部占用占满 a（模拟别处占用）
    const { tryAcquire } = await import('../modelConcurrencyRegistry.js')
    tryAcquire('https://a.com/v1::m', 1) // 占满 a

    await call(captured, 'before_agent_start')

    expect(switched).toEqual(['b'])
    expect(captured.setModel).toHaveBeenCalledWith(models.get('b'))
  })

  it('全部占满 + 排队超时：before_provider_request 触发 abort + onModelError', async () => {
    const profiles = [mkProfile({ id: 'a', priority: 1, maxConcurrency: 1 })]
    const models = new Map([['a', { id: 'a' } as any]])
    let errMsg = ''
    const ctrl = createAutoRouterController({
      profiles,
      availableModels: models,
      onModelSwitched: () => {},
      onModelError: ({ message }) => (errMsg = message),
    })
    const captured = createCapturedApi()
    ctrl.extensionFactory(captured.api)

    const { tryAcquire } = await import('../modelConcurrencyRegistry.js')
    tryAcquire('https://a.com/v1::m', 1) // 占满

    vi.useFakeTimers()
    const startPromise = call(captured, 'before_agent_start')
    await vi.advanceTimersByTimeAsync(35_000)
    await startPromise
    vi.useRealTimers()

    // 排队超时后 before_provider_request 应 abort 并报错
    const aborted = vi.fn()
    await call(captured, 'before_provider_request', { type: 'before_provider_request' }, { abort: aborted })

    expect(aborted).toHaveBeenCalled()
    expect(errMsg).toContain('繁忙')
  })

  it('首字节超时（after_provider_response）：标记下一轮换模型', async () => {
    const profiles = [
      mkProfile({ id: 'a', priority: 1, maxConcurrency: 5, responseTimeoutMs: 1000, baseUrl: 'https://a.com/v1' }),
      mkProfile({ id: 'b', priority: 2, maxConcurrency: 5, baseUrl: 'https://b.com/v1' }),
    ]
    const models = new Map([
      ['a', { id: 'a' } as any],
      ['b', { id: 'b' } as any],
    ])
    const switched: string[] = []
    const ctrl = createAutoRouterController({
      profiles,
      availableModels: models,
      onModelSwitched: (id) => switched.push(id),
      onModelError: () => {},
    })
    const captured = createCapturedApi()
    ctrl.extensionFactory(captured.api)

    // 第一轮选 a
    await call(captured, 'before_agent_start')
    expect(switched).toEqual(['a'])

    // 模拟首字节超时：before_provider_request 记 reqStart，after_provider_response 判定超时
    const realNow = Date.now
    let now = 1000
    Date.now = () => now
    await call(captured, 'before_provider_request', { type: 'before_provider_request' }, {})
    now = 3000 // 超过 responseTimeoutMs(1000)
    await call(captured, 'after_provider_response', { type: 'after_provider_response' }, {})
    Date.now = realNow

    await call(captured, 'agent_end')

    // 第二轮：因首字节超时被标记，应降级到 b
    await call(captured, 'before_agent_start')
    expect(switched).toEqual(['a', 'b'])
  })

  it('agent_end 释放计数，允许下一会话占用', async () => {
    const profiles = [mkProfile({ id: 'a', priority: 1, maxConcurrency: 1 })]
    const models = new Map([['a', { id: 'a' } as any]])
    const ctrl = createAutoRouterController({
      profiles,
      availableModels: models,
      onModelSwitched: () => {},
      onModelError: () => {},
    })
    const captured = createCapturedApi()
    ctrl.extensionFactory(captured.api)

    await call(captured, 'before_agent_start')
    const { tryAcquire } = await import('../modelConcurrencyRegistry.js')
    expect(tryAcquire('https://a.com/v1::m', 1)).toBe(false) // 占用中

    await call(captured, 'agent_end')
    expect(tryAcquire('https://a.com/v1::m', 1)).toBe(true) // 已释放
  })
})
