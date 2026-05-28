import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const sourcePackageJsonPath = resolve(projectRoot, 'package.json')
const distServerDir = resolve(projectRoot, 'dist-server')
const targetPackageJsonPath = resolve(distServerDir, 'package.json')

const sourcePackageJson = JSON.parse(await readFile(sourcePackageJsonPath, 'utf8'))
const distServerPackageJson = {
  name: `${sourcePackageJson.name}-server`,
  private: true,
  type: 'module',
}

await mkdir(distServerDir, { recursive: true })
await writeFile(targetPackageJsonPath, `${JSON.stringify(distServerPackageJson, null, 2)}\n`, 'utf8')
