import { describe, expect, it } from 'vitest'
import { parseSseStream } from '../parseSseStream'

const encode = (s: string) => new TextEncoder().encode(s)

const collect = async (chunks: Uint8Array[]) => {
  const events: any[] = []
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  await parseSseStream(stream as unknown as ReadableStream<unknown>, (event) => events.push(event))
  return events
}

describe('parseSseStream', () => {
  it('解析单行 data 帧', async () => {
    const events = await collect([
      encode('data: {"type":"message","content":"hello"}\n\n'),
    ])
    expect(events).toEqual([{ type: 'message', content: 'hello' }])
  })

  it('解析多帧 + 心跳', async () => {
    const events = await collect([
      encode('data: {"type":"stream.ready"}\n\n'),
      encode('data: {"type":"stream.heartbeat"}\n\n'),
    ])
    expect(events).toEqual([{ type: 'stream.ready' }, { type: 'stream.heartbeat' }])
  })

  it('合并多行 data（SSE 规范：多行 data 用 \\n 连接）', async () => {
    // 多行 data 拼成 JSON 字符串（值内含换行）
    const events = await collect([
      encode('data: {"type":"text","content":"line1\\nline2"}\n\n'),
    ])
    expect(events).toEqual([{ type: 'text', content: 'line1\nline2' }])
  })

  it('跨 chunk 拼帧（帧被拆到两个 chunk）', async () => {
    const events = await collect([
      encode('data: {"type":"part'),
      encode('ial"}\n\n'),
    ])
    expect(events).toEqual([{ type: 'partial' }])
  })

  it('跳过注释行（: 开头）与非 data 行', async () => {
    const events = await collect([
      encode(': this is a comment\ndata: {"type":"ok"}\n\n'),
    ])
    expect(events).toEqual([{ type: 'ok' }])
  })

  it('尾帧未以 \\n\\n 结束时也能 flush', async () => {
    const events = await collect([
      encode('data: {"type":"tail"}'),
    ])
    expect(events).toEqual([{ type: 'tail' }])
  })

  it('空流不报错且不回调', async () => {
    const events = await collect([])
    expect(events).toEqual([])
  })

  it('null 流安全返回', async () => {
    const events: any[] = []
    await parseSseStream(null, (event) => events.push(event))
    expect(events).toEqual([])
  })

  it('兼容 CRLF 行尾（防御链路中代理改写行终止符）', async () => {
    const events = await collect([
      encode('data: {"type":"a"}\r\n\r\ndata: {"type":"b"}\r\n\r\n'),
    ])
    expect(events).toEqual([{ type: 'a' }, { type: 'b' }])
  })

  it('兼容单 CR 行尾', async () => {
    const events = await collect([encode('data: {"type":"c"}\r\r')])
    expect(events).toEqual([{ type: 'c' }])
  })
})
