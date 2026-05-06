#!/usr/bin/env node
/**
 * 将当前项目（含 .git 目录）打包为 zip，用于 GitHub Release 发布。
 * 用法：pnpm pack:release
 */
import { createWriteStream, existsSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import archiver from 'archiver'
import {
  getArchiveGlobIgnore,
  getSevenZipCommandCandidates,
  getSevenZipExcludeArgs,
} from './pack-release.shared.mjs'

// 脚本在 scripts/ 下，向上一级拿到项目根目录
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(SCRIPT_DIR, '..')
const PROJECT_NAME = basename(PROJECT_DIR)

// ── 读取版本号 ──────────────────────────────────────────
const pkg = JSON.parse(await readFile(join(PROJECT_DIR, 'package.json'), 'utf8'))
const VERSION = pkg.version

// ── 获取短 commit hash ──────────────────────────────────
let SHORT_HASH = ''
try {
  SHORT_HASH = '-' + execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim()
} catch {
  // 没有 git 则跳过
}

const OUTPUT_NAME = `${PROJECT_NAME}-v${VERSION}${SHORT_HASH}.zip`
const OUTPUT_PATH = join(PROJECT_DIR, OUTPUT_NAME)
const ARCHIVE_GLOB_IGNORE = getArchiveGlobIgnore(PROJECT_NAME)
const SEVEN_ZIP_EXCLUDE_ARGS = getSevenZipExcludeArgs(PROJECT_NAME)

function resolveSevenZipCommand() {
  for (const candidate of getSevenZipCommandCandidates(PROJECT_DIR)) {
    if (candidate.includes('\\') && !existsSync(candidate)) {
      continue
    }
    const probe = spawnSync(candidate, ['-h'], { stdio: 'ignore' })
    if (!probe.error && probe.status === 0) {
      return candidate
    }
  }
  return null
}

function resetOutputArchive() {
  rmSync(OUTPUT_PATH, { force: true })
}

function packWithSevenZip(command) {
  resetOutputArchive()
  console.log(`🚀 使用 7z 加速打包: ${command}`)
  const result = spawnSync(
    command,
    [
      'a',
      '-tzip',
      '-mx=5',
      OUTPUT_PATH,
      '.',
      ...SEVEN_ZIP_EXCLUDE_ARGS,
    ],
    {
      cwd: PROJECT_DIR,
      stdio: 'inherit',
    },
  )

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`7z 退出码异常: ${result.status}`)
  }
}

function logArchiveResult(engine, sizeBytes) {
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1)
  console.log(`✅ 已生成: ${OUTPUT_NAME} (${sizeMB} MB)`)
  console.log(`   路径: ${OUTPUT_PATH}`)
  console.log(`   引擎: ${engine}`)
}

async function packWithArchiverFallback(reason) {
  resetOutputArchive()
  console.log(`↩️  回退到 archiver: ${reason}`)
  console.log('📦 使用 archiver 打包')

  const output = createWriteStream(OUTPUT_PATH)
  const archive = archiver('zip', { zlib: { level: 6 } })

  archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') console.warn('⚠️', err.message)
  })

  archive.on('error', (err) => {
    console.error('❌ 打包失败:', err.message)
    process.exit(1)
  })

  output.on('close', () => {
    logArchiveResult('archiver', archive.pointer())
  })

  archive.pipe(output)
  archive.glob('**/*', {
    cwd: PROJECT_DIR,
    ignore: ARCHIVE_GLOB_IGNORE,
    dot: true,
  })

  await archive.finalize()
}

// ── 执行打包 ────────────────────────────────────────────
console.log(`📦 打包 ${PROJECT_NAME} v${VERSION}${SHORT_HASH}`)
const sevenZipCommand = resolveSevenZipCommand()

if (sevenZipCommand) {
  try {
    packWithSevenZip(sevenZipCommand)
    const sizeBytes = Number(
      execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        `(Get-Item -LiteralPath '${OUTPUT_PATH.replace(/'/g, "''")}').Length`,
      ])
        .toString()
        .trim(),
    )
    logArchiveResult(sevenZipCommand, sizeBytes)
  } catch (error) {
    await packWithArchiverFallback(error.message)
  }
} else {
  await packWithArchiverFallback('未找到可用的 7z/7za')
}
