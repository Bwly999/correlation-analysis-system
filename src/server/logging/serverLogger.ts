import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pino, { type Logger } from 'pino'

export interface ServerLogContext {
  requestId?: string
  sessionId?: string
  userId?: string
  module?: string
  method?: string
  pathname?: string
}

export interface ServerLogger {
  info(message: string, context?: ServerLogContext): void
  warn(message: string, context?: ServerLogContext): void
  error(message: string, context?: ServerLogContext & { error?: unknown }): void
  child(context: ServerLogContext): ServerLogger
  getLogFilePath(): string
}

const RETENTION_DAYS = 60
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

const resolveLogRootDir = () => join(process.cwd(), '.workflow-debug', 'server-logs')

const resolveCurrentLogFilePath = () => {
  const dateKey = new Date().toISOString().slice(0, 10)
  return join(resolveLogRootDir(), `${dateKey}.log`)
}

const ensureLogDirectory = (filePath: string) => {
  mkdirSync(dirname(filePath), { recursive: true })
}

const pruneExpiredLogFiles = () => {
  const rootDir = resolveLogRootDir()
  const cutoffTime = Date.now() - RETENTION_MS
  try {
    const entries = readdirSync(rootDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.log')) continue
      const filePath = join(rootDir, entry.name)
      try {
        if (statSync(filePath).mtimeMs < cutoffTime) {
          rmSync(filePath, { force: true })
        }
      } catch {
        // ignore cleanup failures
      }
    }
  } catch {
    // ignore missing directory and cleanup failures
  }
}

const resolveContextBindings = (context: ServerLogContext) => {
  const { module: moduleName, ...rest } = context
  return {
    module: moduleName ?? 'server',
    ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined && value !== '')),
  }
}

const getPinoLogger = (): Logger => {
  const filePath = resolveCurrentLogFilePath()
  ensureLogDirectory(filePath)
  pruneExpiredLogFiles()
  return pino(
    {
      level: 'info',
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      messageKey: 'message',
      formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
      },
    },
    pino.destination({
      dest: filePath,
      sync: true,
    }),
  )
}

const createBoundLogger = (logger: Logger, context: ServerLogContext): ServerLogger => ({
  info: (message, nextContext) => logger.child(resolveContextBindings({ ...context, ...nextContext })).info(message),
  warn: (message, nextContext) => logger.child(resolveContextBindings({ ...context, ...nextContext })).warn(message),
  error: (message, nextContext) => {
    const { error, ...rest } = nextContext ?? {}
    const child = logger.child(resolveContextBindings({ ...context, ...rest }))
    if (error !== undefined) {
      child.error({ err: error }, message)
      return
    }
    child.error(message)
  },
  child: (nextContext) => createBoundLogger(logger, { ...context, ...nextContext }),
  getLogFilePath: () => resolveCurrentLogFilePath(),
})

export const createServerLogger = (baseContext: ServerLogContext = {}): ServerLogger =>
  createBoundLogger(getPinoLogger(), baseContext)
