import hljs from 'highlight.js'
import { marked } from 'marked'

type MarkedRenderer = InstanceType<typeof marked.Renderer>

const escapeHtml = (value: string) =>
  value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;')

const sanitizeInlineHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
const headingClassMap: Record<'h1' | 'h2' | 'h3' | 'h4', string> = {
  h1: 'mb-3 text-[1.2rem] font-bold leading-tight tracking-[-0.02em] text-slate-900',
  h2: 'mb-3 text-[1.05rem] font-bold leading-tight tracking-[-0.02em] text-slate-900',
  h3: 'mb-3 text-[0.95rem] font-bold leading-tight tracking-[-0.02em] text-slate-900',
  h4: 'mb-3 text-[0.9rem] font-bold leading-tight tracking-[-0.02em] text-slate-900',
}
const parseInlineTokens = (renderer: MarkedRenderer, tokens: unknown[] | undefined) =>
  renderer.parser.parseInline((tokens ?? []) as never)
const parseBlockTokens = (renderer: MarkedRenderer, tokens: unknown[] | undefined) =>
  renderer.parser.parse((tokens ?? []) as never, false)

const safeRenderer = new marked.Renderer()

safeRenderer.html = (token) => escapeHtml(typeof token === 'string' ? token : token.text)

safeRenderer.heading = function ({ tokens, depth }) {
  const tag = (depth >= 1 && depth <= 4 ? `h${depth}` : 'h4') as 'h1' | 'h2' | 'h3' | 'h4'
  return `<${tag} class="${headingClassMap[tag]}">${parseInlineTokens(this, tokens)}</${tag}>`
}

safeRenderer.paragraph = function ({ tokens }) {
  return `<p class="mb-4 text-[13px] leading-7 text-slate-700 last:mb-0">${parseInlineTokens(this, tokens)}</p>`
}

safeRenderer.list = function (token) {
  const tag = token.ordered ? 'ol' : 'ul'
  const cls = token.ordered
    ? 'mb-4 list-decimal space-y-1.5 pl-5 text-[13px] leading-7 text-slate-700'
    : 'mb-4 list-disc space-y-1.5 pl-5 text-[13px] leading-7 text-slate-700'
  return `<${tag} class="${cls}">${token.items.map((item) => this.listitem(item)).join('')}</${tag}>`
}

safeRenderer.listitem = function (item) {
  const content = item.tokens ? parseBlockTokens(this, item.tokens) : escapeHtml(item.text ?? '')
  return `<li>${content}</li>`
}

safeRenderer.blockquote = function ({ tokens }) {
  return `<blockquote class="mb-4 rounded-r-2xl border-l-[3px] border-blue-300 bg-gradient-to-b from-blue-50 to-slate-50 px-4 py-3 text-[13px] leading-7 text-blue-900">${parseBlockTokens(this, tokens)}</blockquote>`
}

safeRenderer.hr = () =>
  '<hr class="my-4 border-0 h-px bg-gradient-to-r from-slate-200/0 via-slate-300 to-slate-200/0">'

safeRenderer.codespan = ({ text }) =>
  `<code class="rounded-lg bg-slate-200 px-1.5 py-0.5 font-mono text-[12px] text-slate-900">${escapeHtml(text)}</code>`

safeRenderer.link = function ({ href, title, tokens }) {
  const safeHref = typeof href === 'string' ? href.trim() : ''
  const safeTitle = title ? ` title="${escapeHtml(title)}"` : ''
  const text = tokens ? parseInlineTokens(this, tokens) : safeHref

  if (!/^https?:\/\//i.test(safeHref)) {
    return `<span class="text-slate-700">${text}</span>`
  }

  return `<a class="font-semibold text-blue-600 decoration-blue-200 underline-offset-4 hover:text-blue-700 hover:decoration-blue-400" href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer nofollow"${safeTitle}>${text}</a>`
}

safeRenderer.code = ({ text, lang }) => {
  const language = typeof lang === 'string' ? lang.trim() : ''
  const canHighlight = Boolean(language) && hljs.getLanguage(language)
  const highlighted = canHighlight
    ? hljs.highlight(text, { language }).value
    : escapeHtml(text)

  const languageLabel = language || 'text'
  return [
    '<div class="mb-4 overflow-hidden rounded-[18px] border border-slate-700/90 bg-gradient-to-b from-slate-950 to-slate-900 shadow-inner">',
    `<div class="border-b border-slate-400/20 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-blue-300">${escapeHtml(languageLabel)}</div>`,
    `<pre class="m-0 overflow-x-auto"><code class="hljs block bg-transparent px-4 py-4 font-mono text-[12px] leading-6 text-blue-100 language-${escapeHtml(languageLabel)}">${highlighted}</code></pre>`,
    '</div>',
  ].join('')
}

safeRenderer.table = function (token) {
  const tableToken = token as any
  const header = `<tr>${tableToken.header.map((cell: any) => this.tablecell(cell)).join('')}</tr>`
  const body = tableToken.rows
    .map((row: any[]) => `<tr>${row.map((cell: any) => this.tablecell(cell)).join('')}</tr>`)
    .join('')
  return `<div class="mb-4 overflow-x-auto"><table class="min-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_12px_24px_-22px_rgba(15,23,42,0.35)]"><thead class="bg-slate-50">${header}</thead><tbody>${body}</tbody></table></div>`
}

safeRenderer.tablecell = function ({ tokens, header, align }: any) {
  const tag = header ? 'th' : 'td'
  const cls = header
    ? 'border-b border-slate-200 px-3.5 py-3 text-left text-[12px] font-bold text-slate-700'
    : 'border-b border-slate-200 px-3.5 py-3 text-left align-top text-[12px] leading-6 text-slate-600'
  const alignClass = align ? ` text-${align}` : ''
  return `<${tag} class="${cls}${alignClass}">${parseInlineTokens(this, tokens)}</${tag}>`
}

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer: safeRenderer,
})

export function renderPiAgentMarkdown(source: string): string {
  const normalized = sanitizeInlineHtml(source ?? '')
  return marked.parse(normalized, { async: false }) as string
}
