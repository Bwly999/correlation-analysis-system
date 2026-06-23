/**
 * detectInlineAntiPattern 单测。
 *
 * 这是个"软提示安全网"：检测 python_exec_inline 是否被误用于
 * 分析/建模/绘图/长代码等"应落盘"场景。命中时返回提示文案，不阻断执行。
 *
 * 判定信号（命中任一即触发）：
 *   - 行数 > 25
 *   - 含 def / class
 *   - 含 plt.savefig / plt.subplots / fig, ax
 *   - 含 .to_csv( / .to_parquet( / .to_excel(
 */

import { describe, it, expect } from 'vitest'
import { detectInlineAntiPattern } from '../toolDispatcher'

describe('detectInlineAntiPattern', () => {
  describe('探查类代码（不应触发）', () => {
    it('shape/dtypes 短探查 → null', () => {
      const code = `import pandas as pd
df = pd.read_csv('inputs/upstream.csv')
print(df.shape)
print(df.dtypes)`
      expect(detectInlineAntiPattern(code)).toBeNull()
    })

    it('describe/head 短探查 → null', () => {
      const code = `import pandas as pd
df = pd.read_csv('inputs/upstream.csv')
print(df.describe())
print(df.head())`
      expect(detectInlineAntiPattern(code)).toBeNull()
    })

    it('单行表达式 → null', () => {
      expect(detectInlineAntiPattern('print(1 + 1)')).toBeNull()
    })

    it('25 行以内不含落盘信号的代码 → null', () => {
      // 构造 20 行纯赋值/打印，不含 def/class/绘图/落盘
      const code = Array.from({ length: 20 }, (_, i) => `x${i} = ${i}`).join('\n')
      expect(detectInlineAntiPattern(code)).toBeNull()
    })

    it('恰好 25 行 → null（边界：> 25 才触发）', () => {
      const code = Array.from({ length: 25 }, (_, i) => `x${i} = ${i}`).join('\n')
      expect(detectInlineAntiPattern(code)).toBeNull()
    })
  })

  describe('应落盘场景（应触发）', () => {
    it('含 plt.savefig 绘图 → 触发并提到"绘图代码"', () => {
      const code = `import matplotlib.pyplot as plt
import pandas as pd
df = pd.read_csv('inputs/upstream.csv')
plt.figure()
plt.plot(df['x'])
plt.savefig('artifacts/plot.png')
plt.close()`
      const hint = detectInlineAntiPattern(code)
      expect(hint).not.toBeNull()
      expect(hint).toContain('绘图代码')
      expect(hint).toContain('fs_write')
      expect(hint).toContain('python_exec_file')
    })

    it('含 plt.subplots → 触发绘图信号', () => {
      const code = `fig, ax = plt.subplots()
ax.plot([1,2,3])
plt.savefig('artifacts/a.png')`
      const hint = detectInlineAntiPattern(code)
      expect(hint).not.toBeNull()
      expect(hint).toContain('绘图代码')
    })

    it('含 def 函数定义 → 触发并提到"函数定义"', () => {
      const code = `def clean(df):
    return df.dropna()
print(clean(None))`
      const hint = detectInlineAntiPattern(code)
      expect(hint).not.toBeNull()
      expect(hint).toContain('函数定义 def')
    })

    it('含 class 类定义 → 触发并提到"类定义"', () => {
      const code = `class Cleaner:
    pass
print(Cleaner())`
      const hint = detectInlineAntiPattern(code)
      expect(hint).not.toBeNull()
      expect(hint).toContain('类定义 class')
    })

    it('含 df.to_csv 落盘 → 触发并提到"数据落盘操作"', () => {
      const code = `import pandas as pd
df = pd.read_csv('inputs/upstream.csv')
df2 = df.dropna()
df2.to_csv('artifacts/clean.csv')`
      const hint = detectInlineAntiPattern(code)
      expect(hint).not.toBeNull()
      expect(hint).toContain('数据落盘操作')
    })

    it('含 .to_parquet( → 触发数据落盘信号', () => {
      const code = `df.to_parquet('artifacts/clean.parquet')`
      expect(detectInlineAntiPattern(code)).not.toBeNull()
    })

    it('含 .to_excel( → 触发数据落盘信号', () => {
      const code = `df.to_excel('reports/summary.xlsx')`
      expect(detectInlineAntiPattern(code)).not.toBeNull()
    })

    it('超过 25 行 → 触发并提到行数', () => {
      // 26 行纯赋值，不含其他信号
      const code = Array.from({ length: 26 }, (_, i) => `x${i} = ${i}`).join('\n')
      const hint = detectInlineAntiPattern(code)
      expect(hint).not.toBeNull()
      expect(hint).toContain('代码较长')
      expect(hint).toContain('26 行')
    })

    it('多信号叠加 → 提示文案列出所有原因', () => {
      // 含 def + 绘图 + 落盘 + 长代码
      const lines = ['import pandas as pd', 'def clean(df):', '    return df.dropna()']
      for (let i = 0; i < 25; i++) lines.push(`x${i} = ${i}`) // 凑够 26+ 行
      lines.push("clean(df).to_csv('artifacts/c.csv')")
      lines.push('plt.savefig(\'artifacts/p.png\')')
      const code = lines.join('\n')
      const hint = detectInlineAntiPattern(code)
      expect(hint).not.toBeNull()
      // 多个原因用顿号连接
      expect(hint).toContain('代码较长')
      expect(hint).toContain('函数定义 def')
      expect(hint).toContain('绘图代码')
      expect(hint).toContain('数据落盘操作')
    })
  })

  describe('提示文案格式', () => {
    it('以 ⚠️ 开头', () => {
      const code = 'def f():\n    pass'
      expect(detectInlineAntiPattern(code)?.startsWith('⚠️')).toBe(true)
    })

    it('包含引导落盘的关键词：fs_write / python_exec_file / fs_edit', () => {
      const code = 'plt.savefig(\'a.png\')'
      const hint = detectInlineAntiPattern(code)
      expect(hint).toContain('fs_write')
      expect(hint).toContain('python_exec_file')
      expect(hint).toContain('fs_edit')
    })

    it('说明本次不阻断（"本次已为你执行"）', () => {
      const code = 'def f():\n    pass'
      expect(detectInlineAntiPattern(code)).toContain('本次已为你执行')
    })
  })
})
