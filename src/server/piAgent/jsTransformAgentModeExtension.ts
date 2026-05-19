import type { ExtensionAPI, ExtensionContext, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import type { JsTransformAgentSessionRequest } from '../../ai/types.js'
import { buildJsTransformAgentSystemPrompt } from './jsTransformAgentSystemPrompt.js'

const MODE_CONTEXT_MARKER = '[JS_TRANSFORM_MODE_CONTEXT]'

const ASK_TOOL_NAMES = ['js_get_context'] as const
const AGENT_TOOL_NAMES = [
  'js_get_context',
  'js_update_code',
  'js_debug_node',
  'js_get_last_debug_result',
] as const

type JsTransformMode = JsTransformAgentSessionRequest['mode']

const buildModeContextMessage = (request: JsTransformAgentSessionRequest) => ({
  customType: 'js-transform-mode-context',
  content: `${MODE_CONTEXT_MARKER}
当前模式：${request.mode}
ask 模式只允许读取上下文并回答问题；agent 模式允许修改代码并调试当前节点。`,
  display: false,
})

export interface JsTransformAgentModeController {
  extensionFactory: ExtensionFactory
  setMode: (mode: JsTransformMode) => void
  getMode: () => JsTransformMode
}

export function createJsTransformAgentModeController(input: {
  request: JsTransformAgentSessionRequest
}): JsTransformAgentModeController {
  let currentRequest = input.request
  let api: Pick<ExtensionAPI, 'setActiveTools'> | null = null

  const applyMode = (mode: JsTransformMode) => {
    currentRequest = { ...currentRequest, mode }
    api?.setActiveTools(mode === 'ask' ? [...ASK_TOOL_NAMES] : [...AGENT_TOOL_NAMES])
  }

  const extensionFactory: ExtensionFactory = (pi: ExtensionAPI) => {
    api = pi

    const updateStatus = (ctx: ExtensionContext) => {
      if (!ctx.hasUI) return
      ctx.ui.setStatus(
        'js-transform-mode',
        currentRequest.mode === 'ask' ? 'JS Ask' : 'JS Agent',
      )
    }

    pi.on('session_start', async (_event, ctx) => {
      applyMode(currentRequest.mode)
      updateStatus(ctx)
    })

    pi.on('before_agent_start', async (event) => {
      const request = currentRequest
      return {
        systemPrompt: buildJsTransformAgentSystemPrompt(request),
        message: buildModeContextMessage(request),
      }
    })

    pi.on('context', async (event) => ({
      messages: event.messages.filter((message) => {
        const customType = 'customType' in message ? message.customType : undefined
        if (customType === 'js-transform-mode-context') {
          return false
        }

        const content = 'content' in message ? message.content : undefined
        if (typeof content === 'string') {
          return !content.includes(MODE_CONTEXT_MARKER)
        }

        if (Array.isArray(content)) {
          return !content.some(
            (block) =>
              typeof block === 'object'
              && block !== null
              && 'type' in block
              && block.type === 'text'
              && 'text' in block
              && typeof block.text === 'string'
              && block.text.includes(MODE_CONTEXT_MARKER),
          )
        }

        return true
      }),
    }))

    pi.on('tool_call', async (event) => {
      if (currentRequest.mode !== 'ask') return
      if (event.toolName === 'js_update_code' || event.toolName === 'js_debug_node') {
        return {
          block: true,
          reason: `当前处于 ask 模式，不允许调用 ${event.toolName}。请先切换到 agent 模式。`,
        }
      }
      return
    })
  }

  return {
    extensionFactory,
    setMode: applyMode,
    getMode: () => currentRequest.mode,
  }
}
