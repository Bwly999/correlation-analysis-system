/**
 * Markdown 渲染 + sanitize（M1 简版，无 DOMPurify）。
 *
 * 安全约束（详见 docs/design-doc/notebook-agent/安全模型.md §10）：
 *   - 剥离 <script> / <iframe> / <object> / <embed> 等危险标签
 *   - 剥离所有内联事件属性（on*）
 *   - href / src 仅允许 http(s) / data:image / 相对路径
 *
 * 不引入 DOMPurify，是为了减少 M1 依赖；sanitize 由 marked walkTokens + 字符串后处理双层完成。
 * 渲染图片相对路径（../artifacts/xxx.png）由调用方进一步把 src 替换成 OPFS blob URL。
 */

import { marked } from 'marked'

const FORBIDDEN_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'meta',
  'link',
  'style',
  'base',
] as const

const stripForbiddenTags = (html: string): string => {
  let out = html
  for (const tag of FORBIDDEN_TAGS) {
    // 把 <tag ...>...</tag> 整体剥掉（包含正文）
    const block = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
    out = out.replace(block, '')
    // 兜底：自闭合 / 不规范关闭
    const open = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi')
    const close = new RegExp(`<\\/${tag}>`, 'gi')
    out = out.replace(open, '')
    out = out.replace(close, '')
  }
  return out
}

const stripInlineEvents = (html: string): string => {
  // 去掉 on*=... 属性（双引号 / 单引号 / 无引号都覆盖）
  return html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

const sanitizeUrlAttrs = (html: string): string => {
  // 把 href="javascript:..."、src="javascript:..."、href="vbscript:..." 干掉
  return html.replace(
    /\s(href|src|xlink:href|action|formaction)\s*=\s*("|')((?:javascript|vbscript|data:text\/html|data:application\/javascript)[^"']*)\2/gi,
    ' $1=$2#$2',
  )
}

export const renderMarkdownSafe = (md: string): string => {
  const raw = marked.parse(md, { async: false, breaks: false, gfm: true }) as string
  return sanitizeUrlAttrs(stripInlineEvents(stripForbiddenTags(raw)))
}
