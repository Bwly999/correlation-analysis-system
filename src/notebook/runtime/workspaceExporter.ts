/**
 * 工作区导出工具：
 *   - exportWorkspaceZip：把 OPFS 当前 session 目录打包成 ZIP（基于 JSZip，DEFLATE 压缩，正确处理 UTF-8 文件名）
 *   - exportMainReportMarkdown：取出 reports/main.md 的文本，便于剪贴板复制
 *
 * 用业界标准库 JSZip 替代原手写 STORE 实现：
 *   - 自动设置 General Purpose Bit Flag bit 11（UTF-8 文件名标记），中文文件名不再乱码
 *   - DEFLATE 压缩减小体积
 *   - 兼容第三方 zip（解压端）的任意压缩方式
 */

import JSZip from 'jszip'
import {
  listDirectoryEntries,
  readBytes,
  type OpfsDirectoryHandle,
} from '../shared/opfsAccess'

// ──────────────────────────────────────────────
// 收集 workspace 内所有文件（递归）
// ──────────────────────────────────────────────

const collectFiles = async (
  root: OpfsDirectoryHandle,
  basePath: string,
): Promise<Array<{ path: string; bytes: Uint8Array }>> => {
  const out: Array<{ path: string; bytes: Uint8Array }> = []
  const entries = await listDirectoryEntries(root, basePath)
  for (const entry of entries) {
    const childPath = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.kind === 'directory') {
      out.push(...(await collectFiles(root, childPath)))
    } else {
      const bytes = await readBytes(root, childPath)
      out.push({ path: childPath, bytes })
    }
  }
  return out
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
  const zip = new JSZip()
  for (const f of files) {
    // JSZip 默认按 UTF-8 处理文件名并自动设置 GP bit 11
    zip.file(f.path, f.bytes)
  }
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const fileName = `notebook-${sanitizeFileName(sessionId)}.zip`
  return {
    bytes,
    fileName,
    toBlob: () => new Blob([bytes as BlobPart], { type: 'application/zip' }),
  }
}

// ──────────────────────────────────────────────
// 解压（基于 JSZip，兼容任意压缩方式的第三方 zip）
// ──────────────────────────────────────────────

export interface UnzippedFile {
  path: string
  bytes: Uint8Array
}

export const unzipWorkspace = async (data: Uint8Array): Promise<UnzippedFile[]> => {
  const zip = await JSZip.loadAsync(data)
  const out: UnzippedFile[] = []
  const entries = Object.values(zip.files)
  for (const entry of entries) {
    // 跳过目录条目
    if (entry.dir) continue
    const bytes = await entry.async('uint8array')
    out.push({ path: entry.name, bytes })
  }
  return out
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
