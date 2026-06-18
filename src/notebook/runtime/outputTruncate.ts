/**
 * Python exec 输出截断工具。
 *
 * 目的：python_exec_inline / python_exec_file 的 stdout / stderr 原封不动回传
 * 会把 Agent 上下文窗口填满（print(df)、长 traceback、误 print 大列表等），
 * 这里在 dispatcher 层做尾部截断，与 SDK 内置 bash 工具行为一致。
 *
 * 策略：双限制（行数 / 字节），先触发者胜；保留末尾——Python exec 的关键
 * 内容（traceback 末帧、最终结果）都在末尾。
 *
 * stdout 与 stderr 各自独立截断，互不挤占。
 *
 * 浏览器主线程环境用 TextEncoder 算字节（node 的 Buffer.byteLength 在 iframe 不可用）。
 */

export interface TruncationMeta {
  truncated: boolean
  truncatedBy: 'lines' | 'bytes' | null
  /** 截断后保留的完整行数 */
  outputLines: number
  /** 截断后保留的字节数 */
  outputBytes: number
  /** 原始总行数 */
  totalLines: number
  /** 原始总字节数 */
  totalBytes: number
}

export interface TruncationOptions {
  /** 最大行数，默认 2000 */
  maxLines?: number
  /** 最大字节数，默认 50KB */
  maxBytes?: number
}

export const DEFAULT_MAX_LINES = 2000
export const DEFAULT_MAX_BYTES = 50 * 1024

const encoder = new TextEncoder()

const byteLength = (s: string): number => encoder.encode(s).length

/**
 * 尾部截断：保留末尾 N 行 / maxBytes 字节，先触发者胜。
 *
 * 不返回半行（除非单行本身就超 maxBytes —— 此时取该行末尾 maxBytes 字节，
 * 并按 UTF-8 字符边界对齐，与 SDK truncateTail 行为一致）。
 */
export const truncateOutputTail = (
  text: string,
  options?: TruncationOptions,
): { content: string; truncation: TruncationMeta } => {
  const maxLines = options?.maxLines ?? DEFAULT_MAX_LINES
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
  const totalBytes = byteLength(text)
  const lines = text.split('\n')
  const totalLines = lines.length

  // 无需截断
  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content: text,
      truncation: {
        truncated: false,
        truncatedBy: null,
        outputLines: totalLines,
        outputBytes: totalBytes,
        totalLines,
        totalBytes,
      },
    }
  }

  // 从末尾往前收集完整行，直到触碰行数或字节上限
  const kept: string[] = []
  let keptBytes = 0
  let truncatedBy: 'lines' | 'bytes' = 'lines'

  for (let i = lines.length - 1; i >= 0 && kept.length < maxLines; i -= 1) {
    const line = lines[i]!
    // kept.length > 0 时需要 +1 给换行符
    const lineBytes = byteLength(line) + (kept.length > 0 ? 1 : 0)
    if (keptBytes + lineBytes > maxBytes) {
      truncatedBy = 'bytes'
      // 边界 case：一行都没收集到且单行就超 maxBytes → 取该行末尾 maxBytes 字节
      if (kept.length === 0) {
        const partial = sliceUtf8FromEnd(line, maxBytes)
        kept.push(partial)
        keptBytes = byteLength(partial)
      }
      break
    }
    kept.unshift(line)
    keptBytes += lineBytes
  }

  if (kept.length >= maxLines && keptBytes <= maxBytes) {
    truncatedBy = 'lines'
  }

  const content = kept.join('\n')
  return {
    content,
    truncation: {
      truncated: true,
      truncatedBy,
      outputLines: kept.length,
      outputBytes: byteLength(content),
      totalLines,
      totalBytes,
    },
  }
}

/**
 * 从字符串末尾取最多 maxBytes 字节，按 UTF-8 字符边界对齐。
 * 处理多字节字符（中文）避免截断出半个字符。
 */
const sliceUtf8FromEnd = (str: string, maxBytes: number): string => {
  const bytes = encoder.encode(str)
  if (bytes.byteLength <= maxBytes) return str
  let start = bytes.byteLength - maxBytes
  // 跳过 UTF-8 续字节（0x80-0xBF），定位到字符首字节
  while (start < bytes.byteLength && (bytes[start]! & 0xc0) === 0x80) {
    start += 1
  }
  return new TextDecoder().decode(bytes.subarray(start))
}
