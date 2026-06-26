/**
 * Notebook Agent workspace 文件快照存储（本地磁盘 + 可选 S3）。
 *
 * 与 sessionPersistence.ts 持久化 jsonl 的模式对称：
 *   - 本地优先：`workflow/workspace-snapshots/<sessionId>.zip`
 *   - S3 可选：未配置 NOTEBOOK_SESSION_S3_* 时不启用，仅本地
 *   - 读：本地有就读本地，缺失则尝试拉 S3 兜底
 *
 * 单次快照硬上限 50MB（与 opfsAccess.SINGLE_WRITE_LIMIT_BYTES 对齐），
 * 超限由上层路由在落盘前拒绝，本层只做存储原语。
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createNotebookSessionObjectStorage,
  isNotebookSessionS3Enabled,
} from './sessionStorage.js'

const NOTEBOOK_WORKSPACE_DIR = process.env.NOTEBOOK_WORKSPACE_DIR?.trim()
  || join(process.cwd(), 'workflow', 'workspace-snapshots')
const S3_KEY_PREFIX = 'notebook-agent/workspace-snapshots/'

/** 单次快照（zip）硬上限：50MB，与前端 SINGLE_WRITE_LIMIT_BYTES 对齐 */
export const WORKSPACE_SNAPSHOT_LIMIT_BYTES = 50 * 1024 * 1024

export const resolveWorkspaceFileDir = (): string => NOTEBOOK_WORKSPACE_DIR

export const ensureWorkspaceFileDir = (): string => {
  const dir = resolveWorkspaceFileDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export const resolveWorkspaceSnapshotPath = (sessionId: string): string =>
  join(resolveWorkspaceFileDir(), `${sessionId}.zip`)

// S3 懒加载（与 sessionPersistence.getS3Storage 同款）
let s3Storage:
  | ReturnType<typeof createNotebookSessionObjectStorage>
  | null = null
let s3StorageChecked = false

const getS3Storage = () => {
  if (!s3StorageChecked) {
    s3StorageChecked = true
    if (isNotebookSessionS3Enabled()) {
      s3Storage = createNotebookSessionObjectStorage()
    }
  }
  return s3Storage
}

const s3KeyOf = (sessionId: string): string => `${S3_KEY_PREFIX}${sessionId}.zip`

export interface WorkspaceSnapshotResult {
  buffer: Buffer
  /** 来源：local / s3（便于审计/日志） */
  source: 'local' | 's3'
}

/**
 * 读取 workspace 快照：本地优先，缺失时尝试从 S3 拉兜底。
 * 两处都没有返回 null。
 */
export const loadWorkspaceSnapshot = async (
  sessionId: string,
): Promise<WorkspaceSnapshotResult | null> => {
  const localPath = resolveWorkspaceSnapshotPath(sessionId)
  if (existsSync(localPath)) {
    return { buffer: readFileSync(localPath), source: 'local' }
  }
  const s3 = getS3Storage()
  if (!s3) return null
  try {
    const buf = await s3.getObjectBytes(s3KeyOf(sessionId))
    if (buf) return { buffer: buf, source: 's3' }
  } catch {
    // non-fatal
  }
  return null
}

/** 仅探测快照是否存在（HEAD 语义），不读字节。本地优先。 */
export const workspaceSnapshotExists = async (sessionId: string): Promise<boolean> => {
  if (existsSync(resolveWorkspaceSnapshotPath(sessionId))) return true
  const s3 = getS3Storage()
  if (!s3) return false
  try {
    const buf = await s3.getObjectBytes(s3KeyOf(sessionId))
    return buf !== null
  } catch {
    return false
  }
}

/**
 * 保存 workspace 快照：本地磁盘为主，可选同步到 S3（与 syncNotebookSessionFileToS3 一致，S3 失败静默）。
 * 上层应在调用前已校验 buffer.length <= WORKSPACE_SNAPSHOT_LIMIT_BYTES。
 */
export const saveWorkspaceSnapshot = async (
  sessionId: string,
  buffer: Buffer,
): Promise<void> => {
  ensureWorkspaceFileDir()
  writeFileSync(resolveWorkspaceSnapshotPath(sessionId), buffer)
  const s3 = getS3Storage()
  if (!s3) return
  try {
    await s3.putObjectBytes(s3KeyOf(sessionId), buffer, 'application/zip')
  } catch {
    // non-fatal：S3 归档失败不影响本地存储（与 sessionPersistence 对称）
  }
}

/**
 * 删除 workspace 快照：本地 + S3 都清（与 deleteNotebookSessionFileFromPersistence 对称）。
 * 用于会话彻底删除时的联动清理。任何一处缺失/失败都视为成功（幂等）。
 */
export const deleteWorkspaceSnapshot = async (sessionId: string): Promise<void> => {
  const localPath = resolveWorkspaceSnapshotPath(sessionId)
  if (existsSync(localPath)) {
    try {
      unlinkSync(localPath)
    } catch {
      // ignore
    }
  }
  const s3 = getS3Storage()
  if (!s3) return
  try {
    await s3.deleteObject(s3KeyOf(sessionId))
  } catch {
    // non-fatal
  }
}
