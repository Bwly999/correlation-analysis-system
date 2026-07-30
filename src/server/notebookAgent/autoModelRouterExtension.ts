import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import type { WorkflowAiModelProfile } from '../../ai/types.js'
import type { buildModelFromProfile } from '../piAgent/runtimeFactory.js'
import {
  modelKeyOf,
  release,
  tryAcquire,
  waitForSlot,
} from './modelConcurrencyRegistry.js'

/** profileId → 预建 Model（与 NotebookAgentRuntime.availableModels 一致） */
type ModelMap = Map<string, ReturnType<typeof buildModelFromProfile>>

/** 排队等待空位的最大时长（ms），全部占满时最多等这么久。 */
const QUEUE_TIMEOUT_MS = 30_000

/**
 * Auto 路由扩展的 controller 输入。
 *
 * - `profiles`：候选模型，**已按 priority 升序排好**（priority 缺省视作 Infinity）。
 * - `availableModels`：profileId → 预建的 Model 对象（来自 createModelRegistryFromProfiles）。
 * - `onModelSwitched`：每轮实际 setModel 后回调，gateway 据此写回 record.currentModelId
 *   并广播 session.model_changed（实现 Auto 为虚拟选项 + 每轮写回实际 id）。
 * - `onModelError`：排队超时等不可恢复错误时回调，gateway 据此广播 session.auto_model_error。
 */
export interface AutoRouterInput {
  profiles: WorkflowAiModelProfile[]
  availableModels: ModelMap
  onModelSwitched: (profileId: string) => void
  onModelError: (info: { message: string }) => void
}

export interface AutoRouterController {
  extensionFactory: ExtensionFactory
}

/**
 * 创建 Auto 模型路由扩展 controller。
 *
 * 策略：粘性优先 + 首字节超时降级 + 全部占满短时排队。
 *   - 每轮 agent turn 开始（before_agent_start）：若当前模型仍空闲则继续用；
 *     否则按 priority 找第一个空闲模型 setModel；全部占满则排队（最多 QUEUE_TIMEOUT_MS）。
 *   - 每个 provider 请求前后（before/after_provider_response）记录耗时；
 *     首字节超 responseTimeoutMs 则标记下一轮换模型。
 *   - 计数占用跨整个 turn：before_agent_start acquire，agent_end release。
 *
 * 注意：before_agent_start 钩子无 cancel 语义，故排队超时的 abort 落在
 * before_provider_request（ctx.abort 可干净中断请求）。
 */
export function createAutoRouterController(input: AutoRouterInput): AutoRouterController {
  const { profiles, availableModels, onModelSwitched, onModelError } = input

  let api: ExtensionAPI | null = null
  /** 当前 turn 绑定的 profileId（粘性）；null 表示需重新选/已降级。 */
  let currentProfileId: string | null = null
  /** 排队超时标志：before_provider_request 据此 abort 并报错。 */
  let timedOut = false
  /** 当前请求起始时间（before_provider_request 记录）。 */
  let reqStart = 0
  /** 本轮是否已占用计数（避免 agent_end 重复 release）。 */
  let acquiredKey: string | null = null
  /**
   * 因首字节超时被拉黑的模型 id 集合。下一轮选模型时跳过，
   * 成功绑定一个新模型后清空（拉黑只影响紧接的下一轮，避免永久淘汰）。
   */
  const blockedIds = new Set<string>()

  const profileById = (id: string) => profiles.find((p) => p.id === id) ?? null
  const keyOf = (id: string) => {
    const p = profileById(id)
    return p ? modelKeyOf(p) : null
  }

  /** 选一个空闲模型并 setModel + acquire。返回是否成功占用。 */
  const pickAndBind = async (): Promise<boolean> => {
    // 1. 粘性：当前模型仍空闲且未被拉黑则继续
    if (currentProfileId && !blockedIds.has(currentProfileId)) {
      const key = keyOf(currentProfileId)
      if (key && tryAcquire(key, profileById(currentProfileId)?.maxConcurrency)) {
        acquiredKey = key
        return true
      }
    }
    // 2. 按 priority 找第一个空闲（跳过被拉黑的）
    for (const p of profiles) {
      if (!availableModels.has(p.id)) continue
      if (blockedIds.has(p.id)) continue
      const key = modelKeyOf(p)
      if (tryAcquire(key, p.maxConcurrency)) {
        currentProfileId = p.id
        acquiredKey = key
        blockedIds.clear()
        await api!.setModel(availableModels.get(p.id)!)
        onModelSwitched(p.id)
        return true
      }
    }
    // 3. 全部占满
    return false
  }

  const extensionFactory: ExtensionFactory = (pi: ExtensionAPI) => {
    api = pi

    pi.on('before_agent_start', async () => {
      timedOut = false
      acquiredKey = null
      const ok = await pickAndBind()
      if (ok) return
      // 全部占满 → 排队等 priority 最小（第一个）模型
      const first = profiles.find((p) => availableModels.has(p.id))
      if (!first) return
      const key = modelKeyOf(first)
      try {
        await waitForSlot(key, first.maxConcurrency, QUEUE_TIMEOUT_MS)
        // 唤醒后必须重新 acquire（waitForSlot 不自动计数）
        if (tryAcquire(key, first.maxConcurrency)) {
          currentProfileId = first.id
          acquiredKey = key
          await api!.setModel(availableModels.get(first.id)!)
          onModelSwitched(first.id)
        }
      } catch {
        timedOut = true
        // 不 setModel；before_provider_request 会 abort 并报错
      }
      return
    })

    pi.on('before_provider_request', async (_event, ctx) => {
      if (timedOut) {
        onModelError({ message: '当前所有模型繁忙，请稍后重试' })
        ctx.abort()
        return
      }
      reqStart = Date.now()
      return
    })

    pi.on('after_provider_response', async () => {
      const p = currentProfileId ? profileById(currentProfileId) : null
      if (p?.responseTimeoutMs && reqStart > 0) {
        if (Date.now() - reqStart > p.responseTimeoutMs) {
          // 首字节超时：拉黑本轮模型（下一轮跳过），下一轮重新选模型
          blockedIds.add(currentProfileId!)
          currentProfileId = null
        }
      }
      return
    })

    pi.on('agent_end', async () => {
      if (acquiredKey) {
        release(acquiredKey)
        acquiredKey = null
      }
      return
    })
  }

  return { extensionFactory }
}
