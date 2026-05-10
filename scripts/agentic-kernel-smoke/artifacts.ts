import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type SmokeArtifactPaths = {
  baseDir: string
  reportPath: string
  debugLogPath: string
  visualizationPath: string
}

export const resolveSmokeArtifactPaths = () => {
  const baseDir = path.resolve('.workflow-debug', 'agentic-kernel-smoke')
  return {
    baseDir,
    reportPath: path.join(baseDir, 'last-run-report.json'),
    debugLogPath: path.join(baseDir, 'last-run-debug.log'),
    visualizationPath: path.join(baseDir, 'last-run-visualization.html'),
  } satisfies SmokeArtifactPaths
}

export const ensureSmokeArtifactDir = async () => {
  const paths = resolveSmokeArtifactPaths()
  await mkdir(paths.baseDir, { recursive: true })
  return paths
}

export const appendSmokeDebugLog = async (message: string) => {
  const { debugLogPath } = await ensureSmokeArtifactDir()
  let previous = ''
  try {
    previous = await readFile(debugLogPath, 'utf8')
  } catch {
    previous = ''
  }

  const next = previous.length > 0 ? `${previous}${message}\n` : `${message}\n`
  await writeFile(debugLogPath, next, 'utf8')
}

export const writeSmokeReport = async (report: unknown) => {
  const { reportPath } = await ensureSmokeArtifactDir()
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}
