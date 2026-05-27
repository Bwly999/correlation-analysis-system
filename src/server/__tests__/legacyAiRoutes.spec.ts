import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServerApp } from '../app.js'

describe('legacy ai routes', () => {
  beforeEach(() => {
    vi.stubEnv('WORKFLOW_STORAGE_DATA_DIR', mkdtempSync(join(tmpdir(), 'cas-legacy-routes-')))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns 404 for removed workflow-ai routes', async () => {
    const app = createServerApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/workflow-ai/model-profiles',
      headers: {
        'x-workflow-user-id': 'legacy-routes-user',
        'x-workflow-user-name': 'Legacy Routes User',
      },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ message: '未找到接口' })
    await app.close()
  })

  it('returns 404 for removed workflow mcp routes', async () => {
    const app = createServerApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/opencode/workflow-mcp/health',
      headers: {
        'x-workflow-user-id': 'legacy-routes-user',
        'x-workflow-user-name': 'Legacy Routes User',
      },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ message: '未找到接口' })
    await app.close()
  })

  it('returns 404 for removed pi-agent js-transform routes', async () => {
    const app = createServerApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/pi-agent/js-transform/sessions',
      payload: {
        nodeId: 'node_js_1',
      },
      headers: {
        'x-workflow-user-id': 'legacy-routes-user',
        'x-workflow-user-name': 'Legacy Routes User',
      },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ message: '未找到接口' })
    await app.close()
  })
})
