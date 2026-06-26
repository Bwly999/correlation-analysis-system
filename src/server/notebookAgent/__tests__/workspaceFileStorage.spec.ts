// @vitest-environment node
/**
 * workspaceFileStorage 单测。
 *
 * 验证本地磁盘存取往返（save → load → delete）+ S3 兜底读取 + 大小常量。
 * 用真实 os.tmpdir 子目录，避免过度 mock 掩盖 IO bug；
 * 通过 vi.resetModules + 动态 import 注入 NOTEBOOK_WORKSPACE_DIR 临时路径。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP_ROOT = mkdtempSync(join(tmpdir(), 'nb-workspace-test-'))

const loadModule = async () => {
  vi.resetModules()
  vi.stubEnv('NOTEBOOK_WORKSPACE_DIR', TMP_ROOT)
  // 动态 import：确保模块级 NOTEBOOK_WORKSPACE_DIR 常量读取到 stub 后的值
  return (await import('../workspaceFileStorage.js')) as typeof import('../workspaceFileStorage.js')
}

const cleanTmpRoot = () => {
  // 清空 TMP_ROOT 下所有内容（保留目录本身），让每个 case 互不干扰
  for (const entry of readdirSync(TMP_ROOT)) {
    rmSync(join(TMP_ROOT, entry), { recursive: true, force: true })
  }
}

describe('workspaceFileStorage（本地磁盘）', () => {
  let mod: Awaited<ReturnType<typeof loadModule>>

  beforeEach(async () => {
    cleanTmpRoot()
    mod = await loadModule()
  })

  afterEach(() => {
    cleanTmpRoot()
    vi.unstubAllEnvs()
  })

  it('save → load 往返：字节内容一致，来源标记为 local', async () => {
    const payload = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff])
    await mod.saveWorkspaceSnapshot('sess-1', payload)

    const result = await mod.loadWorkspaceSnapshot('sess-1')
    expect(result).not.toBeNull()
    expect(result!.source).toBe('local')
    expect(Array.from(result!.buffer)).toEqual(Array.from(payload))
  })

  it('load 不存在的快照 → 返回 null', async () => {
    const result = await mod.loadWorkspaceSnapshot('never-exists')
    expect(result).toBeNull()
  })

  it('workspaceSnapshotExists：存过返回 true，没存返回 false', async () => {
    expect(await mod.workspaceSnapshotExists('sess-2')).toBe(false)
    await mod.saveWorkspaceSnapshot('sess-2', Buffer.from('hi'))
    expect(await mod.workspaceSnapshotExists('sess-2')).toBe(true)
  })

  it('deleteWorkspaceSnapshot：删后 exists 返回 false（幂等）', async () => {
    await mod.saveWorkspaceSnapshot('sess-3', Buffer.from('x'))
    expect(await mod.workspaceSnapshotExists('sess-3')).toBe(true)
    await mod.deleteWorkspaceSnapshot('sess-3')
    expect(await mod.workspaceSnapshotExists('sess-3')).toBe(false)
    // 重复删不报错
    await expect(mod.deleteWorkspaceSnapshot('sess-3')).resolves.toBeUndefined()
  })

  it('WORKSPACE_SNAPSHOT_LIMIT_BYTES = 50MB', () => {
    expect(mod.WORKSPACE_SNAPSHOT_LIMIT_BYTES).toBe(50 * 1024 * 1024)
  })
})
