/**
 * Notebook Agent 会话标题自动生成。
 *
 * 在首轮对话结束后由 gateway 触发：用一次性 in-memory Pi session 调 LLM，
 * 从用户首条消息提炼一个简短中文标题。
 *
 * 设计要点：
 *   - 复用 runtimeFactory 的 buildModelFromProfile / createModelRegistryFromProfile，
 *     与 testPiAgentRuntimeProfile 同构（不污染主对话历史、一次性 dispose）
 *   - 失败 / 超时 / 空结果一律返回 null，调用方静默忽略，不阻塞主流程
 *   - 长度保护：超长截断到 MAX_TITLE_LEN
 */
import {
  createAgentSession,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import {
  buildModelFromProfile,
  createModelRegistryFromProfile,
  createPiAgentResourceLoader,
} from '../piAgent/runtimeFactory.js'
import { getSystemModelProfiles } from '../piAgent/modelProfiles.js'
import type { NotebookSessionRecord } from './sessionStore.js'

const MAX_TITLE_LEN = 20

const TITLE_PROMPT_PREFIX = `请为下面这条用户消息所发起的「数据分析」对话起一个简短的中文标题。
要求：
- 12 个汉字以内，直击用户意图，不要空话套话
- 不要任何标点符号、不要书名号、不要引号
- 只输出标题文本本身，不要前缀、不要解释\n\n用户消息：`

/**
 * 判定一个标题是否是「默认占位名」（可被 AI 覆盖）。
 * 匹配：
 *   - 新默认名：数据分析_yyyy-MM-dd HH:mm:ss
 *   - 老默认名：分析笔记本 <8 位>
 *   - mapper 兜底占位：纯「数据分析」「分析笔记本」
 */
export const isDefaultNotebookTitle = (title: string): boolean => {
  if (!title) return true
  if (/^数据分析_\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(title)) return true
  if (/^分析笔记本 [\da-f]{8}$/i.test(title)) return true
  return title === '数据分析' || title === '分析笔记本'
}

const getDefaultNotebookProfile = () => {
  const profiles = getSystemModelProfiles()
  if (profiles.length === 0) return null
  return profiles[0]!
}

const sanitizeTitle = (raw: string): string => {
  const cleaned = raw
    .replace(/^[「『"'""''（(]+/, '')
    .replace(/[」』"'""''）)。.!！?？；;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > MAX_TITLE_LEN ? cleaned.slice(0, MAX_TITLE_LEN) : cleaned
}

/**
 * 根据会话首条用户消息生成标题。
 * @returns 标题文本；失败 / 为空 / 配置缺失时返回 null
 */
export const generateNotebookSessionTitle = async (
  record: NotebookSessionRecord,
): Promise<string | null> => {
  const firstUserMsg = record.messages.find((m) => m.role === 'user')
  if (!firstUserMsg?.content?.trim()) return null

  const profile = getDefaultNotebookProfile()
  if (!profile?.baseUrl || !profile.apiKey || !profile.model) return null

  const prompt = `${TITLE_PROMPT_PREFIX}${firstUserMsg.content.slice(0, 800)}`
  const resourceLoader = createPiAgentResourceLoader(() =>
    '你是一个标题生成助手，只输出标题本身，不要任何额外文字。',
  )
  await resourceLoader.reload()
  const { authStorage, modelRegistry } = createModelRegistryFromProfile(profile)
  const model = buildModelFromProfile(profile)
  const sessionManager = SessionManager.inMemory()

  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | null = null
  try {
    const created = await createAgentSession({
      sessionManager,
      authStorage,
      modelRegistry,
      model: model as never,
      thinkingLevel: 'low',
      cwd: process.cwd(),
      customTools: [],
      resourceLoader,
      noTools: 'builtin',
    })
    session = created.session
    const reply = await session.prompt(prompt)
    const title = sanitizeTitle(typeof reply === 'string' ? reply : String(reply ?? ''))
    return title || null
  } catch {
    return null
  } finally {
    session?.dispose?.()
  }
}
