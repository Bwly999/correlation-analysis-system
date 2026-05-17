import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentObservabilityDrawer from '../AgentObservabilityDrawer.vue'
import { useAgentObservabilityStore } from '@/stores/agentObservabilityStore'

vi.mock('@/services/piAgentClient', () => ({
  getPiAgentObservabilityDebugHealth: vi.fn().mockResolvedValue({
    enabled: true,
    logRootDir: 'C:/trace-root',
    activeTraceCount: 1,
    lastWriteAt: 1,
    writeFailures: 0,
  }),
  getPiAgentObservabilityDebugTrace: vi.fn().mockResolvedValue({
    enabled: true,
    sessionId: 'session_1',
    traceId: 'trace_1',
    eventCount: 3,
    projectionSnapshotCount: 1,
    latestStatus: 'running',
    files: {
      rootDir: 'C:/trace-root/2026-05-09/session_1',
      manifestFile: 'manifest.json',
      eventsFile: 'events.ndjson',
      projectionSnapshotsFile: 'projection-snapshots.ndjson',
      rawMessagesFile: 'raw-messages.ndjson',
      sessionFile: 'session.json',
      summaryFile: 'summary.json',
      failureFile: null,
    },
    summary: {
      sessionId: 'session_1',
      traceId: 'trace_1',
      startedAt: 1,
      lastUpdatedAt: 2,
      eventCount: 3,
      projectionSnapshotCount: 1,
      rawMessageCount: 1,
      parseFailureCount: 0,
      failed: false,
      latestStatus: 'running',
      latestError: null,
    },
    events: [
      {
        sessionId: 'session_1',
        traceId: 'trace_1',
        seq: 1,
        timestamp: 1,
        source: 'agent-route',
        kind: 'session.lifecycle',
        summary: '会话已创建',
      },
    ],
    projectionSnapshots: [],
    rawMessages: [],
    parseFailures: [],
  }),
  getPiAgentObservabilityDebugReplay: vi.fn().mockResolvedValue({
    sessionId: 'session_1',
    traceId: 'trace_1',
    totalEvents: 3,
    replayMarkers: [],
    state: {
      cursorSeq: 1,
      sessionStatus: 'running',
      latestKernelStage: null,
      latestKernelMessage: null,
      latestToolCalls: [],
      latestProjection: null,
      latestRawMessage: null,
      latestError: null,
    },
  }),
  getPiAgentObservabilityDebugFiles: vi.fn().mockResolvedValue({
    rootDir: 'C:/trace-root/2026-05-09/session_1',
    manifestFile: 'manifest.json',
    eventsFile: 'events.ndjson',
    projectionSnapshotsFile: 'projection-snapshots.ndjson',
    rawMessagesFile: 'raw-messages.ndjson',
    sessionFile: 'session.json',
    summaryFile: 'summary.json',
    failureFile: null,
  }),
}))

describe('AgentObservabilityDrawer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders chinese devtools controls and tab labels for the current session', async () => {
    const store = useAgentObservabilityStore()
    store.setActiveSessionId('session_1')

    const wrapper = mount(AgentObservabilityDrawer, {
      props: {
        visible: true,
      },
      global: {
        stubs: {
          Drawer: {
            props: ['visible', 'modal'],
            template: '<div data-testid="drawer-stub" :data-visible="String(visible)" :data-modal="String(modal)"><slot name="header" /><slot /></div>',
          },
          Tabs: { props: ['value'], template: '<div class="tabs-stub"><slot /></div>' },
          TabList: { template: '<div class="tab-list-stub"><slot /></div>' },
          Tab: { props: ['value'], template: '<button class="tab-stub"><slot /></button>' },
          TabPanels: { template: '<div class="tab-panels-stub"><slot /></div>' },
          TabPanel: { props: ['value'], template: '<section class="tab-panel-stub"><slot /></section>' },
        },
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const text = wrapper.text()
    expect(text).toContain('Agent 调试台')
    expect(text).toContain('刷新')
    expect(text).toContain('锁定会话')
    expect(text).toContain('概览')
    expect(text).toContain('时间线')
    expect(text).toContain('工具')
    expect(text).toContain('原始消息')
    expect(text).toContain('错误')
    expect(text).toContain('日志目录')
    expect(wrapper.get('[data-testid="agent-observability-drawer"]').attributes('data-visible')).toBe('true')
    expect(wrapper.get('[data-testid="agent-observability-drawer"]').attributes('data-modal')).toBe('false')
  })
})
