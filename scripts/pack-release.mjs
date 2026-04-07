#!/usr/bin/env node
/**
 * 将当前项目（含 .git 目录）打包为 zip，用于 GitHub Release 发布。
 * 用法：pnpm pack:release
 */
import { createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import archiver from 'archiver'

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

// ── 排除规则 ────────────────────────────────────────────
const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-ssr',
  'dist-server',
  'coverage',
  '__screenshots__',
  '__pycache__',
  '.vscode',
  '.idea',
  '.worktrees',
  '.superpowers',
  '.venv310'
])

const EXCLUDE_FILES = new Set([
  '.DS_Store',
  '.eslintcache',
])

// 排除匹配模式（文件名前缀或后缀）
const EXCLUDE_PATTERNS = [
  /^cloc-/,              // cloc 工具
  /\.tsbuildinfo$/,       // TS 增量编译
  /\.local$/,             // 本地配置
  /\.sw?$/,               // Vim swap
  /\.suo$/,               // VS solution user
  /\.ntvs.*$/,            // Node.js Tools
  /\.njsproj$/,           // NJ project
  /\.sln$/,               // VS solution
  /\.py[cod]$/,           // Python bytecode
  /\.timestamp-.*-.*\.mjs$/, // Vite timestamp
  new RegExp(`^${PROJECT_NAME}.*\\.zip$`), // 之前的打包产物
]

function shouldExclude(filePath) {
  const parts = filePath.split(/[/\\]/)
  // 检查目录排除
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part)) return true
  }
  const fileName = parts[parts.length - 1]
  if (EXCLUDE_FILES.has(fileName)) return true
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(fileName)) return true
  }
  return false
}

// ── 执行打包 ────────────────────────────────────────────
console.log(`📦 打包 ${PROJECT_NAME} v${VERSION}${SHORT_HASH}`)

const output = createWriteStream(OUTPUT_PATH)
const archive = archiver('zip', { zlib: { level: 9 } })

archive.on('warning', (err) => {
  if (err.code !== 'ENOENT') console.warn('⚠️', err.message)
})

archive.on('error', (err) => {
  console.error('❌ 打包失败:', err.message)
  process.exit(1)
})

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1)
  console.log(`✅ 已生成: ${OUTPUT_NAME} (${sizeMB} MB)`)
  console.log(`   路径: ${OUTPUT_PATH}`)
})

archive.pipe(output)

// 使用 glob 添加整个项目目录
archive.glob('**/*', {
  cwd: PROJECT_DIR,
  ignore: [
    'node_modules/**',
    '.venv310/**',
    'dist/**',
    'dist-ssr/**',
    'dist-server/**',
    'coverage/**',
    '__screenshots__/**',
    '__pycache__/**',
    '.vscode/**',
    '.idea/**',
    '.worktrees/**',
    '.superpowers/**',
    'cloc-*',
    '*.tsbuildinfo',
    '*.local',
    '*.sw?',
    '*.suo',
    '*.ntvs*',
    '*.njsproj',
    '*.sln',
    '*.py[cod]',
    '.DS_Store',
    '.eslintcache',
    '*.timestamp-*-*.mjs',
    `${PROJECT_NAME}*.zip`,
  ],
  dot: true, // 包含 .git 等点开头的文件/目录
})

archive.finalize()
