/**
 * markdownRenderer 单测：sanitize 行为冒烟。
 *
 * 红队 #17 / #18：
 *   - <script> 被剥离
 *   - <iframe src="javascript:..."> 被剥离
 *   - <img onerror=...> 的 onerror 被剥离
 *   - 普通 markdown（# 标题 / 列表 / 加粗 / 链接）保留
 *   - <a href="javascript:..."> 的 href 被去掉或替换
 */

import { describe, it, expect } from 'vitest'
import { renderMarkdownSafe } from '../markdownRenderer'

describe('renderMarkdownSafe', () => {
  it('普通 markdown 渲染', () => {
    const html = renderMarkdownSafe('# 标题\n\n**重点** 与 *斜体*\n\n- a\n- b')
    expect(html).toMatch(/<h1>\s*标题\s*<\/h1>/)
    expect(html).toMatch(/<strong>重点<\/strong>/)
    expect(html).toMatch(/<ul>/)
  })

  it('剥离 <script>', () => {
    const html = renderMarkdownSafe('Hello <script>alert(1)</script>')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/alert\(1\)/)
  })

  it('剥离 <iframe>', () => {
    const html = renderMarkdownSafe('<iframe src="javascript:alert(1)"></iframe>')
    expect(html).not.toMatch(/<iframe/i)
  })

  it('剥离 onerror 等内联事件', () => {
    const html = renderMarkdownSafe('<img src="x" onerror="alert(1)" />')
    expect(html).not.toMatch(/onerror/i)
  })

  it('a href javascript: 被替换为安全 URL', () => {
    const html = renderMarkdownSafe('[click](javascript:alert(1))')
    // 要么 href 被去掉，要么变成 #
    expect(html).not.toMatch(/href="javascript:/i)
  })

  it('代码块保留 <pre><code>', () => {
    const html = renderMarkdownSafe('```python\nprint("hi")\n```')
    expect(html).toMatch(/<pre><code/)
    expect(html).toMatch(/print\(&quot;hi&quot;\)|print\("hi"\)/)
  })

  it('图片相对路径保留', () => {
    const html = renderMarkdownSafe('![](../artifacts/x.png)')
    expect(html).toMatch(/<img/)
    expect(html).toMatch(/src="\.\.\/artifacts\/x\.png"/)
  })
})
