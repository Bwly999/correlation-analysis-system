import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('pyodideBoot 默认包集', () => {
  it('包含 seaborn（已通过 setup 脚本补入 runtime 并加进 boot 预装）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/notebook/worker/pyodideBoot.ts'),
      'utf8',
    )

    // seaborn 是从 PyPI 单独补进 runtime 的纯 Python 包，
    // 见 scripts/setup-pyodide-runtime.mjs 的 EXTRA_PYPI_PACKAGES。
    expect(source).toMatch(/['"]seaborn['"]/)
  })

  it('启动后会把 Python 当前工作目录切到工作区根目录', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/notebook/worker/pyodideBoot.ts'),
      'utf8',
    )

    expect(source).toMatch(/FS\.chdir\(['"]\/['"]\)/)
  })
})
