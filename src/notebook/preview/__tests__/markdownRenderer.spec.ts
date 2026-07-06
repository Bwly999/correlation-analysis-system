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
import { renderMarkdownSafe, renderMarkdownWithMath } from '../markdownRenderer'

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

describe('renderMarkdownWithMath', () => {
  it('行内公式 $...$ 渲染为 KaTeX', () => {
    const html = renderMarkdownWithMath('能量方程 $E=mc^2$ 成立')
    expect(html).toMatch(/class="katex"/)
    expect(html).toMatch(/<math/)
  })

  it('块级公式 $$...$$ 渲染为 KaTeX display 模式', () => {
    const html = renderMarkdownWithMath('$$\n\\sum_{i=1}^n x_i\n$$')
    expect(html).toMatch(/class="katex-display"/)
  })

  it('非法公式不抛异常（throwOnError:false），输出错误标记', () => {
    expect(() => renderMarkdownWithMath('$\\xfoo$')).not.toThrow()
    const html = renderMarkdownWithMath('$\\xfoo$')
    // KaTeX 错误 span 含颜色样式或 .katex-error
    expect(html).toMatch(/katex/)
  })

  it('公式渲染后仍经 sanitize：危险标签被剥离', () => {
    const html = renderMarkdownWithMath('$\\script>alert(1)</script>$')
    expect(html).not.toMatch(/<script/i)
  })

  it('普通 markdown 仍正常渲染', () => {
    const html = renderMarkdownWithMath('# 标题\n\n**重点**')
    expect(html).toMatch(/<h1>\s*标题\s*<\/h1>/)
    expect(html).toMatch(/<strong>重点<\/strong>/)
  })

  it('不影响全局单例：renderMarkdownSafe 不把 $ 当公式', () => {
    // 验证独立实例隔离：基础渲染不应把 $...$ 解析为公式
    const html = renderMarkdownSafe('价格 $5 与 $10')
    expect(html).not.toMatch(/class="katex"/)
  })
})
