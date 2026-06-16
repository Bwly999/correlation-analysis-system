import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('pyodideBoot 默认包集', () => {
  it('不包含当前 0.27.7 自托管运行时不存在的 seaborn', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/notebook/worker/pyodideBoot.ts'),
      'utf8',
    )

    expect(source).not.toMatch(/['"]seaborn['"]/)
  })

  it('启动后会把 Python 当前工作目录切到工作区根目录', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/notebook/worker/pyodideBoot.ts'),
      'utf8',
    )

    expect(source).toMatch(/FS\.chdir\(['"]\/['"]\)/)
  })
})
