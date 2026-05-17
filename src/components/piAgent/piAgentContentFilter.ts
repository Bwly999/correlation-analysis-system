const TOOL_SUMMARY_PREFIXES = [
  '可用节点一览',
  '节点目录',
  '数据源列表',
  '数据源信息',
  '读取分析上下文',
  '读取节点定义',
  '读取字段摘要',
  '搜索节点结果',
]

const TOOL_SUMMARY_KEYWORDS = [
  'workflow_get_session_context',
  'workflow_get_node_catalog',
  'workflow_list_data_sources',
  'workflow_get_data_source_schema',
  'workflow_search_nodes',
  'workflow_get_node_definition',
]

const SYSTEM_PROMPT_MARKERS = [
  '你是一个数据分析助手',
  '## 你的能力',
  '## 工作流程',
  '## 规则',
  '## 当前上下文',
  '## 可用数据源',
  '## 用户需求',
  '所有回复使用中文',
  '核心结论必须有数据支撑',
  '优先构建最小可运行工作流，避免过度设计',
  '删除节点等高风险操作需要先确认',
  '创建工作流时确保节点之间正确连接',
  '配置节点参数时参考节点定义中的 properties 说明',
]

const TOOL_JSON_KEYS = [
  'mode',
  'prompt',
  'workflowSnapshotSummary',
  'contextHints',
  'dataSources',
  'total',
  'count',
  'offset',
  'limit',
  'hasMore',
  'nextOffset',
]

const isJsonBlockStart = (line: string) => line.trim() === '{'
const isJsonBlockEnd = (line: string) => line.trim() === '}'
const isLikelyToolJsonLine = (line: string) =>
  TOOL_JSON_KEYS.some((key) => line.includes(`"${key}"`)) || line.includes('":')
const isKeyValueContextLine = (line: string) =>
  TOOL_JSON_KEYS.some((key) => line.includes(`${key}:`)) || /^"(mode|prompt|total|count|offset|limit|hasMore|nextOffset|contextHints|dataSources|workflowSnapshotSummary)"\s*:/.test(line.trim())

export function stripPiAgentToolSummary(content: string): string {
  if (!content) return content

  const trimmed = content.trim()
  const hasToolSummaryPrefix = TOOL_SUMMARY_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
  const hasToolSummaryKeyword = TOOL_SUMMARY_KEYWORDS.some((keyword) => trimmed.includes(keyword))
  const hasContextBlockKeyword =
    TOOL_JSON_KEYS.some((key) => trimmed.includes(`"${key}"`))
    || TOOL_JSON_KEYS.some((key) => trimmed.includes(`${key}:`))

  const hasSystemPromptMarker = SYSTEM_PROMPT_MARKERS.some((marker) => trimmed.includes(marker))
  if (!hasToolSummaryPrefix && !hasToolSummaryKeyword && !hasSystemPromptMarker && !hasContextBlockKeyword) {
    return content
  }

  if (trimmed.startsWith('你是一个数据分析助手')) {
    const remainder = content
      .split('\n')
      .filter((line) => !SYSTEM_PROMPT_MARKERS.some((marker) => line.includes(marker)))
      .filter((line) => !/^\d+\.\s/.test(line.trim()))
      .filter((line) => !/^\s*$/.test(line))
      .join('\n')
      .trim()
    return remainder || content
  }

  const lines = content.split('\n')
  const filtered: string[] = []
  let skippingToolSummary = false
  let skippingSystemPrompt = false
  let skippingJsonBlock = false
  let skippingContextBlock = false
  const systemPromptEnders = [
    '最终建议：',
    '分析结论：',
    '结论：',
    '建议：',
    '下面是',
    '我建议',
    '你可以',
    '总结：',
  ]

  for (const line of lines) {
    const normalized = line.trim()

    if (isKeyValueContextLine(line)) {
      skippingContextBlock = true
      continue
    }

    if (skippingContextBlock) {
      if (!normalized) continue
      if (/^最终建议[:：]/.test(normalized) || /^分析结论[:：]/.test(normalized) || /^结论[:：]/.test(normalized) || /^建议[:：]/.test(normalized)) {
        skippingContextBlock = false
        filtered.push(line)
        continue
      }
      continue
    }

    if (isJsonBlockStart(line)) {
      skippingJsonBlock = true
      continue
    }

    if (skippingJsonBlock) {
      if (isJsonBlockEnd(line)) {
        skippingJsonBlock = false
      }
      continue
    }

    if (/^用户消息：/.test(normalized)) {
      continue
    }

    if (/^模式：/.test(normalized)) {
      continue
    }

    if (SYSTEM_PROMPT_MARKERS.some((marker) => normalized.includes(marker))) {
      skippingSystemPrompt = true
      continue
    }

    if (skippingSystemPrompt) {
      if (!normalized) continue
      if (systemPromptEnders.some((ender) => normalized.startsWith(ender))) {
        skippingSystemPrompt = false
        filtered.push(line)
        continue
      }
      if (/^## /.test(normalized)) continue
      if (/^[-*]\s/.test(normalized)) continue
      if (/^\d+\.\s/.test(normalized)) continue
      if (/^用户消息：/.test(normalized)) continue
      if (/^你是一个数据分析助手/.test(normalized)) continue
      if (/^用户需求/.test(normalized)) continue
      if (/^模式：/.test(normalized)) continue
      if (/^工作流名称：/.test(normalized)) continue
      if (/^现有节点数：/.test(normalized)) continue
      if (/^现有连线数：/.test(normalized)) continue
      if (/^可用数据源/.test(normalized)) continue
      continue
    }

    if (/^(📦|🔵|🟢|🔴|🎯)/.test(normalized) || isLikelyToolJsonLine(line)) {
      skippingToolSummary = true
      continue
    }

    if (skippingToolSummary) {
      if (!normalized) continue
      if (/^["“]/.test(normalized) || /^[-*]/.test(normalized)) continue
      if (/^undefined+$/.test(normalized.replace(/\s+/g, ''))) continue
      if (TOOL_SUMMARY_PREFIXES.some((prefix) => normalized.includes(prefix))) continue
      if (TOOL_SUMMARY_KEYWORDS.some((keyword) => normalized.includes(keyword))) continue
      if (/^[#>]/.test(normalized)) {
        skippingToolSummary = false
        filtered.push(line)
        continue
      }
      continue
    }

    filtered.push(line)
  }

  const output = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return output || content
}
