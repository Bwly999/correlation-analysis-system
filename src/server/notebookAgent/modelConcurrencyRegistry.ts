import type { WorkflowAiModelProfile } from '../../ai/types.js'

/**
 * 进程级全局模型并发注册表（模块单例）。
 *
 * 用于 Notebook Agent 的 Auto 路由：内网模型常带并发上限（多数 = 1），
 * 跨会话/用户共享同一上游时会互相阻塞。这里以 `baseUrl::model` 为 key
 * 维护在飞请求数，提供「预防式」占用与「短时排队」语义。
 *
 * 单进程部署前提（当前 server/index.ts 单 app.listen，无 cluster）。
 */
interface Waiter {
  resolve: (key: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface SlotState {
  inFlight: number
  waiters: Waiter[]
}

const slots = new Map<string, SlotState>()

const getOrCreateSlot = (key: string): SlotState => {
  let slot = slots.get(key)
  if (!slot) {
    slot = { inFlight: 0, waiters: [] }
    slots.set(key, slot)
  }
  return slot
}

/**
 * 计算 profile 的并发 key：归一化的 `${baseUrl}::${model}`。
 * 指向同一上游的多个 profile 共享一个计数器。
 */
export const modelKeyOf = (profile: Pick<WorkflowAiModelProfile, 'baseUrl' | 'model'>): string =>
  `${profile.baseUrl.replace(/\/+$/, '')}::${profile.model}`

/**
 * 原子占用：当前 inFlight < max → inFlight++ 返回 true；否则返回 false（不阻塞）。
 * max 缺省/<=0 视为不限制，直接返回 true。
 */
export const tryAcquire = (key: string, max: number | undefined): boolean => {
  if (!max || max <= 0) return true
  const slot = getOrCreateSlot(key)
  if (slot.inFlight < max) {
    slot.inFlight += 1
    return true
  }
  return false
}

/**
 * 排队等待：当 tryAcquire 失败时调用。入队等待 release 唤醒，或 timeoutMs 后 reject。
 * resolve 时返回获得到的 key（与入参一致）。注意：唤醒后 **不会** 自动 inFlight++，
 * 调用方在 resolve 后需自行 tryAcquire（此时一定成功）。
 */
export const waitForSlot = (key: string, max: number | undefined, timeoutMs: number): Promise<string> => {
  if (!max || max <= 0) return Promise.resolve(key)
  const slot = getOrCreateSlot(key)
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = slot.waiters.indexOf(waiter)
      if (idx >= 0) slot.waiters.splice(idx, 1)
      reject(new Error(`等待模型空闲超时（${timeoutMs}ms）`))
    }, timeoutMs)
    const waiter: Waiter = {
      resolve: (k) => {
        clearTimeout(timer)
        resolve(k)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      },
      timer,
    }
    slot.waiters.push(waiter)
  })
}

/**
 * 释放一次占用：inFlight--（不低于 0），并 FIFO 唤醒队首 waiter。
 * 即使 inFlight 已为 0 也安全（防御重复 release）。
 */
export const release = (key: string): void => {
  const slot = slots.get(key)
  if (!slot) return
  if (slot.inFlight > 0) slot.inFlight -= 1
  const next = slot.waiters.shift()
  if (next) next.resolve(key)
}

/** 仅供单元测试：清空所有计数与等待者。 */
export const __resetModelConcurrencyForTest = (): void => {
  for (const slot of slots.values()) {
    for (const w of slot.waiters) {
      clearTimeout(w.timer)
      w.reject(new Error('reset'))
    }
  }
  slots.clear()
}
