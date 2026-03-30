import type { WorkflowAiNodeCatalogItem } from '../../../ai/types.js'

const normalize = (value: string) => value.trim().toLowerCase()

export const searchNodesTool = (
  nodeCatalog: WorkflowAiNodeCatalogItem[],
  input: {
    keywords?: string[]
    preferredNodeNames?: string[]
  },
) => {
  const preferredNodeNames = new Set(input.preferredNodeNames ?? [])
  const keywords = (input.keywords ?? []).map(normalize)

  const nodes = [...nodeCatalog]
    .map((item) => {
      const assistantHints = (item.assistantHints ?? {}) as {
        keywords?: string[]
        useCases?: string[]
      }
      const hintKeywords = [...(assistantHints.keywords ?? []), ...(assistantHints.useCases ?? [])].map(normalize)
      let score = preferredNodeNames.has(item.name) ? 10 : 0
      score += keywords.filter((keyword) => hintKeywords.some((hint) => hint.includes(keyword))).length
      return {
        item,
        score,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item)

  return {
    ok: true,
    message: nodes.length ? `已匹配 ${nodes.length} 个候选节点` : '未匹配到明确候选节点',
    data: nodes,
  }
}
