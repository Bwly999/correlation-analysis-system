import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServerLogger } from '../serverLogger.js'

describe('serverLogger', () => {
  afterEach(() => {
    rmSync(join(process.cwd(), '.workflow-debug', 'server-logs'), { recursive: true, force: true })
  })

  it('writes human-readable text lines to the daily log file', () => {
    const logger = createServerLogger({ module: 'test', requestId: 'req_1' })
    logger.info('hello world', { sessionId: 'session_1', userId: 'user_1' })

    const logPath = logger.getLogFilePath()
    const content = readFileSync(logPath, 'utf8')
    expect(content).toContain('INFO')
    expect(content).toContain('hello world')
    expect(content).toContain('req_1')
    expect(content).toContain('session_1')
    expect(content).toContain('user_1')
    expect(content).toContain('userId')
  })

  it('includes error details for failures', () => {
    const logger = createServerLogger({ module: 'test' })
    logger.error('boom', { error: new Error('kaboom') })

    const content = readFileSync(logger.getLogFilePath(), 'utf8')
    expect(content).toContain('ERROR')
    expect(content).toContain('boom')
    expect(content).toContain('kaboom')
  })

  it('creates the daily log file on demand', () => {
    const logger = createServerLogger({ module: 'test' })
    logger.info('fresh log')

    const content = readFileSync(logger.getLogFilePath(), 'utf8')
    expect(content).toContain('fresh log')
  })
})
