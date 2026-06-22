#!/usr/bin/env node
/**
 * 通用 CLI：为 Pyodide runtime 追加一个纯 Python 包。
 *
 * 用法：
 *   node scripts/add-pyodide-package.mjs --name <pkg> [--version <ver>] [--boot]
 *
 * 做的事：
 *   1. 从 PyPI JSON API 查包元数据，确认存在 py3-none-any 纯 Python wheel
 *   2. 自动解析硬依赖（过滤 extra 可选依赖、剥离版本约束）
 *   3. 下载 wheel 到 ops/pyodide-runtime/v0.27.x/
 *   4. 往 pyodide-lock.json 的 packages 字典注入一条记录（sha256 现算）
 *   5. 把条目登记到 ops/pyodide-runtime/extra-packages.json（setup 脚本读它做 CI 复现）
 *   6. --boot 时同时把包名加进 pyodideBoot.ts 的 PACKAGES 数组（boot 预装）
 *
 * 幂等：重复跑同一包会校验 sha256，已一致则跳过。
 *
 * 详见 docs/design-doc/notebook-agent/runtime-packages.md
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUNTIME_DIR = join(__dirname, '..', 'ops', 'pyodide-runtime', 'v0.27.x')
const LOCK_PATH = join(RUNTIME_DIR, 'pyodide-lock.json')
// 清单放 scripts/ 下（进 git），而非 ops/pyodide-runtime/（不进 git）。
// 这样 CI 克隆仓库后 setup 脚本能读到清单复现纯 Python 包。
const MANIFEST_PATH = join(__dirname, 'pyodide-extra-packages.json')
const BOOT_FILE = join(__dirname, '..', 'src', 'notebook', 'worker', 'pyodideBoot.ts')

// ──────────────────────────────────────────────
// CLI 参数解析
// ──────────────────────────────────────────────

const parseArgs = (argv) => {
  const args = { boot: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--name') args.name = argv[++i]
    else if (a === '--version') args.version = argv[++i]
    else if (a === '--boot') args.boot = true
    else if (a === '-h' || a === '--help') {
      console.log(`用法: node scripts/add-pyodide-package.mjs --name <pkg> [--version <ver>] [--boot]

参数:
  --name <pkg>      包名（必填，如 seaborn）
  --version <ver>   版本（可选，缺省取 PyPI 最新稳定版）
  --boot            同时把包加进 pyodideBoot.ts 的 PACKAGES（boot 预装）
  -h, --help        显示帮助`)
      process.exit(0)
    }
  }
  if (!args.name) {
    console.error('错误：缺少 --name 参数。用 --help 查看用法。')
    process.exit(1)
  }
  return args
}

// ──────────────────────────────────────────────
// PyPI 查询
// ──────────────────────────────────────────────

const queryPyPi = async (name, version) => {
  const url = version
    ? `https://pypi.org/pypi/${name}/${version}/json`
    : `https://pypi.org/pypi/${name}/json`
  const res = await fetch(url)
  if (res.status === 404) {
    throw new Error(`PyPI 上找不到包 ${name}${version ? `==${version}` : ''}`)
  }
  if (!res.ok) {
    throw new Error(`PyPI 查询失败 ${name}: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const info = data.info
  // 选纯 Python wheel（py3-none-any）
  const wheel = data.urls.find(
    (u) =>
      u.packagetype === 'bdist_wheel' && u.filename.endsWith('py3-none-any.whl'),
  )
  if (!wheel) {
    throw new Error(
      `${name}==${info.version} 没有纯 Python wheel (py3-none-any)。` +
        `若包含 C 扩展，需 emscripten 自行编译，本脚本不支持。`,
    )
  }
  return {
    name,
    version: info.version,
    wheelFile: wheel.filename,
    wheelUrl: wheel.url,
    sha256: wheel.digests.sha256,
    requiresDist: info.requires_dist || [],
  }
}

/**
 * 从 requires_dist 数组里解析硬依赖（包名列表）。
 * - 过滤掉 `; extra == "xxx"` 的可选依赖
 * - 剥离版本约束（>=1.2 / !=1.24 / ~= / 等），只留规范化包名
 * - 规范化：- 转 _，小写（Pyodide lock 的 key 用下划线形式，如 scikit_learn）
 */
