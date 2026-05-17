import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSanitizedWorkflowSnapshot,
  countUtf8Bytes,
} from '@/stores/piAgentSanitize'
import { createPiAgentSession, syncPiAgentCanvas } from '../piAgentClient'

const fetchMock = vi.fn()

describe('piAgent request payload interception', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/pi-agent/sessions') {
        return {
          ok: true,
          json: async () => ({
            sessionId: 'pi_session_1',
            status: 'idle',
            mode: 'edit',
            prompt: '分析当前数据',
          }),
        } satisfies Partial<Response>
      }

      if (url === '/api/pi-agent/sessions/pi_session_1/canvas-sync') {
        return {
          ok: true,
          json: async () => ({
            projection: {},
            syncSummary: '已同步当前画布，共 1 个节点、0 条连线',
          }),
        } satisfies Partial<Response>
      }

      throw new Error(`unexpected url: ${url}`)
    })
  })

  it('sends sanitized workflow snapshots in session create and canvas sync requests', async () => {
    const hugeRows = Array.from({ length: 2000 }, (_, index) =>
      Object.fromEntries([
        ['feature', index],
        ['target', index * 2],
        ['note', `文本_${index}`],
        ...Array.from({ length: 230 }, (_inner, fieldIndex) => [`field_${fieldIndex}`, `${index}_${fieldIndex}`]),
      ]))

    const createSnapshot = buildSanitizedWorkflowSnapshot({
      name: '测试工作流',
      nodes: [
        {
          id: 'node_manual',
          type: 'custom',
          label: '手动输入数据',
          position: { x: 0, y: 0 },
          selected: false,
          dragging: false,
          data: {
            label: '手动输入数据',
            type: 'manual-json-import',
            category: 'trigger',
            config: {
              jsonData: JSON.stringify(hugeRows),
              keepField: 'target',
            },
            status: 'success',
            logs: [],
            output: {
              kind: 'table',
              payload: hugeRows,
            },
          },
        },
      ],
      edges: [],
    })

    await createPiAgentSession({
      mode: 'edit',
      prompt: '分析当前数据',
      profile: {
        id: 'profile_1',
        name: '默认模型',
        baseUrl: 'http://example.com',
        model: 'glm-4.7',
        enabled: true,
        source: 'system',
      },
      workflowSnapshot: createSnapshot,
      contextHints: undefined,
      dataSources: [],
      nodeCatalog: [],
    })

    await syncPiAgentCanvas('pi_session_1', {
      name: '测试工作流',
      nodes: [
        {
          id: 'node_manual',
          type: 'custom',
          label: '手动输入数据',
          position: { x: 0, y: 0 },
          data: {
            label: '手动输入数据',
            type: 'manual-json-import',
            category: 'trigger',
            config: {
              jsonData: createSnapshot.nodes[0]?.data.config.jsonData,
              keepField: 'target',
            },
            status: 'idle',
            output: null,
          },
        },
      ],
      edges: [],
    })

    const createCall = fetchMock.mock.calls.find(([url]) => url === '/api/pi-agent/sessions')
    const syncCall = fetchMock.mock.calls.find(([url]) => url === '/api/pi-agent/sessions/pi_session_1/canvas-sync')

    expect(createCall).toBeTruthy()
    expect(syncCall).toBeTruthy()

    const createBody = JSON.parse(String(createCall?.[1]?.body ?? '{}'))
    const syncBody = JSON.parse(String(syncCall?.[1]?.body ?? '{}'))

    const createNode = createBody.workflowSnapshot.nodes[0]
    const syncNode = syncBody.workflowSnapshot.nodes[0]

    expect(createNode.data.output.payload).toHaveLength(3)
    expect(Object.keys(createNode.data.output.payload[0] ?? {})).toHaveLength(200)
    expect(createNode.data.config.jsonData).toMatchObject({
      _truncated: true,
      _type: 'string',
    })

    expect(syncNode.data.output).toBeNull()
    expect(syncNode.data.config.jsonData).toMatchObject({
      _truncated: true,
      _type: 'string',
    })

    expect(countUtf8Bytes(JSON.stringify(createBody))).toBeLessThanOrEqual(32768)
    expect(countUtf8Bytes(JSON.stringify(syncBody))).toBeLessThanOrEqual(32768)
    expect(JSON.stringify(createBody)).not.toContain('\"feature\":1999')
    expect(JSON.stringify(syncBody)).not.toContain('\"feature\":1999')
  })
})
