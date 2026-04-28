import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { createTableResult, extractTableRows } from '../result'

const serializeDedupKey = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => serializeDedupKey(item)))
  }

  if (value && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    return JSON.stringify(sortedEntries.map(([key, item]) => [key, serializeDedupKey(item)]))
  }

  return JSON.stringify(value)
}

const buildDedupKey = (row: Record<string, unknown>, fields: string[]) =>
  fields.map((field) => `${field}:${serializeDedupKey(row[field])}`).join('|')

export const dataDedupNode: NodeDefinition = {
  name: 'data-dedup',
  displayName: '去重',
  icon: 'copy-minus',
  category: 'action',
  description: '仅处理重复记录，支持按整行或按字段组合去重。',
  properties: [
    {
      name: 'deduplicationMode',
      displayName: '去重方式',
      type: 'options',
      default: 'by_fields',
      options: [
        { name: '不处理', value: 'none' },
        { name: '按整行去重', value: 'full_row' },
        { name: '按指定字段去重', value: 'by_fields' },
      ],
      description: '按当前数据顺序去重；若需要保留最新记录，请先用排序节点整理顺序。',
    },
    {
      name: 'deduplicationFields',
      displayName: '去重字段',
      type: 'multi-options',
      default: [],
      useUpstreamFactors: true,
      editable: true,
      forceInput: true,
      displayIf: (config) => config.deduplicationMode === 'by_fields',
      description: '仅在“按指定字段去重”时生效。未配置字段时会阻止执行。',
    },
    {
      name: 'deduplicationKeep',
      displayName: '去重保留方式',
      type: 'options',
      default: 'first',
      displayIf: (config) => config.deduplicationMode && config.deduplicationMode !== 'none',
      options: [
        { name: '保留首条', value: 'first' },
        { name: '保留末条', value: 'last' },
      ],
      description: '基于当前表格顺序保留首条或末条记录。',
    },
  ],
  execute: async (input, config) => {
    const inputRows = extractTableRows(input)
    if (!inputRows) throw new Error('输入数据格式不正确')

    let data = JSON.parse(JSON.stringify(inputRows))
    const originalCount = data.length
    if (originalCount === 0) {
      return createTableResult([], {
        meta: {
          stats: {},
        },
      })
    }

    const deduplicationMode = config.deduplicationMode || 'by_fields'
    const keepStrategy = config.deduplicationKeep || 'first'
    let dedupFields: string[] = []

    if (deduplicationMode === 'full_row') {
      dedupFields = Array.from<string>(
        data.reduce((fieldSet: Set<string>, row: Record<string, unknown>) => {
          Object.keys(row).forEach((field) => fieldSet.add(field))
          return fieldSet
        }, new Set<string>()),
      ).sort((a, b) => a.localeCompare(b))
    } else if (deduplicationMode === 'by_fields') {
      const configuredFields = Array.isArray(config.deduplicationFields)
        ? config.deduplicationFields.filter((field: unknown): field is string => typeof field === 'string')
        : []
      dedupFields = configuredFields.filter((field) =>
        data.some((row: Record<string, unknown>) => field in row),
      )
      if (dedupFields.length === 0) {
        throw new Error('按字段去重时必须至少选择一个去重字段')
      }
    }

    if (deduplicationMode !== 'none' && dedupFields.length > 0) {
      const seen = new Set<string>()
      const deduplicated: Array<Record<string, unknown>> = []
      const sourceRows = keepStrategy === 'last' ? [...data].reverse() : data

      sourceRows.forEach((row: Record<string, unknown>) => {
        const dedupKey = buildDedupKey(row, dedupFields)
        if (seen.has(dedupKey)) return
        seen.add(dedupKey)
        deduplicated.push(row)
      })

      data = keepStrategy === 'last' ? deduplicated.reverse() : deduplicated
    }

    return createTableResult(markRaw(data), {
      meta: {
        stats: {
          originalCount,
          finalCount: data.length,
          duplicatesRemoved: originalCount - data.length,
          deduplicationMode,
          deduplicationKeep: keepStrategy,
        },
        originalCount,
        deduplicatedCount: data.length,
      },
    })
  },
}
