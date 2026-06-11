/**
 * Notebook fs_* 工具实现层（在 iframe 主线程跑）。
 *
 * 协议契约见 docs/design-doc/notebook-agent/工具集协议.md §4。
 *
 * 错误统一抛 FsToolError（带 code），上层 dispatcher 把它映射成 ToolResult.details.error。
 */

import {
  readFile,
  readBytes,
  writeFile,
  resolveSafePath,
  listDirectoryEntries,
  type OpfsDirectoryHandle,
  type TreeNode,
} from '../shared/opfsAccess'

// ──────────────────────────────────────────────
// 错误模型
// ──────────────────────────────────────────────

export type FsErrorCode =
  | 'path_out_of_workspace'
  | 'file_not_found'
  | 'binary_file_not_supported'
  | 'invalid_arguments'
  | 'string_not_found'
  | 'string_not_unique'
  | 'quota_exceeded'

export interface FsToolError extends Error {
  code: FsErrorCode
}

const fsError = (code: FsErrorCode, message: string): FsToolError => {
  const err = new Error(message) as FsToolError
  err.code = code
  return err
}

const wrapPathError = (err: unknown): FsToolError => {
  const message = err instanceof Error ? err.message : String(err)
  if (/绝对路径|越界|顶级|workspace|out_of_workspace/i.test(message)) {
    return fsError('path_out_of_workspace', message)
  }
  if (/不存在|not.?found/i.test(message)) {
    return fsError('file_not_found', message)
  }
  return fsError('invalid_arguments', message)
}

// ──────────────────────────────────────────────
// fs_read
// ──────────────────────────────────────────────

export interface FsReadParams {
  path: string
  offset?: number
  limit?: number
}

export interface FsReadResult {
  path: string
  content: string
  totalLines: number
  truncated: boolean
  encoding: 'text'
}

const DATA_EXTS = new Set([
  '.csv',
  '.tsv',
  '.parquet',
  '.arrow',
  '.feather',
  '.json',
  '.jsonl',
])
const BINARY_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.pdf',
  '.zip',
  '.parquet',
  '.arrow',
  '.feather',
])

const DEFAULT_TEXT_LIMIT = 300
const DEFAULT_DATA_LIMIT = 10
const MAX_LINE_CHARS = 2000

const extOf = (p: string): string => {
  const idx = p.lastIndexOf('.')
  return idx === -1 ? '' : p.slice(idx).toLowerCase()
}

const isBinaryHead = (bytes: Uint8Array): boolean => {
  // 简易判断：前 1KB 内出现 NUL 字节 → 视为二进制
  const head = bytes.subarray(0, Math.min(bytes.byteLength, 1024))
  for (const b of head) if (b === 0) return true
  return false
}

const truncateLine = (line: string): string => {
  if (line.length <= MAX_LINE_CHARS) return line
  const removed = line.length - MAX_LINE_CHARS
  return `${line.slice(0, MAX_LINE_CHARS)}... [truncated, +${removed} chars]`
}

export const fsRead = async (
  root: OpfsDirectoryHandle,
  params: FsReadParams,
): Promise<FsReadResult> => {
  const { path } = params
  let bytes: Uint8Array
  try {
    resolveSafePath(path)
    bytes = await readBytes(root, path)
  } catch (err) {
    throw wrapPathError(err)
  }

  const ext = extOf(path)
  if (BINARY_EXTS.has(ext) || isBinaryHead(bytes)) {
    throw fsError(
      'binary_file_not_supported',
      `文件 ${path} 是二进制；如需查看请用 python_exec_inline + pandas/PIL 处理`,
    )
  }

  const text = new TextDecoder().decode(bytes)
  const allLines = text.split('\n')
  const totalLines = allLines.length

  const offset = Math.max(0, params.offset ?? 0)
  const defaultLimit = DATA_EXTS.has(ext) ? DEFAULT_DATA_LIMIT : DEFAULT_TEXT_LIMIT
  const limit = params.limit && params.limit > 0 ? params.limit : defaultLimit
  const slice = allLines.slice(offset, offset + limit).map(truncateLine)
  const content = slice.join('\n')
  const truncated =
    offset > 0 ||
    offset + limit < totalLines ||
    slice.some((l) => /\.\.\. \[truncated, /.test(l))

  return {
    path,
    content,
    totalLines,
    truncated,
    encoding: 'text',
  }
}

// ──────────────────────────────────────────────
// fs_write
// ──────────────────────────────────────────────

export interface FsWriteParams {
  path: string
  content: string
}

export interface FsWriteResult {
  path: string
  bytes: number
}

export const fsWrite = async (
  root: OpfsDirectoryHandle,
  params: FsWriteParams,
): Promise<FsWriteResult> => {
  if (typeof params.content !== 'string') {
    throw fsError('invalid_arguments', 'fs_write 仅支持文本（content 必须是 string）')
  }
  try {
    return await writeFile(root, params.path, params.content)
  } catch (err) {
    throw wrapPathError(err)
  }
}

// ──────────────────────────────────────────────
// fs_edit
// ──────────────────────────────────────────────

export interface FsEditParams {
  path: string
  oldStr: string
  newStr: string
  replaceAll?: boolean
}

export interface FsEditResult {
  path: string
  replacements: number
}

const countOccurrences = (haystack: string, needle: string): number => {
  if (needle === '') return 0
  let n = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    n += 1
    pos += needle.length
  }
  return n
}

