import { markRaw } from 'vue'
import type { MultipleNodeExecutionInput, MultipleNodeExecutionItem, NodeDefinition } from '../types'
import { createTableResult, extractTableRows } from '../result'

type KeyMergeItem = MultipleNodeExecutionItem
type KeyMergeInput = MultipleNodeExecutionInput

type KeyMapping = {
  sourceNodeId?: string
  mergeKey?: string
  renamedKey?: string
}

type KeyMergeConfig = {
  keyMappings?: KeyMapping[]
}

type DatasetContext = {
  item: KeyMergeItem
  rows: Array<Record<string, unknown>>
  mergeKey: string
  renamedKey: string
  suffix: string
}

const normalizeKey = (value: unknown) => String(value ?? '')

const getRows = (item: KeyMergeItem) => {
  const rows = extractTableRows(item.result)
  if (!rows) {
    throw new Error(`节点 ${item.sourceNodeLabel} 的输出不是表格数据`)
  }
  return rows
}

const sanitizeSuffix = (label: string, fallback: string) => {
  const sanitized = label.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '')
  return sanitized || fallback
}

const getSourceOptions = (inputData: unknown) => {
  const inputs = Array.isArray((inputData as KeyMergeInput | null | undefined)?.inputs)
    ? (inputData as KeyMergeInput).inputs!
    : []

  return inputs.map((item) => ({
    name: item.sourceNodeLabel || item.sourceNodeId,
    value: item.sourceNodeId,
  }))
}

export const dataKeyMergeNode: NodeDefinition<KeyMergeInput | null, KeyMergeConfig> = {
  name: 'data-key-merge',
  displayName: '按键合并',
  icon: 'combine',
  category: 'action',
  description: '按各输入节点指定的键字段做对象级合并，并保留所有键的并集。',
  inputMode: 'multiple',
  minInputs: 2,
  maxInputs: null,
  properties: [
    {
      name: 'keyMappings',
      displayName: '合并键配置',
      type: 'collection',
      default: [],
      description: '为每个上游输入配置自己的合并键与统一键名。',
      properties: [
        {
          name: 'sourceNodeId',
          displayName: '来源节点',
          type: 'options',
          default: '',
          placeholder: '请选择来源节点',
          resolveOptions: ({ inputData }) => getSourceOptions(inputData),
          description: '按连接到当前节点的上游来源进行选择。',
        },
        {
          name: 'mergeKey',
          displayName: '来源键字段',
          type: 'options',
          default: '',
          useUpstreamFactors: true,
          editable: true,
          description: '该来源中用于匹配的字段名。',
        },
        {
          name: 'renamedKey',
          displayName: '统一键名称',
          type: 'string',
          default: '合并键',
          description: '合并后输出表中的统一键字段名称。',
        },
      ],
    },
  ],
  execute: async (input, config) => {
    const items = Array.isArray(input?.inputs) ? input.inputs : []
    if (items.length < 2) {
      throw new Error('按键合并至少需要 2 个输入')
    }

    const keyMappings = Array.isArray(config.keyMappings) ? config.keyMappings : []
    const datasetContexts: DatasetContext[] = items.map((item, index) => {
      const rows = getRows(item)
      const mapping = keyMappings.find((current) => current.sourceNodeId === item.sourceNodeId)
      const mergeKey =
        typeof mapping?.mergeKey === 'string' && mapping.mergeKey.trim()
          ? mapping.mergeKey.trim()
          : ''
      const renamedKey =
        typeof mapping?.renamedKey === 'string' && mapping.renamedKey.trim()
          ? mapping.renamedKey.trim()
          : '合并键'

      if (!mergeKey) {
        throw new Error(`请为节点 ${item.sourceNodeLabel} 配置合并键`)
      }

      return {
        item,
        rows,
        mergeKey,
        renamedKey,
        suffix: sanitizeSuffix(item.sourceNodeLabel, `来源${index + 1}`),
      }
    })

    const unifiedKeyName = datasetContexts[0]?.renamedKey ?? '合并键'
    const unionKeys = [
      ...new Set(
        datasetContexts.flatMap(({ rows, mergeKey }) =>
          rows.map((row) => normalizeKey(row[mergeKey])),
        ),
      ),
    ]

    const fieldsBySource = new Map<string, string[]>()
    datasetContexts.forEach(({ item, rows, mergeKey }) => {
      const fields = [...new Set(rows.flatMap((row) => Object.keys(row).filter((field) => field !== mergeKey)))]
      fieldsBySource.set(item.sourceNodeId, fields)
    })

    const lineageFields: Record<string, Array<{ sourceNodeId: string; sourceField: string }>> = {}
    const conflicts = new Set<string>()

    const outputRows = unionKeys.map((currentKey) => {
      const mergedRow: Record<string, unknown> = {
        [unifiedKeyName]: currentKey,
      }

      datasetContexts.forEach(({ item, rows, mergeKey, suffix }) => {
        const matchedRow = rows.find((row) => normalizeKey(row[mergeKey]) === currentKey) ?? null
        const fields = fieldsBySource.get(item.sourceNodeId) ?? []

        fields.forEach((field) => {
          const incomingValue = matchedRow ? rowValueOrNull(matchedRow, field) : null
          const targetField =
            field in mergedRow ? `${field}_${suffix}` : field

          if (field in mergedRow) {
            conflicts.add(field)
          }

          mergedRow[targetField] = incomingValue
          lineageFields[targetField] ??= []
          if (
            !lineageFields[targetField].some(
              (entry) => entry.sourceNodeId === item.sourceNodeId && entry.sourceField === field,
            )
          ) {
            lineageFields[targetField].push({
              sourceNodeId: item.sourceNodeId,
              sourceField: field,
            })
          }
        })
      })

      return mergedRow
    })

    return createTableResult(markRaw(outputRows), {
      meta: {
        stats: {
          inputCount: items.length,
          unionKeyCount: unionKeys.length,
          outputRows: outputRows.length,
          outputFieldCount: outputRows[0] ? Object.keys(outputRows[0]).length : 0,
          conflictFieldCount: conflicts.size,
        },
        diagnostics: {
          conflicts: [...conflicts],
        },
      },
      lineage: {
        fields: lineageFields,
      },
    })
  },
}

const rowValueOrNull = (row: Record<string, unknown>, field: string) =>
  field in row ? row[field] : null
