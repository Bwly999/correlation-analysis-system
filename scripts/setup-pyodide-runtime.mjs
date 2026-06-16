import { access, cp, mkdir, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

const VERSION = '0.27.7'
const RELEASE_URL = `https://github.com/pyodide/pyodide/releases/download/${VERSION}/pyodide-${VERSION}.tar.bz2`
const runtimeRoot = join(__dirname, '..', 'ops', 'pyodide-runtime')
const targetDir = join(runtimeRoot, 'v0.27.x')
const archivePath = join(runtimeRoot, `pyodide-${VERSION}.tar.bz2`)
const extractDir = join(runtimeRoot, `pyodide-${VERSION}`)

const download = async (url, dest) => {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`下载 Pyodide 失败：${response.status} ${response.statusText}`)
  }

  await new Promise((resolve, reject) => {
    const fileStream = createWriteStream(dest)
    response.body.pipeTo(new WritableStream({
      write(chunk) {
        return new Promise((res, rej) => {
          fileStream.write(Buffer.from(chunk), (error) => {
            if (error) {
              rej(error)
              return
            }
            res()
          })
        })
      },
      close() {
        fileStream.end(resolve)
      },
      abort(reason) {
        fileStream.destroy(reason instanceof Error ? reason : new Error(String(reason)))
        reject(reason)
      },
    })).catch(reject)
  })
}

const ensureRuntime = async () => {
  await mkdir(runtimeRoot, { recursive: true })

  try {
    await access(join(targetDir, 'pyodide-lock.json'))
    console.log(`[pyodide] 已就绪：${targetDir}`)
    return
  } catch {
    // continue
  }

  console.log(`[pyodide] 下载 ${RELEASE_URL}`)
  await download(RELEASE_URL, archivePath)

  await rm(extractDir, { recursive: true, force: true })
  await mkdir(extractDir, { recursive: true })
  console.log('[pyodide] 解压运行时资源')
  await execFileAsync('tar', ['-xjf', archivePath, '-C', extractDir, '--strip-components=1'])

  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })
  await cp(extractDir, targetDir, { recursive: true })

  console.log(`[pyodide] 资源准备完成：${targetDir}`)
}

ensureRuntime().catch((error) => {
  console.error('[pyodide] 准备失败', error)
  process.exit(1)
})
