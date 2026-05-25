import type { KanbanFactorValue, KanbanTreeNode } from '@/services/kanbanIntegration'
import type { CustomFactorRecord } from './types'

const sortByLabel = <T>(items: T[], getLabel: (item: T) => string) =>
  [...items].sort((left, right) => getLabel(left).localeCompare(getLabel(right), 'zh-CN'))

const createFactorNode = (
  processName: string,
  factor: CustomFactorRecord,
): KanbanTreeNode => ({
  key: `custom-factor:${processName}::${factor.identityKey}`,
  label: factor.factorName || factor.factorKey,
  data: {
    nodeType: 'factor',
    sceneName: '自定义因子',
    process: processName,
    factorKey: factor.factorKey,
    isCustomFactor: true,
    identityKey: factor.identityKey,
    value: {
      factorKey: factor.factorKey,
      factorName: factor.factorName,
      materialType: factor.materialType,
      processName,
      r2Name: factor.r2Name,
    } satisfies KanbanFactorValue,
    searchText: `自定义因子 / ${processName} / ${factor.factorName || factor.factorKey}`,
  },
})

export const mergeCustomFactorsIntoTree = (
  baseTree: KanbanTreeNode[],
  customFactors: CustomFactorRecord[],
) => {
  if (customFactors.length === 0) return baseTree

  const processMap = new Map<string, KanbanTreeNode>()

  baseTree.forEach((node) => {
    if (!node?.key) return
    processMap.set(String(node.label || node.key), {
      ...node,
      children: Array.isArray(node.children) ? [...node.children] : [],
    })
  })

  customFactors.forEach((factor) => {
    const processName = factor.processName || '未命名工序'
    const existingNode = processMap.get(processName)
    const nextChild = createFactorNode(processName, factor)

    if (existingNode) {
      existingNode.children = sortByLabel(
        [...(existingNode.children || []), nextChild],
        (item) => item.label || '',
      )
      processMap.set(processName, existingNode)
      return
    }

    processMap.set(processName, {
      key: `process:${processName}`,
      label: processName,
      data: {
        nodeType: 'process',
        process: processName,
        sceneName: '自定义因子',
        searchText: `自定义因子 / ${processName}`,
      },
      children: [nextChild],
    })
  })

  return sortByLabel(Array.from(processMap.values()), (item) => item.label || '')
}
