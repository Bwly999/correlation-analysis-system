// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createNotebookSessionObjectStorage } from '../sessionStorage.js'

const createNeverEndingBody = () => {
  const destroy = vi.fn()
  const body = {
    destroy,
    async *[Symbol.asyncIterator]() {
      await new Promise(() => undefined)
    },
  }
  return { body, destroy }
}

describe('notebook sessionStorage', () => {
  it('getObject：S3 body 永不结束时 5s 内超时并销毁流', async () => {
    vi.useFakeTimers()
    try {
      const { body, destroy } = createNeverEndingBody()
      const send = vi.fn().mockResolvedValue({ Body: body })
      const storage = createNotebookSessionObjectStorage({ send } as never, 'bucket')

      const pending = storage.getObject('notebook-agent/sessions/sess-1.jsonl')
      const assertion = expect(pending).rejects.toThrow(/超时/)
      await vi.advanceTimersByTimeAsync(5_000)

      await assertion
      expect(destroy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('getObjectBytes：S3 body 永不结束时 5s 内超时并销毁流', async () => {
    vi.useFakeTimers()
    try {
      const { body, destroy } = createNeverEndingBody()
      const send = vi.fn().mockResolvedValue({ Body: body })
      const storage = createNotebookSessionObjectStorage({ send } as never, 'bucket')

      const pending = storage.getObjectBytes('notebook-agent/workspace-snapshots/sess-1.zip')
      const assertion = expect(pending).rejects.toThrow(/超时/)
      await vi.advanceTimersByTimeAsync(5_000)

      await assertion
      expect(destroy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
