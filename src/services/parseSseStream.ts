/**
 * SSE 事件流解析器（fetch + 手写解析，非原生 EventSource）。
 *
 * 后端按标准 SSE 编码每帧为 `data: {json}\n\n`（见 server/http/sseStream.ts）。
 * 此函数读取 ReadableStream，按空行(\n\n)分帧，剥去 `data:` 前缀，多行 data
 * 用 `\n` 拼接（遵循 SSE 规范），解析为 JSON 后回调 onEvent。
 *
 * 不依赖原生 EventSource 的原因：Agent 会话需走统一 axios 注入 JWT，
 * 且不希望 SSE 的自动重连，故仍用 fetch 手写。
 */

// SSE 规范允许 CR / LF / CR+LF 三种行终止符，统一归一为 LF，
// 使后续按 \n\n 分帧、按 \n 分行无需逐处兼容 CRLF（防御链路中代理改写行尾）。
const normalizeLineEndings = (text: string) => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

const decodeChunk = (decoder: TextDecoder, value: unknown) => {
  let text: string
  if (value instanceof ArrayBuffer) {
    text = decoder.decode(new Uint8Array(value), { stream: true })
  } else if (ArrayBuffer.isView(value)) {
    text = decoder.decode(value, { stream: true })
  } else {
    text = String(value)
  }
  return normalizeLineEndings(text)
}

export const parseSseStream = async (
  stream: ReadableStream<unknown> | null,
  onEvent: (event: any) => void,
) => {
  if (!stream) return

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flushFrame = (frame: string) => {
    // 帧内多个字段按行处理：合并所有 data: 行，跳过注释(:)和空行
    const dataLines: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue // SSE 注释行
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
    if (dataLines.length === 0) return
    onEvent(JSON.parse(dataLines.join('\n')))
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decodeChunk(decoder, value)
    // SSE 帧以空行(\n\n)分隔
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      if (!frame.trim()) continue
      flushFrame(frame)
    }
  }

  // flush 残留的尾帧（流末尾未以 \n\n 结束时）
  buffer += decoder.decode()
  const trailing = buffer.trim()
  if (trailing) {
    flushFrame(trailing)
  }
}
