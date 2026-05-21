import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const RETENTION_DAYS = 60
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

export interface ArchivedSessionFileInfo {
  sessionId: string
  sessionFile: string
  archivedAt: number
  source: 'pi-coding-agent'
}

const resolveArchiveRootDir = () => join(process.cwd(), '.workflow-debug', 'pi-agent-sessions')

const ensureDirectory = (filePath: string) => {
  mkdirSync(dirname(filePath), { recursive: true })
}

const pruneExpiredFilesInDir = (rootDir: string) => {
  const cutoffTime = Date.now() - RETENTION_MS
  try {
    const entries = readdirSync(rootDir, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = join(rootDir, entry.name)
      if (entry.isDirectory()) {
        pruneExpiredFilesInDir(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      try {
        if (statSync(entryPath).mtimeMs < cutoffTime) {
          rmSync(entryPath, { force: true })
        }
      } catch {
        // ignore cleanup failures
      }
    }
  } catch {
    // ignore missing directory and cleanup failures
  }
}

export const getPiAgentSessionArchivePath = (sessionId: string) =>
  join(resolveArchiveRootDir(), `${sessionId}.session.json`)

export const pruneExpiredPiAgentSessionArtifacts = (sessionRootDir: string) => {
  pruneExpiredFilesInDir(resolveArchiveRootDir())
  pruneExpiredFilesInDir(sessionRootDir)
}

export const archivePiAgentSessionFile = (sessionId: string, sessionFile?: string | null) => {
  if (!sessionFile) return null

  const archivePath = getPiAgentSessionArchivePath(sessionId)
  ensureDirectory(archivePath)
  pruneExpiredPiAgentSessionArtifacts(dirname(sessionFile))
  const payload: ArchivedSessionFileInfo = {
    sessionId,
    sessionFile,
    archivedAt: Date.now(),
    source: 'pi-coding-agent',
  }
  writeFileSync(archivePath, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}
