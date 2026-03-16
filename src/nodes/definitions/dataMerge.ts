import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { calculateBoxValues } from '../../utils/stats'

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

const buildFieldList = (datasets: Array<Array<Record<string, unknown>>>, mode: 'union' | 'intersection') => {
  if (datasets.length === 0) return []

  const fieldSets = datasets.map((rows) => new Set(rows.flatMap((row) => Object.keys(row))))
  const [firstFieldSet] = fieldSets
  if (mode === 'intersection') {
    return firstFieldSet ? [...firstFieldSet].filter((field) => fieldSets.every((fieldSet) => fieldSet.has(field))) : []
  }

  return [...new Set(datasets.flatMap((rows) => rows.flatMap((row) => Object.keys(row))))]
}

export const dataMergeNode: NodeDefinition = {
  name: 'data-merge',
  displayName: '数据合并',
  icon: 'git-merge',
  category: 'action',
  description: '支持多种方式（纵向追加、横向关联或分组集合）合并多个数据集。',
  inputMode: 'multiple',
  minInputs: 2,
  maxInputs: null,
  properties: [
    {
      name: 'mergeMode',
      displayName: '合并模式',
      type: 'options',
      default: 'append',
      options: [
        { name: '纵向追加 (Append Rows)', value: 'append' },
        { name: '横向关联 (Join Columns)', value: 'join' },
        { name: '分组集合 (Parallel Collection)', value: 'collection' },
      ],
    },
    // Append Rows Properties
    {
      name: 'alignFieldsMode',
      displayName: '字段对齐方式',
      type: 'options',
      default: 'union',
      options: [
        { name: '字段并集', value: 'union' },
        { name: '字段交集', value: 'intersection' },
      ],
      displayIf: (config) => config.mergeMode === 'append',
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
      displayIf: (config) => config.mergeMode === 'append',
    },
    {
      name: 'addSourceTag',
      displayName: '添加来源标记',
      type: 'boolean',
      default: false,
      displayIf: (config) => config.mergeMode === 'append',
    },
    {
      name: 'sourceTagName',
      displayName: '来源字段名',
      type: 'string',
      default: '__source',
      displayIf: (config) => config.mergeMode === 'append' && config.addSourceTag === true,
    },
    // Join Columns Properties
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
      displayIf: (config) => config.mergeMode === 'join',
    },
    {
      name: 'baseJoinKey',
      displayName: '关联键',
      type: 'string',
      default: 'id',
      displayIf: (config) => config.mergeMode === 'join',
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
      displayIf: (config) => config.mergeMode === 'join',
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
      displayIf: (config) => config.mergeMode === 'join' && config.conflictStrategy === 'suffix',
    },
    {
      name: 'dropDuplicateKeyFields',
      displayName: '丢弃重复关联键',
      type: 'boolean',
      default: true,
      displayIf: (config) => config.mergeMode === 'join',
    },
  ],
  execute: async (input: MergeExecutionInput | null, config) => {
    const items = Array.isArray(input?.inputs) ? input.inputs : []
    if (items.length < 2) {
      throw new Error('数据合并至少需要 2 个输入')
    }

    if (config.mergeMode === 'collection') {
      const outputData = items.map((item) => ({
        name: item.sourceNodeLabel,
        data: item.payload?.data || [],
      }))

      // Auto-generate boxplot chart option if all groups have numeric data
      let chartOption = null
      try {
        const groups = outputData.filter((g) => g.data.length > 0)
        if (groups.length >= 1) {
          // Find common numeric fields
          const firstGroupFields = Object.keys(groups[0].data[0] || {}).filter(
            (k) => typeof groups[0].data[0][k] === 'number',
          )

          if (firstGroupFields.length > 0) {
            const targetField = firstGroupFields[0]!
            const sourceNames = groups.map((group) => group.name)
            const boxData = groups.map((g) => calculateBoxValues(g.data, targetField))

            chartOption = {
              title: { text: `分组对比分析: ${targetField}`, left: 'center' },
              tooltip: { trigger: 'item', axisPointer: { type: 'shadow' } },
              grid: { left: '10%', right: '10%', bottom: '15%' },
              xAxis: {
                type: 'category',
                data: sourceNames,
                boundaryGap: true,
                nameGap: 30,
                splitArea: { show: false },
                splitLine: { show: false },
              },
              yAxis: {
                type: 'value',
                name: targetField,
                splitArea: { show: true },
              },
              series: [
                {
                  name: 'boxplot',
                  type: 'boxplot',
                  data: boxData,
                  itemStyle: {
                    color: '#f8fafc',
                    borderColor: '#2563eb',
                    borderWidth: 1.5,
                  },
                },
              ],
            }
          }
        }
      } catch (e) {
        console.warn('Failed to generate preview chart for collection', e)
      }

      return {
        data: markRaw(outputData),
        chartOption: chartOption ? markRaw(chartOption) : null,
        stats: {
          inputCount: items.length,
          groupCount: items.length,
          totalRows: outputData.reduce((acc, curr) => acc + curr.data.length, 0),
        },
        lineage: {
          groups: items.map((item) => ({ sourceNodeId: item.sourceNodeId, name: item.sourceNodeLabel })),
        },
      }
    }

    if (config.mergeMode === 'append') {
      // Logic from append.ts
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
    } else {
      // Logic from objectMerge.ts (join mode)
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
        throw new Error('横向关联缺少基准数据集')
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
    }
  },
}
