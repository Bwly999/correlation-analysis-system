import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'

type MergeInputItem = {
  sourceNodeId: string
  sourceNodeLabel: string
  payload: { data?: Array<Record<string, unknown>> } | null
}

type MergeExecutionInput = {
  inputs?: MergeInputItem[]
}

const getRows = (item: MergeInputItem) => {
  const rows = item.payload?.data
  if (!Array.isArray(rows)) {
    throw new Error(`节点 ${item.sourceNodeLabel} 的输出不是表格数据`)
  }

  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
}

const normalizeKey = (value: unknown) => String(value ?? '')

export const objectMergeNode: NodeDefinition = {
  name: 'object-merge',
  displayName: '对象合并',
  icon: 'merge',
  category: 'action',
  description: '按关联键横向合并多个上游数据集，并处理字段冲突。',
  inputMode: 'multiple',
  minInputs: 2,
  maxInputs: null,
  properties: [
    {
      name: 'joinType',
      displayName: '连接方式',
      type: 'options',
      default: 'left',
      options: [
        { name: '左连接', value: 'left' },
        { name: '内连接', value: 'inner' },
        { name: '全连接', value: 'full' },
      ],
    },
    {
      name: 'baseJoinKey',
      displayName: '关联键',
      type: 'string',
      default: 'id',
    },
    {
      name: 'conflictStrategy',
      displayName: '冲突处理策略',
      type: 'options',
      default: 'suffix',
      options: [
        { name: '保留首个值', value: 'prefer_first' },
        { name: '后者覆盖前者', value: 'prefer_last' },
        { name: '追加来源后缀', value: 'suffix' },
      ],
    },
    {
      name: 'suffixMode',
      displayName: '后缀生成方式',
      type: 'options',
      default: 'source_label',
      options: [
        { name: '来源标签', value: 'source_label' },
        { name: '来源序号', value: 'source_index' },
      ],
      displayIf: (config) => config.conflictStrategy === 'suffix',
    },
    {
      name: 'dropDuplicateKeyFields',
      displayName: '丢弃重复关联键',
      type: 'boolean',
      default: true,
    },
  ],
  execute: async (input: MergeExecutionInput | null, config) => {
    const items = Array.isArray(input?.inputs) ? input.inputs : []
    if (items.length < 2) {
      throw new Error('对象合并至少需要 2 个输入')
    }

    const baseJoinKey = typeof config.baseJoinKey === 'string' && config.baseJoinKey.trim() ? config.baseJoinKey : 'id'
    const joinType = config.joinType === 'inner' || config.joinType === 'full' ? config.joinType : 'left'
    const conflictStrategy =
      config.conflictStrategy === 'prefer_first' || config.conflictStrategy === 'prefer_last'
        ? config.conflictStrategy
        : 'suffix'
    const suffixMode = config.suffixMode === 'source_index' ? 'source_index' : 'source_label'
    const dropDuplicateKeyFields = config.dropDuplicateKeyFields !== false

    const datasets = items.map((item) => ({ item, rows: getRows(item) }))
    const baseDataset = datasets[0]
    if (!baseDataset) {
      throw new Error('对象合并缺少基准数据集')
    }
    const restDatasets = datasets.slice(1)
    const otherIndexes = restDatasets.map(({ item, rows }, datasetIndex) => ({
      item,
      rows,
      index: datasetIndex + 1,
      fields: [...new Set(rows.flatMap((row) => Object.keys(row)))],
      map: new Map(rows.map((row) => [normalizeKey(row[baseJoinKey]), row])),
    }))

    let baseRows = [...baseDataset.rows]
    if (joinType === 'inner') {
      baseRows = baseRows.filter((row) =>
        otherIndexes.every(({ map }) => map.has(normalizeKey(row[baseJoinKey]))),
      )
    }

    const additionalRows =
      joinType === 'full'
        ? otherIndexes.flatMap(({ rows }) =>
            rows.filter(
              (row) =>
                !baseDataset.rows.some((baseRow) => normalizeKey(baseRow[baseJoinKey]) === normalizeKey(row[baseJoinKey])),
            ),
          )
        : []

    const workingRows = [...baseRows, ...additionalRows]
    const lineageFields: Record<string, Array<{ sourceNodeId: string; sourceField: string }>> = {}
    const conflicts: Array<{ field: string; sources: string[] }> = []
    let matchedRows = 0

    const outputRows = workingRows.map((baseRow) => {
      const mergedRow: Record<string, unknown> = { ...baseRow }
      const baseKey = normalizeKey(baseRow[baseJoinKey])

      for (const field of Object.keys(baseRow)) {
        lineageFields[field] ??= []
        if (!lineageFields[field].some((entry) => entry.sourceNodeId === baseDataset.item.sourceNodeId && entry.sourceField === field)) {
          lineageFields[field]!.push({ sourceNodeId: baseDataset.item.sourceNodeId, sourceField: field })
        }
      }

      for (const { item, map, index, fields } of otherIndexes) {
        const matchedRow = map.get(baseKey)
        if (matchedRow) matchedRows += 1

        const sourceSuffix = suffixMode === 'source_index' ? String(index + 1) : item.sourceNodeLabel.replace(/\s+/g, '_')
        const matchedKeys = matchedRow ? Object.keys(matchedRow) : []
        const allFields = new Set<string>([...fields, ...matchedKeys])

        for (const field of allFields) {
          if (field === baseJoinKey && dropDuplicateKeyFields) continue

          const incomingValue = matchedRow ? matchedRow[field] : null
          const hasConflict = field in mergedRow && field !== baseJoinKey

          if (hasConflict) {
            if (!conflicts.some((itemConflict) => itemConflict.field === field)) {
              conflicts.push({ field, sources: [baseDataset.item.sourceNodeLabel, item.sourceNodeLabel] })
            }

            if (conflictStrategy === 'prefer_last') {
              mergedRow[field] = incomingValue
            } else if (conflictStrategy === 'suffix') {
              mergedRow[`${field}_${sourceSuffix}`] = incomingValue
              lineageFields[`${field}_${sourceSuffix}`] ??= []
              lineageFields[`${field}_${sourceSuffix}`]!.push({ sourceNodeId: item.sourceNodeId, sourceField: field })
            }
          } else {
            mergedRow[field] = incomingValue
          }

          const lineageKey = hasConflict && conflictStrategy === 'suffix' ? `${field}_${sourceSuffix}` : field
          lineageFields[lineageKey] ??= []
          if (!lineageFields[lineageKey].some((entry) => entry.sourceNodeId === item.sourceNodeId && entry.sourceField === field)) {
            lineageFields[lineageKey]!.push({ sourceNodeId: item.sourceNodeId, sourceField: field })
          }
        }
      }

      return mergedRow
    })

    return {
      data: markRaw(outputRows),
      stats: {
        inputCount: items.length,
        outputRows: outputRows.length,
        matchedRows: Math.min(matchedRows, outputRows.length),
        unmatchedRows: Math.max(outputRows.length - Math.min(matchedRows, outputRows.length), 0),
        conflictFieldCount: conflicts.length,
      },
      diagnostics: {
        warnings: [],
        conflicts,
      },
      lineage: {
        fields: lineageFields,
      },
    }
  },
}
