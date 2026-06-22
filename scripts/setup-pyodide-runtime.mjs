import { access, cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

const VERSION = '0.27.7'
const RELEASE_URL = `https://github.com/pyodide/pyodide/releases/download/${VERSION}/pyodide-${VERSION}.tar.bz2`
const runtimeRoot = join(__dirname, '..', 'ops', 'pyodide-runtime')
const targetDir = join(runtimeRoot, 'v0.27.x')
const archivePath = join(runtimeRoot, `pyodide-${VERSION}.tar.bz2`)
const extractDir = join(runtimeRoot, `pyodide-${VERSION}`)

/**
 * 官方 Pyodide release 不构建的纯 Python 包，需从 PyPI 单独补进 runtime。
 * 每个条目最终会：
 *   1) 把 wheel 下载到 targetDir
 *   2) 往 pyodide-lock.json 的 packages 字典注入一条记录
 * 版本与 sha256 升级时同步修改此清单（sha256 由脚本运行时现算，无需手填）。
 */
const EXTRA_PYPI_PACKAGES = [
  {
    name: 'seaborn',
    version: '0.13.2',
    wheelFile: 'seaborn-0.13.2-py3-none-any.whl',
    depends: ['numpy', 'pandas', 'matplotlib'],
    imports: ['seaborn'],
  },
]

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

/**
 * 从 PyPI JSON API 解析指定包版本的纯 Python wheel（py3-none-any）下载信息。
 * 返回 { url, sha256 }。
 */
const resolvePyPiWheel = async (name, version) => {
  const apiUrl = `https://pypi.org/pypi/${name}/${version}/json`
  const res = await fetch(apiUrl)
  if (!res.ok) {
    throw new Error(`PyPI 查询失败 ${name}==${version}：${res.status}`)
  }
  const data = await res.json()
  const wheel = data.urls.find(
    (u) =>
      u.packagetype === 'bdist_wheel' &&
      u.filename.endsWith('py3-none-any.whl'),
  )
  if (!wheel) {
    throw new Error(`PyPI 上未找到 ${name}==${version} 的纯 Python wheel`)
  }
  return { url: wheel.url, sha256: wheel.digests.sha256 }
}

/**
 * 补齐官方 release 缺失的纯 Python 包：下载 wheel 到 targetDir，并在 pyodide-lock.json
 * 的 packages 字典里注入对应条目（依赖均为 lock 中已有的 numpy/pandas/matplotlib 等）。
 *
 * 幂等：若 wheel 文件与 lock 条目都已就位则跳过。
 */
const ensureExtraPyPiPackages = async () => {
  const lockPath = join(targetDir, 'pyodide-lock.json')
  const lockRaw = await readFile(lockPath, 'utf8')
  const lock = JSON.parse(lockRaw)
  let lockDirty = false

  for (const pkg of EXTRA_PYPI_PACKAGES) {
    const wheelPath = join(targetDir, pkg.wheelFile)
    let needDownload = true
    let sha256 = null
    try {
      await access(wheelPath)
      const buf = await readFile(wheelPath)
      sha256 = createHash('sha256').update(buf).digest('hex')
      needDownload = false
      console.log(`[pyodide] ${pkg.name} wheel 已就绪 (${pkg.wheelFile})`)
    } catch {
      // 文件不存在，需下载
    }

    if (needDownload) {
      console.log(`[pyodide] 从 PyPI 下载 ${pkg.name}==${pkg.version}`)
      const { url, sha256: expected } = await resolvePyPiWheel(
        pkg.name,
        pkg.version,
      )
      const resp = await fetch(url)
      if (!resp.ok || !resp.body) {
        throw new Error(
          `下载 ${pkg.name} wheel 失败：${resp.status} ${resp.statusText}`,
        )
      }
      const ab = await resp.arrayBuffer()
      await writeFile(wheelPath, Buffer.from(ab))
      sha256 = createHash('sha256').update(Buffer.from(ab)).digest('hex')
      if (sha256 !== expected) {
        throw new Error(
          `${pkg.name} wheel sha256 校验失败：期望 ${expected}，实际 ${sha256}`,
        )
      }
      console.log(`[pyodide] ${pkg.name} wheel 下载完成 (${pkg.wheelFile})`)
    }

    const existing = lock.packages[pkg.name]
    const expectedEntry = {
      depends: pkg.depends,
      file_name: pkg.wheelFile,
      imports: pkg.imports,
      install_dir: 'site',
      name: pkg.name,
      package_type: 'package',
      sha256,
      unvendored_tests: false,
      version: pkg.version,
    }
    if (
      !existing ||
      existing.sha256 !== sha256 ||
      existing.version !== pkg.version
    ) {
      lock.packages[pkg.name] = expectedEntry
      lockDirty = true
      console.log(`[pyodide] 注入 lock 条目：${pkg.name}==${pkg.version}`)
    }
  }

  if (lockDirty) {
    await writeFile(lockPath, JSON.stringify(lock))
    console.log('[pyodide] pyodide-lock.json 已更新')
  }
}

const ensureRuntime = async () => {
  await mkdir(runtimeRoot, { recursive: true })

  let needsSetup = false
  try {
    await access(join(targetDir, 'pyodide-lock.json'))
    console.log(`[pyodide] runtime 已就绪：${targetDir}`)
  } catch {
    needsSetup = true
  }

  if (needsSetup) {
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

  // 官方 release 不含的纯 Python 包，无论是否新装 runtime 都要补齐（幂等）
  await ensureExtraPyPiPackages()
}

ensureRuntime().catch((error) => {
  console.error('[pyodide] 准备失败', error)
  process.exit(1)
})
