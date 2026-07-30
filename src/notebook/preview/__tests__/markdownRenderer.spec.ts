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

/**
 * 删除线（strikethrough）渲染回归。
 *
 * 背景：marked 的 GFM del 规则同时匹配单个 `~` 与 `~~`，会把数值范围 `1~10`、
 * 约等于号 `x ~ y` 等数据分析场景里常见的合法单 `~` 误判为删除线。
 * 这里禁用单 `~` 删除线（仅保留 `~~`），消除误渲染。
 */
describe('删除线 / 波浪号渲染', () => {
  it('单个 ~ 不被渲染为删除线（数值范围）', () => {
    const html = renderMarkdownSafe('温度范围 1~10 度')
    expect(html).not.toMatch(/<del>/i)
    expect(html).toMatch(/1~10/)
  })

  it('单个 ~ 不被渲染为删除线（约等于号）', () => {
    const html = renderMarkdownSafe('函数 f(x) ~ g(x) 近似相等')
    expect(html).not.toMatch(/<del>/i)
  })

  it('成对单 ~ 紧贴文字也不被渲染为删除线', () => {
    // 这是误判主因：默认规则会把 ~结果~...~这样~ 解析为多个 <del>
    const html = renderMarkdownSafe('~结果~是~这样~')
    expect(html).not.toMatch(/<del>/i)
    expect(html).toMatch(/结果/)
  })

  it('双 ~~ 仍渲染为删除线（GFM 标准）', () => {
    const html = renderMarkdownSafe('~~旧方案~~ 已废弃')
    expect(html).toMatch(/<del>旧方案<\/del>/)
  })

  it('双 ~~ 紧贴数字也正常渲染删除线', () => {
    const html = renderMarkdownSafe('1~~2~~3')
    expect(html).toMatch(/<del>2<\/del>/)
  })

  it('其它 markdown 语法不受影响', () => {
    const html = renderMarkdownSafe('# 标题\n\n**加粗** 与 *斜体* 和 [链接](https://example.com)')
    expect(html).toMatch(/<h1>/)
    expect(html).toMatch(/<strong>加粗<\/strong>/)
    expect(html).toMatch(/<em>斜体<\/em>/)
    expect(html).toMatch(/<a href="https:\/\/example\.com"/)
  })

  it('公式入口 renderMarkdownWithMath 同样不误判单 ~', () => {
    const html = renderMarkdownWithMath('能量 $E=mc^2$ 在 1~10 范围内')
    expect(html).not.toMatch(/<del>/i)
    expect(html).toMatch(/class="katex"/)
  })
})
