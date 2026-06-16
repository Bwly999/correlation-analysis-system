import { defineTool } from '@earendil-works/pi-coding-agent'
import type { FrontendBridge } from '../piAgent/frontendBridge.js'
import {
  NOTEBOOK_AGENT_TOOL_SPECS,
  type NotebookToolName,
} from '../../shared/notebookAgentTools.js'

const DEFAULT_TIMEOUT_MS = 60_000
const PYTHON_TIMEOUT_MS = 120_000
const ASK_USER_TIMEOUT_MS = 24 * 60 * 60 * 1000

const TOOL_TIMEOUTS: Record<NotebookToolName, number> = {
  python_exec_inline: PYTHON_TIMEOUT_MS,
  python_exec_file: PYTHON_TIMEOUT_MS,
  fs_read: DEFAULT_TIMEOUT_MS,
  fs_write: DEFAULT_TIMEOUT_MS,
  fs_edit: DEFAULT_TIMEOUT_MS,
  fs_list: DEFAULT_TIMEOUT_MS,
  fs_grep: DEFAULT_TIMEOUT_MS,
  todo_write: DEFAULT_TIMEOUT_MS,
  ask_user: ASK_USER_TIMEOUT_MS,
}

const TOOL_LABELS: Record<NotebookToolName, string> = {
  python_exec_inline: '执行 Python 代码',
  python_exec_file: '执行 Python 脚本',
  fs_read: '读取文件',
  fs_write: '写入文件',
  fs_edit: '编辑文件',
  fs_list: '列目录',
  fs_grep: '搜索文件',
  todo_write: '更新任务清单',
  ask_user: '向用户提问',
}

const TOOL_PROMPT_SNIPPETS: Record<NotebookToolName, string> = {
  python_exec_inline: '执行一段独立的 Python 代码来检查、分析或出图',
  python_exec_file: '执行 scripts/ 下已经落盘的 Python 脚本',
  fs_read: '读取工作区里的文件内容',
  fs_write: '写入工作区文件',
  fs_edit: '精确替换文件中的文本片段',
  fs_list: '查看工作区目录结构',
  fs_grep: '在工作区中搜索文本',
  todo_write: '把当前分析计划同步给用户',
  ask_user: '在关键决策点暂停并向用户提问',
}

const WAITING_MESSAGES: Record<NotebookToolName, string> = {
  python_exec_inline: '正在等待前端执行 Python 代码...',
  python_exec_file: '正在等待前端执行 Python 脚本...',
  fs_read: '正在等待前端读取文件...',
  fs_write: '正在等待前端写入文件...',
  fs_edit: '正在等待前端编辑文件...',
  fs_list: '正在等待前端列出目录...',
  fs_grep: '正在等待前端搜索文件...',
  todo_write: '正在等待前端更新任务清单...',
  ask_user: '正在等待用户回答问题...',
}

export function createNotebookTools(bridge: FrontendBridge) {
  return NOTEBOOK_AGENT_TOOL_SPECS.map((spec) =>
    defineTool({
      name: spec.name,
      label: TOOL_LABELS[spec.name],
      description: spec.description,
      promptSnippet: TOOL_PROMPT_SNIPPETS[spec.name],
      parameters: spec.inputSchema,
      async execute(toolCallId, params, _signal, onUpdate) {
        onUpdate?.({
          content: [{ type: 'text', text: WAITING_MESSAGES[spec.name] }],
          details: { status: 'waiting_frontend_notebook' },
        })
        return bridge.request(toolCallId, spec.name, params as Record<string, unknown>, {
          timeoutMs: TOOL_TIMEOUTS[spec.name],
        })
      },
    }),
  )
}
