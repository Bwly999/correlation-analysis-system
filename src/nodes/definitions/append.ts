import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'

type AppendInputItem = {
  sourceNodeId: string
  sourceNodeLabel: string
  payload: { data?: Array<Record<string, unknown>> } | null
}

type AppendExecutionInput = {
  inputs?: AppendInputItem[]
}

const getRows = (item: AppendInputItem) => {
  const rows = item.payload?.data
  if (!Array.isArray(rows)) {
    throw new Error(`节点 ${item.sourceNodeLabel} 的输出不是表格数据`)
  }

  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
}

const buildFieldList = (datasets: Array<Array<Record<string, unknown>>>, mode: 'union' | 'intersection') => {
  if (datasets.length === 0) return []

  const fieldSets = datasets.map((rows) => new Set(rows.flatMap((row) => Object.keys(row))))
  const [firstFieldSet] = fieldSets
  if (mode === 'intersection') {
    return firstFieldSet ? [...firstFieldSet].filter((field) => fieldSets.every((fieldSet) => fieldSet.has(field))) : []
  }

  return [...new Set(datasets.flatMap((rows) => rows.flatMap((row) => Object.keys(row))))]
}

export const appendNode: NodeDefinition = {
  name: 'append',
  displayName: '纵向追加',
  icon: 'rows-3',
  category: 'action',
  description: '将多个上游数据集按行拼接，并统一字段对齐方式。',
  inputMode: 'multiple',
  minInputs: 2,
  maxInputs: null,
  properties: [
    {
      name: 'alignFieldsMode',
      displayName: '字段对齐方式',
      type: 'options',
      default: 'union',
      options: [
        { name: '字段并集', value: 'union' },
        { name: '字段交集', value: 'intersection' },
      ],
    },
    {
      name: 'fillMissingValue',
      displayName: '缺失值填充',
      type: 'options',
      default: 'null',
      options: [
        { name: '填充 null', value: 'null' },
        { name: '空字符串', value: 'empty_string' },
      ],
    },
    {
      name: 'addSourceTag',
      displayName: '添加来源标记',
      type: 'boolean',
      default: false,
    },
    {
      name: 'sourceTagName',
      displayName: '来源字段名',
      type: 'string',
      default: '__source',
      displayIf: (config) => config.addSourceTag === true,
    },
  ],
  execute: async (input: AppendExecutionInput | null, config) => {
    const items = Array.isArray(input?.inputs) ? input.inputs : []
    if (items.length < 2) {
      throw new Error('纵向追加至少需要 2 个输入')
    }

    const datasets = items.map((item) => ({ item, rows: getRows(item) }))
    const alignMode = config.alignFieldsMode === 'intersection' ? 'intersection' : 'union'
    const fillValue = config.fillMissingValue === 'empty_string' ? '' : null
    const addSourceTag = config.addSourceTag === true
    const sourceTagName = typeof config.sourceTagName === 'string' && config.sourceTagName.trim() ? config.sourceTagName : '__source'
    const fields = buildFieldList(
      datasets.map((dataset) => dataset.rows),
      alignMode,
    )

    let filledCellCount = 0
    const lineageFields: Record<string, Array<{ sourceNodeId: string; sourceField: string }>> = {}

    const outputRows = datasets.flatMap(({ item, rows }) =>
      rows.map((row) => {
        const nextRow: Record<string, unknown> = {}
        for (const field of fields) {
          if (field in row) {
            nextRow[field] = row[field]
            lineageFields[field] ??= []
            if (!lineageFields[field].some((entry) => entry.sourceNodeId === item.sourceNodeId && entry.sourceField === field)) {
              lineageFields[field].push({ sourceNodeId: item.sourceNodeId, sourceField: field })
            }
          } else {
            nextRow[field] = fillValue
            filledCellCount += 1
          }
        }

        if (addSourceTag) {
          nextRow[sourceTagName] = item.sourceNodeLabel
        }

        return nextRow
      }),
    )

    if (addSourceTag) {
      lineageFields[sourceTagName] = items.map((item) => ({ sourceNodeId: item.sourceNodeId, sourceField: sourceTagName }))
    }

    return {
      data: markRaw(outputRows),
      stats: {
        inputCount: items.length,
        inputRows: datasets.map(({ rows }) => rows.length),
        outputRows: outputRows.length,
        fieldMode: alignMode,
        fieldCount: fields.length,
        filledCellCount,
      },
      diagnostics: {
        warnings: [],
      },
      lineage: {
        fields: lineageFields,
      },
    }
  },
}
