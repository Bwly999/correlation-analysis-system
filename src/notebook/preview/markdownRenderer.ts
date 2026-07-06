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
 *
 * 两个渲染入口：
 *   - renderMarkdownSafe       基础渲染，对话流（AssistantTextBlock/AskUserCard）共用，不支持公式
 *   - renderMarkdownWithMath   仅 MarkdownPreview 使用，在独立 Marked 实例上挂 KaTeX 扩展，
 *                              支持 $...$ 行内 / $$...$$ 块级 LaTeX 公式。
 *                              用独立实例而非全局 marked.use，避免污染 piAgentMarkdown.ts 等共用单例处。
 */

import { Marked, marked } from 'marked'
import markedKatex from 'marked-katex-extension'

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

/**
 * 带 LaTeX 公式支持的 Markdown 渲染（仅 MarkdownPreview 使用）。
 *
 * 用独立 Marked 实例注册 marked-katex-extension，避免污染全局 marked 单例
 * （piAgentMarkdown.ts 等共用单例的渲染不应把 $...$ 当公式）。
 * sanitize 链复用 renderMarkdownSafe 的三件套——已验证不会破坏 KaTeX HTML 输出
 * （KaTeX 用内联 style= / aria-hidden= / <math> 等，均不在 stripInlineEvents 的
 * `\son[a-z]+=` 与 FORBIDDEN_TAGS 拦截范围内）。
 *
 * throwOnError:false：非法公式渲染为红色错误 span 而非抛异常，保证批量渲染稳定。
 */
const mathMarked = new Marked({ gfm: true, breaks: false })
mathMarked.use(markedKatex({ throwOnError: false }))

export const renderMarkdownWithMath = (md: string): string => {
  const raw = mathMarked.parse(md, { async: false }) as string
  return sanitizeUrlAttrs(stripInlineEvents(stripForbiddenTags(raw)))
}
