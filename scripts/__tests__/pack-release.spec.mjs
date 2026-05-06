// @vitest-environment node
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  getArchiveGlobIgnore,
  getLocalSevenZipPaths,
  getSevenZipCommandCandidates,
  getSevenZipExcludeArgs,
} from '../pack-release.shared.mjs'

describe('pack-release helpers', () => {
  it('优先返回项目内的 7z 可执行文件候选路径', () => {
    const projectDir = 'D:/repo/demo'

    expect(getLocalSevenZipPaths(projectDir)).toEqual([
      join(projectDir, '.local-tools/7zip/7z.exe'),
      join(projectDir, '.local-tools/7zip/7za.exe'),
      join(projectDir, 'tools/7zip/7z.exe'),
      join(projectDir, 'tools/7zip/7za.exe'),
    ])
  })

  it('将项目内候选路径排在系统命令之前', () => {
    const projectDir = 'D:/repo/demo'

    expect(getSevenZipCommandCandidates(projectDir)).toEqual([
      join(projectDir, '.local-tools/7zip/7z.exe'),
      join(projectDir, '.local-tools/7zip/7za.exe'),
      join(projectDir, 'tools/7zip/7z.exe'),
      join(projectDir, 'tools/7zip/7za.exe'),
      '7z',
      '7za',
    ])
  })

  it('为 archiver 与 7z 生成一致的本地工具排除规则', () => {
    const projectName = 'correlation-analysis-system'

    expect(getArchiveGlobIgnore(projectName)).toContain('.local-tools/**')
    expect(getArchiveGlobIgnore(projectName)).toContain('tools/7zip/**')
    expect(getArchiveGlobIgnore(projectName)).toContain('*.zip.tmp')
    expect(getArchiveGlobIgnore(projectName)).toContain(
      `${projectName}*.zip`,
    )

    expect(getSevenZipExcludeArgs(projectName)).toContain('-xr!.local-tools')
    expect(getSevenZipExcludeArgs(projectName)).toContain('-xr!tools/7zip')
    expect(getSevenZipExcludeArgs(projectName)).toContain('-xr!*.zip.tmp')
    expect(getSevenZipExcludeArgs(projectName)).toContain(
      `-xr!${projectName}*.zip`,
    )
  })
})
