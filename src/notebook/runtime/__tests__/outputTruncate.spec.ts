/**
 * outputTruncate 单测。
 *
 * 覆盖：
 *   - 短文本不截断（原样返回，truncated=false）
 *   - 超 maxLines：返回末尾 N 行，truncatedBy='lines'
 *   - 超 maxBytes：返回末尾 maxBytes 字节，truncatedBy='bytes'
 *   - 单行超 maxBytes：返回该行末尾字节
 *   - 多字节 UTF-8（中文）字节边界正确
 *   - 空字符串
 */

import { describe, it, expect } from 'vitest'
import {
  truncateOutputTail,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
} from '../outputTruncate'

describe('truncateOutputTail', () => {
  it('短文本不截断，原样返回', () => {
    const text = 'line1\nline2\nline3'
    const { content, truncation } = truncateOutputTail(text)
    expect(content).toBe(text)
    expect(truncation.truncated).toBe(false)
    expect(truncation.truncatedBy).toBeNull()
    expect(truncation.outputLines).toBe(3)
    expect(truncation.totalLines).toBe(3)
  })

  it('空字符串不截断', () => {
    const { content, truncation } = truncateOutputTail('')
    expect(content).toBe('')
    expect(truncation.truncated).toBe(false)
    expect(truncation.totalLines).toBe(1) // ''.split('\n') === ['']
    expect(truncation.totalBytes).toBe(0)
  })

  it('超 maxLines 时保留末尾 N 行', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line-${i}`)
    const text = lines.join('\n')
    const maxLines = 10
    const { content, truncation } = truncateOutputTail(text, { maxLines })

    // 末尾 10 行
    const expected = lines.slice(-maxLines).join('\n')
    expect(content).toBe(expected)
    expect(truncation.truncated).toBe(true)
    expect(truncation.truncatedBy).toBe('lines')
    expect(truncation.outputLines).toBe(maxLines)
    expect(truncation.totalLines).toBe(100)
  })

  it('超 maxBytes 时保留末尾字节，truncatedBy=bytes', () => {
    // 每行 10 字节（含换行），21 行 = 210 字节，限制 50 字节 → 走字节分支
    const lines = Array.from({ length: 21 }, (_, i) => `l${String(i).padStart(8, '0')}`)
    const text = lines.join('\n')
    const maxBytes = 50
    const { content, truncation } = truncateOutputTail(text, {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes,
    })

    expect(truncation.truncated).toBe(true)
    expect(truncation.truncatedBy).toBe('bytes')
    expect(truncation.outputBytes).toBeLessThanOrEqual(maxBytes)
    // 末尾内容应以最后一行结尾
    expect(content.endsWith(lines[lines.length - 1]!)).toBe(true)
  })

  it('单行超 maxBytes 时取该行末尾字节', () => {
    // 一行 200 字节内容
    const oneLine = 'x'.repeat(200)
    const { content, truncation } = truncateOutputTail(oneLine, {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: 50,
    })

    expect(truncation.truncated).toBe(true)
    expect(truncation.truncatedBy).toBe('bytes')
    expect(truncation.outputBytes).toBe(50)
    expect(content.length).toBe(50)
    expect(content).toBe('x'.repeat(50)) // 末尾 50 字节
  })

  it('多字节 UTF-8（中文）按字符边界对齐', () => {
    // 中文每字 3 字节。60 字 = 180 字节，限制 50 字节
    // 50 / 3 = 16.67 → 应保留末尾 16 字（48 字节），跳过第 17 字的续字节
    const text = '中'.repeat(60)
    const { content, truncation } = truncateOutputTail(text, {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: 50,
    })

    expect(truncation.truncated).toBe(true)
    expect(truncation.truncatedBy).toBe('bytes')
    // 16 字 × 3 字节 = 48 ≤ 50
    expect(content.length).toBe(16)
    // 解码应无乱码：每个字符仍是完整中文
    for (const ch of content) {
      expect(ch).toBe('中')
    }
  })

  it('恰好等于 maxLines 不截断', () => {
    const lines = Array.from({ length: 5 }, (_, i) => `l${i}`)
    const text = lines.join('\n')
    const { truncation } = truncateOutputTail(text, { maxLines: 5, maxBytes: 1000 })
    expect(truncation.truncated).toBe(false)
  })

  it('默认阈值导出（2000 行 / 50KB）', () => {
    expect(DEFAULT_MAX_LINES).toBe(2000)
    expect(DEFAULT_MAX_BYTES).toBe(50 * 1024)
  })

  it('截断元数据 totalBytes 用 UTF-8 字节而非字符串长度', () => {
    const text = '中文' // 6 字节，2 字符
    const { truncation } = truncateOutputTail(text, { maxLines: 100, maxBytes: 1000 })
    expect(truncation.totalBytes).toBe(6)
    expect(truncation.outputBytes).toBe(6)
  })
})
