import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { archivePiAgentSessionFile, getPiAgentSessionArchivePath } from '../../logging/sessionArchive.js'

describe('sessionArchive', () => {
  afterEach(() => {
    rmSync(join(process.cwd(), '.workflow-debug', 'pi-agent-sessions'), { recursive: true, force: true })
  })

  it('archives the original session file metadata without overwriting the session itself', () => {
    const payload = archivePiAgentSessionFile('session_1', '/tmp/session.jsonl')
    expect(payload?.sessionId).toBe('session_1')
    expect(payload?.sessionFile).toBe('/tmp/session.jsonl')

    const archivePath = getPiAgentSessionArchivePath('session_1')
    const persisted = JSON.parse(readFileSync(archivePath, 'utf8')) as { sessionFile: string }
    expect(persisted.sessionFile).toBe('/tmp/session.jsonl')
  })
})
