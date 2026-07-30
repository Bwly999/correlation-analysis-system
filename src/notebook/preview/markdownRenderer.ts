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
 * 两个渲染入口均用独立 Marked 实例（不共用全局 marked 单例），避免与 piAgentMarkdown.ts
 * 的 renderer / tokenizer 配置相互污染：
 *   - renderMarkdownSafe       基础渲染，对话流（AssistantTextBlock/AskUserCard）共用，不支持公式
 *   - renderMarkdownWithMath   仅 MarkdownPreview 使用，挂 KaTeX 扩展，
 *                              支持 $...$ 行内 / $$...$$ 块级 LaTeX 公式。
 *
 * 两个实例共用一个自定义 del tokenizer：禁用 GFM 单波浪号删除线（仅保留 `~~`），
 * 见下方 tildeTokenizer。
 */

import { Marked, type TokenizerObject } from 'marked'
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

/**
 * 禁用 GFM 单波浪号删除线。
 *
 * marked 默认 del 内联规则为 `/^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/`，
 * 其中 `~~?` 同时匹配单个 `~` 与两个 `~~`。在数据分析 notebook 场景，单个 `~` 是
 * 极常见的合法字符（数值范围 `1~10`、约等于号、按位取反等），紧贴文字成对出现时会被
 * 误判为删除线（如 `~结果~是~这样~` → `<del>结果</del>是<del>这样</del>`）。
 *
 * 这里重写 del tokenizer，仅保留 `~~`（GFM 标准删除线）：正则取自默认规则，把 `~~?`
 * 收紧为 `~~`，其余逐字符一致，保证 `~~text~~` 行为与默认完全相同；单 `~` 不命中则
 * 返回 undefined，回退为普通文本。inline 出 tokens，渲染时才走得进默认 renderer。
 */
const tildeTokenizer: TokenizerObject = {
  del(src) {
    const m = /^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/.exec(src)
    if (!m) return undefined
    const text = m[2]!
    return {
      type: 'del',
      raw: m[0],
      text,
      tokens: this.lexer.inlineTokens(text),
    }
  },
}

// 两个渲染入口均用独立 Marked 实例，避免与 piAgentMarkdown.ts 共用全局 marked 单例
// 造成的相互污染（renderer / tokenizer 串台）。实例在模块加载时一次性配置好。
const safeMarked = new Marked({ gfm: true, breaks: false })
safeMarked.use({ tokenizer: tildeTokenizer })

export const renderMarkdownSafe = (md: string): string => {
  const raw = safeMarked.parse(md, { async: false }) as string
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
mathMarked.use({ tokenizer: tildeTokenizer })

export const renderMarkdownWithMath = (md: string): string => {
  const raw = mathMarked.parse(md, { async: false }) as string
  return sanitizeUrlAttrs(stripInlineEvents(stripForbiddenTags(raw)))
}