const parseHardDeps = (requiresDist) => {
  return requiresDist
    .filter((d) => !d.includes(';') || !/extra\s*==/i.test(d.split(';')[1]))
    .map((d) => d.split(';')[0].trim())
    .map((d) => d.match(/^([A-Za-z0-9_.-]+)/)?.[1])
    .filter(Boolean)
    .map((name) => name.replace(/-/g, '_').toLowerCase())
}

// ──────────────────────────────────────────────
// 下载 wheel + 校验 sha256
// ──────────────────────────────────────────────

const downloadWheel = async (pkg) => {
  const wheelPath = join(RUNTIME_DIR, pkg.wheelFile)
  try {
    await access(wheelPath)
    const buf = await readFile(wheelPath)
    const sha256 = createHash('sha256').update(buf).digest('hex')
    if (sha256 === pkg.sha256) {
      console.log(`[add] ${pkg.name} wheel 已存在且 sha256 匹配，跳过下载`)
      return
    }
    console.log(`[add] ${pkg.name} wheel 存在但 sha256 不符，重新下载`)
  } catch {
    // 不存在，继续下载
  }

  console.log(`[add] 下载 ${pkg.wheelFile}`)
  const resp = await fetch(pkg.wheelUrl)
  if (!resp.ok) {
    throw new Error(`下载失败：${resp.status} ${resp.statusText}`)
  }
  const ab = await resp.arrayBuffer()
  const buf = Buffer.from(ab)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  if (sha256 !== pkg.sha256) {
    throw new Error(
      `sha256 校验失败：期望 ${pkg.sha256}，实际 ${sha256}`,
    )
  }
  await writeFile(wheelPath, buf)
  console.log(`[add] wheel 下载完成 (${pkg.wheelFile})`)
}

// ──────────────────────────────────────────────
// 注入 lock 条目
// ──────────────────────────────────────────────

const injectLock = async (pkg, depends) => {
  const lockRaw = await readFile(LOCK_PATH, 'utf8')
  const lock = JSON.parse(lockRaw)
  const existing = lock.packages[pkg.name]
  const entry = {
    depends,
    file_name: pkg.wheelFile,
    imports: [pkg.name.replace(/-/g, '_')],
    install_dir: 'site',
    name: pkg.name,
    package_type: 'package',
    sha256: pkg.sha256,
    unvendored_tests: false,
    version: pkg.version,
  }
  if (
    existing &&
    existing.sha256 === entry.sha256 &&
    existing.version === entry.version
  ) {
    console.log(`[add] lock 条目已存在且一致，跳过`)
    return false
  }
  lock.packages[pkg.name] = entry
  await writeFile(LOCK_PATH, JSON.stringify(lock))
  console.log(`[add] 注入 lock 条目：${pkg.name}==${pkg.version} (deps: ${depends.join(', ') || '无'})`)
  return true
}

// ──────────────────────────────────────────────
// 清单文件 extra-packages.json
// ──────────────────────────────────────────────

const readManifest = async () => {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  } catch {
    return { packages: [] }
  }
}

const writeManifest = async (manifest) => {
  await writeFile(
    MANIFEST_PATH,
    JSON.stringify(manifest, null, 2) + '\n',
  )
}

const updateManifest = async (pkg, depends) => {
  const manifest = await readManifest()
  const entry = {
    name: pkg.name,
    version: pkg.version,
    wheelFile: pkg.wheelFile,
    depends,
    imports: [pkg.name.replace(/-/g, '_')],
  }
  const idx = manifest.packages.findIndex((p) => p.name === pkg.name)
  if (idx >= 0) {
    if (JSON.stringify(manifest.packages[idx]) === JSON.stringify(entry)) {
      console.log(`[add] 清单条目已存在且一致，跳过`)
      return
    }
    manifest.packages[idx] = entry
  } else {
    manifest.packages.push(entry)
  }
  await writeManifest(manifest)
  console.log(`[add] 登记到 pyodide-extra-packages.json`)
}

