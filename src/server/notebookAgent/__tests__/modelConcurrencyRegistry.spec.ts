import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetModelConcurrencyForTest,
  modelKeyOf,
  release,
  tryAcquire,
  waitForSlot,
} from '../modelConcurrencyRegistry.js'

describe('modelConcurrencyRegistry', () => {
  beforeEach(() => __resetModelConcurrencyForTest())
  afterEach(() => __resetModelConcurrencyForTest())

  describe('modelKeyOf', () => {
    it('归一化 baseUrl 尾部斜杠 + model', () => {
      expect(modelKeyOf({ baseUrl: 'https://a.com/v1/', model: 'glm' })).toBe('https://a.com/v1::glm')
      expect(modelKeyOf({ baseUrl: 'https://a.com/v1', model: 'glm' })).toBe('https://a.com/v1::glm')
      expect(modelKeyOf({ baseUrl: 'https://a.com/v1//', model: 'glm' })).toBe('https://a.com/v1::glm')
    })

    it('不同上游不合并', () => {
      expect(modelKeyOf({ baseUrl: 'https://a.com', model: 'm' })).not.toBe(
        modelKeyOf({ baseUrl: 'https://b.com', model: 'm' }),
      )
    })
  })

  describe('tryAcquire', () => {
    it('max 未满时占用成功并计数++', () => {
      expect(tryAcquire('k', 2)).toBe(true)
      expect(tryAcquire('k', 2)).toBe(true)
    })

    it('max 满时返回 false 不占用', () => {
      expect(tryAcquire('k', 1)).toBe(true)
      expect(tryAcquire('k', 1)).toBe(false) // 已满，不占用
      // 仍是 1
      release('k')
      expect(tryAcquire('k', 1)).toBe(true)
    })

    it('max 缺省/<=0 视为不限制', () => {
      expect(tryAcquire('k', undefined)).toBe(true)
      expect(tryAcquire('k', undefined)).toBe(true)
      expect(tryAcquire('k', 0)).toBe(true)
      expect(tryAcquire('k', -1)).toBe(true)
    })
  })

  describe('release', () => {
    it('释放后腾出空位', () => {
      tryAcquire('k', 1)
      expect(tryAcquire('k', 1)).toBe(false)
      release('k')
      expect(tryAcquire('k', 1)).toBe(true)
    })

    it('重复 release 不产生负数', () => {
      tryAcquire('k', 2)
      release('k')
      release('k')
      release('k')
      // 仍能正常占用 2 次
      expect(tryAcquire('k', 2)).toBe(true)
      expect(tryAcquire('k', 2)).toBe(true)
    })

    it('release 不存在的 key 安全无副作用', () => {
      expect(() => release('nope')).not.toThrow()
    })
  })

  describe('waitForSlot', () => {
    it('release 后唤醒等待者', async () => {
      tryAcquire('k', 1)
      const p = waitForSlot('k', 1, 1000)
      // 异步释放
      setTimeout(() => release('k'), 10)
      await expect(p).resolves.toBe('k')
    })

    it('超时后 reject', async () => {
      tryAcquire('k', 1)
      vi.useFakeTimers()
      const p = waitForSlot('k', 1, 100)
      vi.advanceTimersByTime(150)
      await expect(p).rejects.toThrow(/等待模型空闲超时/)
      vi.useRealTimers()
    })

    it('超时后从等待队列移除，避免后续误唤醒', async () => {
      tryAcquire('k', 1)
      vi.useFakeTimers()
      const p = waitForSlot('k', 1, 100)
      vi.advanceTimersByTime(150)
      await expect(p).rejects.toThrow()
      // 此时 release 不应抛错（waiter 已移除），且腾出空位
      release('k')
      vi.useRealTimers()
      expect(tryAcquire('k', 1)).toBe(true)
    })

    it('FIFO 唤醒多个等待者', async () => {
      tryAcquire('k', 1)
      const order: string[] = []
      const p1 = waitForSlot('k', 1, 1000).then((k) => {
        order.push('p1')
        return k
      })
      const p2 = waitForSlot('k', 1, 1000).then((k) => {
        order.push('p2')
        return k
      })
      // 注意：resolve 后调用方需自行 acquire，这里只验证唤醒顺序
      release('k')
      await p1
      release('k')
      await p2
      expect(order).toEqual(['p1', 'p2'])
    })

    it('max 缺省时立即 resolve', async () => {
      await expect(waitForSlot('k', undefined, 100)).resolves.toBe('k')
      await expect(waitForSlot('k', 0, 100)).resolves.toBe('k')
    })
  })
})
