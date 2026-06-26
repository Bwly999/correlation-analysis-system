// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { MysqlApiCallTracker } from '../mysqlApiCallTracker.js'

// 捕获 drizzle 链式调用的 fake 实现。MysqlApiCallTracker 构造时会建池，
// 这里通过 mock 模块替换 createMysqlStoragePool / createMysqlStorageDb。
const fakeChain = {
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}

const resetChain = () => {
  for (const key of Object.keys(fakeChain) as Array<keyof typeof fakeChain>) {
    fakeChain[key].mockReset()
  }
  // 重建链式：insert().values() -> resolved promise
  fakeChain.insert.mockImplementation(() => fakeChain)
  fakeChain.values.mockResolvedValue(undefined)
  // update().set().where() -> resolved promise
  fakeChain.update.mockImplementation(() => fakeChain)
  fakeChain.set.mockImplementation(() => fakeChain)
  fakeChain.where.mockResolvedValue(undefined)
}

vi.mock('../../storageDb/mysql/client.js', () => ({
  readMysqlStorageConfigFromEnv: () => ({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'test',
  }),
  createMysqlStoragePool: () => ({
    end: vi.fn().mockResolvedValue(undefined),
  }),
  createMysqlStorageDb: () => fakeChain,
}))

describe('MysqlApiCallTracker', () => {
  it('recordStart inserts a streaming row with all fields', () => {
    resetChain()
    const tracker = new MysqlApiCallTracker()

    tracker.recordStart({
      requestId: 'req-1',
      userId: 'user-1',
      method: 'GET',
      route: '/api/storage/workflows/:workflowId',
      fullPath: '/api/storage/workflows/wf-1?foo=bar',
      paramsJson: { workflowId: 'wf-1' },
      startTimeMs: 1700000000000,
      clientIp: '127.0.0.1',
    })

    expect(fakeChain.insert).toHaveBeenCalledTimes(1)
    expect(fakeChain.values).toHaveBeenCalledTimes(1)
    const insertedRow = fakeChain.values.mock.calls[0]![0]
    expect(insertedRow).toMatchObject({
      requestId: 'req-1',
      userId: 'user-1',
      method: 'GET',
      route: '/api/storage/workflows/:workflowId',
      fullPath: '/api/storage/workflows/wf-1?foo=bar',
      paramsJson: { workflowId: 'wf-1' },
      status: 'streaming',
      statusCode: null,
      durationMs: null,
      startTimeMs: 1700000000000,
      clientIp: '127.0.0.1',
    })
  })

  it('recordStart accepts null userId and paramsJson', () => {
    resetChain()
    const tracker = new MysqlApiCallTracker()

    tracker.recordStart({
      requestId: 'req-2',
      userId: null,
      method: 'POST',
      route: '/api/storage/workflows',
      fullPath: '/api/storage/workflows',
      paramsJson: null,
      startTimeMs: 1700000000000,
      clientIp: null,
    })

    const insertedRow = fakeChain.values.mock.calls[0]![0]
    expect(insertedRow.userId).toBeNull()
    expect(insertedRow.paramsJson).toBeNull()
    expect(insertedRow.clientIp).toBeNull()
  })

  it('recordStart is fire-and-forget: does not throw when db rejects', () => {
    resetChain()
    fakeChain.values.mockRejectedValue(new Error('db down'))
    // 抑制预期内的 warn 日志
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const tracker = new MysqlApiCallTracker()

    expect(() => tracker.recordStart({
      requestId: 'req-3',
      userId: null,
      method: 'GET',
      route: '/api/x',
      fullPath: '/api/x',
      paramsJson: null,
      startTimeMs: 1,
      clientIp: null,
    })).not.toThrow()

    warnSpy.mockRestore()
  })

  it('recordCompletion updates by requestId with status/duration/statusCode', async () => {
    resetChain()
    const tracker = new MysqlApiCallTracker()

    tracker.recordCompletion('req-1', 200, 42, 'ok')

    expect(fakeChain.update).toHaveBeenCalledTimes(1)
    expect(fakeChain.set).toHaveBeenCalledTimes(1)
    const setArg = fakeChain.set.mock.calls[0]![0]
    expect(setArg).toEqual({
      statusCode: 200,
      durationMs: 42,
      status: 'ok',
    })
    expect(fakeChain.where).toHaveBeenCalledTimes(1)
  })

  it('recordCompletion is fire-and-forget: does not throw when db rejects', () => {
    resetChain()
    fakeChain.where.mockRejectedValue(new Error('db down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const tracker = new MysqlApiCallTracker()

    expect(() => tracker.recordCompletion('req-1', 500, 1, 'error')).not.toThrow()

    warnSpy.mockRestore()
  })

  it('close ends the pool', async () => {
    resetChain()
    const tracker = new MysqlApiCallTracker()
    await expect(tracker.close()).resolves.toBeUndefined()
  })
})