export const fsEdit = async (
  root: OpfsDirectoryHandle,
  params: FsEditParams,
): Promise<FsEditResult> => {
  if (typeof params.oldStr !== 'string' || params.oldStr === '') {
    throw fsError('invalid_arguments', 'fs_edit 的 oldStr 必须是非空字符串')
  }
  let original: string
  try {
    original = await readFile(root, params.path)
  } catch (err) {
    throw wrapPathError(err)
  }
  const occ = countOccurrences(original, params.oldStr)
  if (occ === 0) throw fsError('string_not_found', `未在 ${params.path} 中找到 oldStr`)
  if (occ > 1 && !params.replaceAll) {
    throw fsError(
      'string_not_unique',
      `oldStr 在 ${params.path} 中出现 ${occ} 次；扩大上下文使其唯一，或传 replaceAll=true`,
    )
  }
  const replaced = params.replaceAll
    ? original.split(params.oldStr).join(params.newStr)
    : original.replace(params.oldStr, params.newStr)
  await writeFile(root, params.path, replaced)
  return {
    path: params.path,
    replacements: params.replaceAll ? occ : 1,
  }
}

// ──────────────────────────────────────────────
// fs_list
// ──────────────────────────────────────────────

export interface FsListParams {
  path?: string
  recursive?: boolean
}

export interface FsListResult {
  path: string
  entries: TreeNode[]
}

const walkRecursive = async (
  root: OpfsDirectoryHandle,
  basePath: string,
): Promise<TreeNode[]> => {
  const out: TreeNode[] = []
  const entries = await listDirectoryEntries(root, basePath)
  for (const entry of entries) {
    if (entry.kind === 'directory') {
      out.push(entry)
      const childPath = basePath ? `${basePath}/${entry.name}` : entry.name
      out.push(...(await walkRecursive(root, childPath)))
    } else {
      out.push(entry)
    }
  }
  return out
}

export const fsList = async (
  root: OpfsDirectoryHandle,
  params: FsListParams,
): Promise<FsListResult> => {
  const basePath = params.path ?? ''
  try {
    const entries = params.recursive
      ? await walkRecursive(root, basePath)
      : await listDirectoryEntries(root, basePath)
    return { path: basePath, entries }
  } catch (err) {
    throw wrapPathError(err)
  }
}

// ──────────────────────────────────────────────
// fs_grep
// ──────────────────────────────────────────────

export interface FsGrepParams {
  pattern: string
  path?: string
  fileGlob?: string // 简版：仅支持 "scripts/*.py" 这种 prefix + ext
  caseInsensitive?: boolean
  contextLines?: number
  maxMatches?: number
}

export interface FsGrepMatch {
  path: string
  lineNumber: number
  line: string
  contextBefore?: string[]
  contextAfter?: string[]
}

export interface FsGrepResult {
  pattern: string
  matches: FsGrepMatch[]
  truncated: boolean
}

const SCAN_TEXT_HEAD_BYTES = 100 * 1024
const SCAN_FILE_LIMIT_BYTES = 1024 * 1024

const collectTextFiles = async (
  root: OpfsDirectoryHandle,
  basePath: string,
): Promise<string[]> => {
  const all: string[] = []
  const entries = await listDirectoryEntries(root, basePath)
  for (const entry of entries) {
    const childPath = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.kind === 'directory') {
      all.push(...(await collectTextFiles(root, childPath)))
    } else if (
      !BINARY_EXTS.has(extOf(entry.name)) &&
      (entry.size ?? 0) <= SCAN_FILE_LIMIT_BYTES
    ) {
      all.push(childPath)
    }
  }
  return all
}

const matchesFileGlob = (path: string, glob: string): boolean => {
  // 仅支持 "<dir>/*.<ext>" 这种简形；其他情况视为不限制
  const m = glob.match(/^([^*]+)\/\*\.(\w+)$/)
  if (!m) return true
  const [, dir, ext] = m
  return path.startsWith(`${dir}/`) && path.endsWith(`.${ext}`)
}

export const fsGrep = async (
  root: OpfsDirectoryHandle,
  params: FsGrepParams,
): Promise<FsGrepResult> => {
  const flags = params.caseInsensitive ? 'gi' : 'g'
  const re = new RegExp(params.pattern, flags)
  const maxMatches = Math.min(params.maxMatches ?? 50, 200)
  const basePath = params.path ?? ''
  let candidates = await collectTextFiles(root, basePath)
  if (params.fileGlob) {
    candidates = candidates.filter((p) => matchesFileGlob(p, params.fileGlob!))
  }

  const matches: FsGrepMatch[] = []
  let scannedTotal = 0
  outer: for (const p of candidates) {
    let bytes: Uint8Array
    try {
      bytes = await readBytes(root, p)
    } catch {
      continue
    }
    if (isBinaryHead(bytes)) continue
    const head = bytes.subarray(0, Math.min(bytes.byteLength, SCAN_TEXT_HEAD_BYTES))
    const text = new TextDecoder().decode(head)
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!
      if (line.search(re) === -1) continue
      // 重置 g 标志的 lastIndex
      re.lastIndex = 0
      matches.push({
        path: p,
        lineNumber: i + 1,
        line,
        contextBefore: params.contextLines
          ? lines.slice(Math.max(0, i - params.contextLines), i)
          : undefined,
        contextAfter: params.contextLines
          ? lines.slice(i + 1, i + 1 + params.contextLines)
          : undefined,
      })
      scannedTotal += 1
      if (scannedTotal >= maxMatches) break outer
    }
  }

  return {
    pattern: params.pattern,
    matches,
    truncated: scannedTotal >= maxMatches,
  }
}
