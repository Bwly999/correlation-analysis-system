import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  appendSmokeDebugLog,
  resolveSmokeArtifactPaths,
  writeSmokeReport,
} from './artifacts.js'

describe('agentic kernel smoke artifacts', () => {
  let tempDir = ''
  const originalCwd = process.cwd()

  afterEach(async () => {
    process.chdir(originalCwd)
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  it('writes debug log and report into workflow debug artifacts directory', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'agentic-kernel-smoke-'))
    await mkdir(path.join(tempDir, '.workflow-debug'), { recursive: true })
    process.chdir(tempDir)

    const paths = resolveSmokeArtifactPaths()

    await appendSmokeDebugLog('{"scope":"agentic-kernel-smoke","message":"created"}')
    await writeSmokeReport({ ok: true, sessionId: 'session-1' })

    const debugLog = await readFile(paths.debugLogPath, 'utf8')
    const report = await readFile(paths.reportPath, 'utf8')

    expect(paths.baseDir).toBe(path.join(tempDir, '.workflow-debug', 'agentic-kernel-smoke'))
    expect(debugLog).toContain('"message":"created"')
    expect(report).toContain('"ok": true')
    expect(report).toContain('"sessionId": "session-1"')
  })
})
