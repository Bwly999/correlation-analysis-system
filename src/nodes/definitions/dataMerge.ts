import { markRaw } from 'vue'
import type { MultipleNodeExecutionInput, MultipleNodeExecutionItem, NodeDefinition } from '../types'
import { calculateBoxValues } from '../../utils/stats'
import {
  createTableCollectionResult,
  createTableResult,
  extractTableRows,
  isNodeResult,
} from '../result'

type MergeInputItem = MultipleNodeExecutionItem
type MergeExecutionInput = MultipleNodeExecutionInput

type MergeConfig = {
  mergeMode?: 'append' | 'join' | 'collection'
  alignFieldsMode?: 'union' | 'intersection'
  fillMissingValue?: 'null' | 'empty_string'
  addSourceTag?: boolean
  sourceTagName?: string
  unifiedKeyName?: string
  keyMappings?: Array<{
    sourceNodeId?: string
    mergeKey?: string
  }>
}

const getRows = (item: MergeInputItem) => {
  const rows = extractTableRows(item.result)
  if (!rows) {
    throw new Error(`节点 ${item.sourceNodeLabel} 的输出不是表格数据`)
  }

  return rows
}

const normalizeKey = (value: unknown) => String(value ?? '')

const rowValueOrNull = (row: Record<string, unknown>, field: string) =>
  field in row ? row[field] : null

const sanitizeSuffix = (label: string, fallback: string) => {
  const sanitized = label.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '')
  return sanitized || fallback
}

const getSourceOptions = (inputData: unknown) => {
  const inputs = Array.isArray((inputData as MergeExecutionInput | null | undefined)?.inputs)
    ? (inputData as MergeExecutionInput).inputs!
    : []

  return inputs.map((item) => ({
    name: item.sourceNodeLabel || item.sourceNodeId,
    value: item.sourceNodeId,
  }))
}

const getSourceFieldOptions = (inputData: unknown, sourceNodeId: string | undefined) => {
  if (!sourceNodeId) return []

  const inputs = Array.isArray((inputData as MergeExecutionInput | null | undefined)?.inputs)
    ? (inputData as MergeExecutionInput).inputs!
    : []
  const matchedInput = inputs.find((item) => item.sourceNodeId === sourceNodeId)
  if (!matchedInput) return []

  const schemaFields =
    isNodeResult(matchedInput.result) && Array.isArray(matchedInput.result.schema?.fields)
      ? matchedInput.result.schema.fields.map((field) => field.name)
      : []

  const rowFields = extractTableRows(matchedInput.result)?.flatMap((row) => Object.keys(row)) ?? []
  const fields = [...new Set([...schemaFields, ...rowFields])]

  return fields.map((field) => ({
    name: field,
    value: field,
  }))
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

export const dataMergeNode: NodeDefinition<MergeExecutionInput | null, MergeConfig> = {
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
      name: 'unifiedKeyName',
      displayName: '统一键名称',
      type: 'string',
      default: '合并键',
      description: '横向关联后统一保留的主键字段名称，各来源原始键字段会被移除。',
      displayIf: (config) => config.mergeMode === 'join',
    },
    {
      name: 'keyMappings',
      displayName: '来源键配置',
      type: 'collection',
      default: [],
      description: '为每个上游输入单独指定来源键字段。',
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
          placeholder: '请选择或手动输入来源键字段',
          editable: true,
          forceInput: true,
          dependencies: ['sourceNodeId'],
          resolveOptions: ({ config, inputData }) =>
            getSourceFieldOptions(inputData, config.sourceNodeId),
          description: '该来源中用于匹配的字段名。',
        },
      ],
      displayIf: (config) => config.mergeMode === 'join',
    },
  ],
  execute: async (input, config) => {
    const items = Array.isArray(input?.inputs) ? input.inputs : []
    if (items.length < 2) {
      throw new Error('数据合并至少需要 2 个输入')
    }

    if (config.mergeMode === 'collection') {
      const outputData = items.map((item) => ({
        name: item.sourceNodeLabel,
        data: getRows(item),
      }))

      // Auto-generate boxplot chart option if all groups have numeric data
      let chartOption = null
      try {
        const groups = outputData.filter((g) => g.data.length > 0)
        if (groups.length >= 1) {
          // Find common numeric fields
          const firstGroup = groups[0]!
          const firstGroupRow = firstGroup.data[0] ?? {}
          const firstGroupFields = Object.keys(firstGroupRow).filter(
            (k) => typeof firstGroupRow[k] === 'number',
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

      return createTableCollectionResult(markRaw(outputData), {
        meta: {
          chartOption: chartOption ? markRaw(chartOption) : null,
          stats: {
            inputCount: items.length,
            groupCount: items.length,
            totalRows: outputData.reduce((acc, curr) => acc + curr.data.length, 0),
          },
        },
        lineage: {
          groups: items.map((item) => ({
            sourceNodeId: item.sourceNodeId,
            name: item.sourceNodeLabel,
          })),
        },
        preview: {
          viewer: chartOption ? 'table-chart-combo-viewer' : 'table-collection-preview',
          summary: `共 ${items.length} 组，${outputData.reduce((acc, curr) => acc + curr.data.length, 0)} 行样本`,
        },
      })
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

      return createTableResult(markRaw(outputRows), {
        meta: {
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
        },
        lineage: {
          fields: lineageFields,
        },
      })
    } else {
      const keyMappings = Array.isArray(config.keyMappings) ? config.keyMappings : []
      const datasets = items.map((item, index) => {
        const rows = getRows(item)
        const mapping = keyMappings.find((current) => current.sourceNodeId === item.sourceNodeId)
        const mergeKey =
          typeof mapping?.mergeKey === 'string' && mapping.mergeKey.trim()
            ? mapping.mergeKey.trim()
            : ''

        if (!mergeKey) {
          throw new Error(`请为节点 ${item.sourceNodeLabel} 配置来源键字段`)
        }

        return {
          item,
          rows,
          mergeKey,
          suffix: sanitizeSuffix(item.sourceNodeLabel, `来源${index + 1}`),
        }
      })

      const unifiedKeyName =
        typeof config.unifiedKeyName === 'string' && config.unifiedKeyName.trim()
          ? config.unifiedKeyName.trim()
          : '合并键'

      const unionKeys = [
        ...new Set(
          datasets.flatMap(({ rows, mergeKey }) => rows.map((row) => normalizeKey(row[mergeKey]))),
        ),
      ]

      const fieldsBySource = new Map<string, string[]>()
      datasets.forEach(({ item, rows, mergeKey }) => {
        const fields = [
          ...new Set(rows.flatMap((row) => Object.keys(row).filter((field) => field !== mergeKey))),
        ]
        fieldsBySource.set(item.sourceNodeId, fields)
      })

      const lineageFields: Record<string, Array<{ sourceNodeId: string; sourceField: string }>> = {}
      const conflicts = new Set<string>()

      const outputRows = unionKeys.map((currentKey) => {
        const mergedRow: Record<string, unknown> = {
          [unifiedKeyName]: currentKey,
        }

        datasets.forEach(({ item, rows, mergeKey, suffix }) => {
          const matchedRow = rows.find((row) => normalizeKey(row[mergeKey]) === currentKey) ?? null
          const fields = fieldsBySource.get(item.sourceNodeId) ?? []

          fields.forEach((field) => {
            const incomingValue = matchedRow ? rowValueOrNull(matchedRow, field) : null
            const targetField = field in mergedRow ? `${field}_${suffix}` : field

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
    }
  },
}
