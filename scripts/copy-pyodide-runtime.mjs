import { access, cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sourceDir = join(__dirname, '..', 'ops', 'pyodide-runtime', 'v0.27.x')
const destDir = join(__dirname, '..', 'public', 'pyodide', 'v0.27')

const main = async () => {
  await access(join(sourceDir, 'pyodide-lock.json'))
  await mkdir(destDir, { recursive: true })
  await cp(sourceDir, destDir, { recursive: true, force: true })
  console.log(`[pyodide] 已拷贝到 ${destDir}`)
}

main().catch((error) => {
  console.error('[pyodide] 拷贝失败，请先运行 node scripts/setup-pyodide-runtime.mjs', error)
  process.exit(1)
})
