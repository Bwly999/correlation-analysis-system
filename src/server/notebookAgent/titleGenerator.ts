/**
 * Notebook Agent 会话标题派生。
 *
 * 默认用用户的首条发言（清理 + 截断）作为对话标题，不依赖 LLM：
 *   - 稳定、无网络/配额依赖、即时生效
 *   - 长度保护：超长截断到 MAX_TITLE_LEN
 *
 * 设计要点：
 *   - isDefaultNotebookTitle 判定一个标题是否仍是「默认占位名」（可被覆盖），
 *     用于在用户手动改名后不再自动覆盖
 *   - 用户手动改过名后（标题不再是默认占位名），不再自动覆盖
 */

import type { NotebookSessionRecord } from './sessionStore.js'

const MAX_TITLE_LEN = 20

/**
 * 判定一个标题是否是「默认占位名」（可被覆盖）。
 * 匹配：
 *   - 新默认名：数据分析_yyyy-MM-dd HH:mm:ss
 *   - 老默认名：分析笔记本 <8 位>
 *   - mapper 兜底占位：纯「数据分析」「分析笔记本」
 */
export const isDefaultNotebookTitle = (title: string): boolean => {
  if (!title) return true
  if (/^数据分析_\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(title)) return true
  if (/^分析笔记本 [\da-f]{8}$/i.test(title)) return true
  return title === '数据分析' || title === '分析笔记本'
}

const sanitizeTitle = (raw: string): string => {
  const cleaned = raw
    .replace(/^[「『"'""''（(]+/, '')
    .replace(/[」』"'""''）)。.!！?？；;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > MAX_TITLE_LEN ? cleaned.slice(0, MAX_TITLE_LEN) : cleaned
}

/**
 * 从会话首条用户消息派生标题（纯函数，不调 LLM）。
 * @returns 标题文本；无用户消息 / 内容为空时返回 null
 */
export const deriveNotebookTitle = (
  record: Pick<NotebookSessionRecord, 'messages'>,
): string | null => {
  const firstUserMsg = record.messages.find((m) => m.role === 'user')
  const content = firstUserMsg?.content?.trim()
  if (!content) return null
  return sanitizeTitle(content) || null
}
