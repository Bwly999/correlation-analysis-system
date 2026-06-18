import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createNotebookSessionRuntimeMock,
  listNotebookSessionsMock,
  createNotebookSessionEntryMock,
} = vi.hoisted(() => ({
  createNotebookSessionRuntimeMock: vi.fn(),
  listNotebookSessionsMock: vi.fn(),
  createNotebookSessionEntryMock: vi.fn(),
}))

vi.mock('../runtime/notebookSessionRuntime', () => ({
  createNotebookSessionRuntime: createNotebookSessionRuntimeMock,
}))

vi.mock('../runtime/notebookAgentClient', () => ({
  listNotebookSessions: listNotebookSessionsMock,
  createNotebookSessionEntry: createNotebookSessionEntryMock,
}))

import App from '../App.vue'

const buildRuntime = () => ({
  state: {
    session: {
      sessionId: 'sess-1',
      title: '当前分析',
      phase: { kind: 'ready' },
      agent: 'idle',
      runtime: { memoryMb: 0, cellCount: 0, agentSeconds: 0, isRunning: false },
      messages: [],
      todos: [],
      connection: 'online',
    },
    conversations: [],
    activeConversationId: 'sess-1',
  },
  opfsRoot: { value: { kind: 'mock-root' } },
  connect: vi.fn().mockResolvedValue(undefined),
  switchSession: vi.fn().mockImplementation(async (sessionId: string) => {
    runtime.state.session.sessionId = sessionId
    runtime.state.session.title = sessionId === 'sess-2' ? '更早分析' : '新分析'
  }),
  renameSession: vi.fn().mockResolvedValue(undefined),
  sendUserMessage: vi.fn().mockResolvedValue(undefined),
  answerAskUser: vi.fn().mockResolvedValue(undefined),
  cancelAskUser: vi.fn().mockResolvedValue(undefined),
  abort: vi.fn().mockResolvedValue(undefined),
  compact: vi.fn().mockResolvedValue(undefined),
  restart: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  exportWorkspaceFiles: vi.fn().mockResolvedValue([]),
  requestParentClose: vi.fn(),
  dispose: vi.fn(),
})

let runtime = buildRuntime()

describe('Notebook App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime = buildRuntime()
    createNotebookSessionRuntimeMock.mockResolvedValue(runtime)
    listNotebookSessionsMock.mockResolvedValue({
      sessions: [
        {
          sessionId: 'sess-1',
          title: '当前分析',
          updatedAt: 2,
          status: 'idle',
          messageCount: 0,
        },
        {
          sessionId: 'sess-2',
          title: '更早分析',
          updatedAt: 1,
          status: 'idle',
          messageCount: 3,
          lastUserMessagePreview: '先看销量',
        },
      ],
    })
    createNotebookSessionEntryMock.mockResolvedValue({
      sessionId: 'sess-3',
      systemPrompt: 'prompt',
    })
    window.history.replaceState({}, '', '/notebook.html?session=sess-1')
  })

  const mountApp = () =>
    mount(App, {
      global: {
        stubs: {
          NotebookView: {
            name: 'NotebookView',
            props: ['conversations', 'activeConversationId', 'session'],
            emits: ['new-conversation', 'select-conversation'],
            template:
              '<div class="notebook-view-stub" :data-active="activeConversationId"><button data-testid="new-conversation" @click="$emit(\'new-conversation\')">new</button><button data-testid="select-conversation" @click="$emit(\'select-conversation\', \'sess-2\')">select</button><div class="conversation-list">{{ conversations.map((item) => item.title).join(\'|\') }}</div><div class="session-title">{{ session.title }}</div></div>',
          },
          PocApp: { template: '<div />' },
        },
      },
    })

  it('会话模式加载真实历史列表', async () => {
    const wrapper = mountApp()
    await flushPromises()

    expect(createNotebookSessionRuntimeMock).toHaveBeenCalledWith('sess-1')
    expect(listNotebookSessionsMock).toHaveBeenCalled()
    expect(wrapper.get('.conversation-list').text()).toContain('当前分析|更早分析')
  })

  it('点击历史会话时调用 runtime.switchSession', async () => {
    const wrapper = mountApp()
    await flushPromises()

    await wrapper.get('[data-testid="select-conversation"]').trigger('click')
    await flushPromises()

    expect(runtime.switchSession).toHaveBeenCalledWith('sess-2')
    expect(wrapper.get('.session-title').text()).toContain('更早分析')
  })

  it('点击新建对话时创建新 session 并切换', async () => {
    const wrapper = mountApp()
    await flushPromises()

    await wrapper.get('[data-testid="new-conversation"]').trigger('click')
    await flushPromises()

    expect(createNotebookSessionEntryMock).toHaveBeenCalledWith({
      origin: window.location.origin,
    })
    expect(runtime.switchSession).toHaveBeenCalledWith('sess-3')
  })
})