// ──────────────────────────────────────────────
// --boot：加进 pyodideBoot.ts 的 PACKAGES
// ──────────────────────────────────────────────

const addToBootPackages = async (pkgName) => {
  const src = readFileSync(BOOT_FILE, 'utf8')
  // 已在 PACKAGES 里则跳过
  if (new RegExp(`['"]${pkgName}['"]`).test(src)) {
    console.log(`[add] ${pkgName} 已在 pyodideBoot PACKAGES 中，跳过`)
    return
  }
  // 在 PACKAGES 数组的 ] 前插入。匹配数组结束的 ]
  const marker = "  ]\n  const PKG_PROGRESS_START"
  if (!src.includes(marker)) {
    throw new Error(
      `无法在 pyodideBoot.ts 定位 PACKAGES 数组结束位置，请手动添加 '${pkgName}'`,
    )
  }
  // 找到数组最后一个元素行，在其后追加
  const lines = src.split('\n')
  let lastElemIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(marker)) break
    if (/^\s+'[^']+',?\s*$/.test(lines[i]) || /^\s+'[^']+'$/.test(lines[i])) {
      lastElemIdx = i
    }
  }
  if (lastElemIdx < 0) {
    throw new Error('无法定位 PACKAGES 数组最后一个元素，请手动添加')
  }
  // 确保前一个元素有逗号
  if (!lines[lastElemIdx].trim().endsWith(',')) {
    lines[lastElemIdx] = lines[lastElemIdx].replace(/'?$/, "',")
  }
  const indent = lines[lastElemIdx].match(/^\s*/)[0]
  lines.splice(lastElemIdx + 1, 0, `${indent}'${pkgName}',`)
  await writeFile(BOOT_FILE, lines.join('\n'))
  console.log(`[add] 已把 ${pkgName} 加进 pyodideBoot.ts PACKAGES`)
}

// ──────────────────────────────────────────────
// 主流程
// ──────────────────────────────────────────────

const main = async () => {
  const args = parseArgs(process.argv)

  // 前置：runtime 目录必须存在（setup 脚本先跑过）
  try {
    await access(LOCK_PATH)
  } catch {
    console.error(
      `错误：找不到 ${LOCK_PATH}\n请先运行 \`node scripts/setup-pyodide-runtime.mjs\` 准备 runtime。`,
    )
    process.exit(1)
  }

  console.log(`[add] 查询 PyPI：${args.name}${args.version ? `==${args.version}` : ' (最新版)'}`)
  const pkg = await queryPyPi(args.name, args.version)
  const depends = parseHardDeps(pkg.requiresDist)

  // 依赖检查：depends 必须在 lock 里已有
  const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'))
  const missing = depends.filter((d) => !lock.packages[d])
  if (missing.length > 0) {
    console.error(
      `[add] 依赖缺失：${missing.join(', ')} 不在 runtime lock 中。\n` +
        `请先把这些依赖用本脚本加入（如果是纯 Python），或确认它们在官方 release 里。`,
    )
    process.exit(1)
  }

  await downloadWheel(pkg)
  await injectLock(pkg, depends)
  await updateManifest(pkg, depends)
  if (args.boot) {
    await addToBootPackages(pkg.name)
  }

  console.log(`\n[add] 完成 ✅`)
  console.log(`  包：${pkg.name}==${pkg.version}`)
  console.log(`  wheel：${pkg.wheelFile}`)
  console.log(`  依赖：${depends.join(', ') || '（无）'}`)
  if (args.boot) {
    console.log(`  boot：已加入预装`)
  } else {
    console.log(`  boot：未预装（Agent 可用 python_packages(action='load') 按需加载）`)
  }
}

main().catch((err) => {
  console.error(`[add] 失败：`, err instanceof Error ? err.message : err)
  process.exit(1)
})
