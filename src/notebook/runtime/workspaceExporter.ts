/**
 * 工作区导出工具：
 *   - exportWorkspaceZip：把 OPFS 当前 session 目录打包成 ZIP（纯 JS / store 模式，无外部依赖）
 *   - exportMainReportMarkdown：取出 reports/main.md 的文本，便于剪贴板复制
 *
 * ZIP 仅用 STORE（不压缩）以避免引入压缩库；笔记本工作区一般 ≤ 几十 MB，体积可接受。
 *
 * 用 CRC-32 表预计算 + Local File Header + Central Directory + EOCD 的最小 ZIP 二进制布局。
 */

import {
  listDirectoryEntries,
  readBytes,
  type OpfsDirectoryHandle,
} from '../shared/opfsAccess'

// ──────────────────────────────────────────────
// CRC-32（IEEE）—— 标准 ZIP 实现要求
// ──────────────────────────────────────────────

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC32_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

// ──────────────────────────────────────────────
// 收集 workspace 内所有文件（递归）
// ──────────────────────────────────────────────

const collectFiles = async (
  root: OpfsDirectoryHandle,
  basePath: string,
): Promise<Array<{ path: string; bytes: Uint8Array; mtime: number }>> => {
  const out: Array<{ path: string; bytes: Uint8Array; mtime: number }> = []
  const entries = await listDirectoryEntries(root, basePath)
  for (const entry of entries) {
    const childPath = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.kind === 'directory') {
      out.push(...(await collectFiles(root, childPath)))
    } else {
      const bytes = await readBytes(root, childPath)
      out.push({ path: childPath, bytes, mtime: entry.modifiedAt ?? Date.now() })
    }
  }
  return out
}

// ──────────────────────────────────────────────
// ZIP 二进制构造
// ──────────────────────────────────────────────

interface ZipEntry {
  pathBytes: Uint8Array
  data: Uint8Array
  crc32: number
  size: number
  dosTime: number
  dosDate: number
  localHeaderOffset: number
}

const dosTimeOf = (mtime: number) => {
  const d = new Date(mtime)
  const dosTime = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f)
  const dosDate = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f)
  return { dosTime, dosDate }
}

const writeUint16LE = (view: DataView, offset: number, value: number) => {
  view.setUint16(offset, value, true)
}

const writeUint32LE = (view: DataView, offset: number, value: number) => {
  view.setUint32(offset, value, true)
}

const buildZip = (
  files: Array<{ path: string; bytes: Uint8Array; mtime: number }>,
): Uint8Array => {
  const encoder = new TextEncoder()
  const entries: ZipEntry[] = files.map((f) => {
    const { dosTime, dosDate } = dosTimeOf(f.mtime)
    return {
      pathBytes: encoder.encode(f.path),
      data: f.bytes,
      crc32: crc32(f.bytes),
      size: f.bytes.byteLength,
      dosTime,
      dosDate,
      localHeaderOffset: 0,
    }
  })

  // 估算总大小
  let totalSize = 0
  for (const e of entries) {
    totalSize += 30 + e.pathBytes.byteLength + e.size // local file header + name + data
    totalSize += 46 + e.pathBytes.byteLength // central directory entry
  }
  totalSize += 22 // EOCD

  const buf = new Uint8Array(totalSize)
  const view = new DataView(buf.buffer)
  let offset = 0

  // 1) Local file headers + data
  for (const e of entries) {
    e.localHeaderOffset = offset
    writeUint32LE(view, offset, 0x04034b50) // signature
    writeUint16LE(view, offset + 4, 20) // version needed
    writeUint16LE(view, offset + 6, 0) // flags
    writeUint16LE(view, offset + 8, 0) // compression: store
    writeUint16LE(view, offset + 10, e.dosTime)
    writeUint16LE(view, offset + 12, e.dosDate)
    writeUint32LE(view, offset + 14, e.crc32)
    writeUint32LE(view, offset + 18, e.size) // compressed size
    writeUint32LE(view, offset + 22, e.size) // uncompressed size
    writeUint16LE(view, offset + 26, e.pathBytes.byteLength)
    writeUint16LE(view, offset + 28, 0) // extra field length
    offset += 30
    buf.set(e.pathBytes, offset)
    offset += e.pathBytes.byteLength
    buf.set(e.data, offset)
    offset += e.size
  }

  // 2) Central directory
  const cdOffset = offset
  for (const e of entries) {
    writeUint32LE(view, offset, 0x02014b50) // signature
    writeUint16LE(view, offset + 4, 20) // version made by
    writeUint16LE(view, offset + 6, 20) // version needed
    writeUint16LE(view, offset + 8, 0) // flags
    writeUint16LE(view, offset + 10, 0) // compression: store
    writeUint16LE(view, offset + 12, e.dosTime)
    writeUint16LE(view, offset + 14, e.dosDate)
    writeUint32LE(view, offset + 16, e.crc32)
    writeUint32LE(view, offset + 20, e.size)
    writeUint32LE(view, offset + 24, e.size)
    writeUint16LE(view, offset + 28, e.pathBytes.byteLength)
    writeUint16LE(view, offset + 30, 0) // extra
    writeUint16LE(view, offset + 32, 0) // comment
    writeUint16LE(view, offset + 34, 0) // disk number
    writeUint16LE(view, offset + 36, 0) // internal attrs
    writeUint32LE(view, offset + 38, 0) // external attrs
    writeUint32LE(view, offset + 42, e.localHeaderOffset)
    offset += 46
    buf.set(e.pathBytes, offset)
    offset += e.pathBytes.byteLength
  }
  const cdSize = offset - cdOffset

  // 3) EOCD
  writeUint32LE(view, offset, 0x06054b50)
  writeUint16LE(view, offset + 4, 0) // disk
  writeUint16LE(view, offset + 6, 0) // start disk
  writeUint16LE(view, offset + 8, entries.length) // entries on disk
  writeUint16LE(view, offset + 10, entries.length) // total entries
  writeUint32LE(view, offset + 12, cdSize)
  writeUint32LE(view, offset + 16, cdOffset)
  writeUint16LE(view, offset + 20, 0) // comment length
  offset += 22

  return buf.subarray(0, offset)
}

// ──────────────────────────────────────────────
// 公开 API
// ──────────────────────────────────────────────

const sanitizeFileName = (s: string): string => s.replace(/[^\w.-]/g, '_')

export interface WorkspaceZipResult {
  bytes: Uint8Array
  fileName: string
  /** 转 Blob 便于浏览器下载 */
  toBlob: () => Blob
}

export const exportWorkspaceZip = async (
  root: OpfsDirectoryHandle,
  sessionId: string,
): Promise<WorkspaceZipResult> => {
  const files = await collectFiles(root, '')
  const bytes = buildZip(files)
  const fileName = `notebook-${sanitizeFileName(sessionId)}.zip`
  return {
    bytes,
    fileName,
    toBlob: () => new Blob([bytes as BlobPart], { type: 'application/zip' }),
  }
}

export const exportMainReportMarkdown = async (
  root: OpfsDirectoryHandle,
): Promise<string | null> => {
  try {
    const bytes = await readBytes(root, 'reports/main.md')
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}
