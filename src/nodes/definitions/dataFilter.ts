import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'

type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'is_empty'
  | 'not_empty'

type FilterCondition = {
  field?: string
  operator?: FilterOperator
  value?: unknown
}

const toComparableNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const isEmptyValue = (value: unknown) => value === null || value === undefined || value === ''

const matchesCondition = (row: Record<string, unknown>, condition: FilterCondition) => {
  const field = typeof condition.field === 'string' ? condition.field : ''
  const operator = condition.operator ?? 'equals'
  const rowValue = row[field]
  const expectedValue = condition.value

  if (!field) return true

  if (operator === 'is_empty') return isEmptyValue(rowValue)
  if (operator === 'not_empty') return !isEmptyValue(rowValue)

  if (operator === 'contains') {
    return String(rowValue ?? '').includes(String(expectedValue ?? ''))
  }

  if (operator === 'equals') return rowValue === expectedValue
  if (operator === 'not_equals') return rowValue !== expectedValue

  const left = toComparableNumber(rowValue)
  const right = toComparableNumber(expectedValue)
  if (left === null || right === null) return false

  if (operator === 'gt') return left > right
  if (operator === 'gte') return left >= right
  if (operator === 'lt') return left < right
  if (operator === 'lte') return left <= right

  return false
}

export const dataFilterNode: NodeDefinition = {
  name: 'data-filter',
  displayName: '数据筛选',
  icon: 'filter',
  category: 'action',
  description: '根据多个条件筛选数据行，支持数值比较、文本匹配以及空值判断。',
  properties: [
    {
      name: 'matchMode',
      displayName: '条件关系',
      type: 'options',
      default: 'all',
      options: [
        { name: '全部满足', value: 'all' },
        { name: '任一满足', value: 'any' },
      ],
      description: '控制多条筛选条件之间是“且”关系还是“或”关系。',
    },
    {
      name: 'conditions',
      displayName: '筛选条件',
      type: 'collection',
      default: [],
      description: '按顺序定义筛选规则。字段可从上游选择，也可手动输入。',
      properties: [
        {
          name: 'field',
          displayName: '字段名',
          type: 'options',
          default: '',
          useUpstreamFactors: true,
          editable: true,
        },
        {
          name: 'operator',
          displayName: '运算符',
          type: 'options',
          default: 'equals',
          options: [
            { name: '等于', value: 'equals' },
            { name: '不等于', value: 'not_equals' },
            { name: '大于', value: 'gt' },
            { name: '大于等于', value: 'gte' },
            { name: '小于', value: 'lt' },
            { name: '小于等于', value: 'lte' },
            { name: '包含', value: 'contains' },
            { name: '为空', value: 'is_empty' },
            { name: '不为空', value: 'not_empty' },
          ],
        },
        {
          name: 'value',
          displayName: '比较值',
          type: 'string',
          default: '',
          description: '数值比较时会自动尝试转成数字。',
        },
      ],
    },
  ],
  execute: async (input, config) => {
    if (!input || !Array.isArray(input.data)) {
      throw new Error('输入数据格式不正确')
    }

    const rows = input.data.filter((row: unknown) => row && typeof row === 'object') as Array<
      Record<string, unknown>
    >
    const conditions = Array.isArray(config.conditions)
      ? (config.conditions as FilterCondition[]).filter((item) => item && item.field)
      : []

    if (conditions.length === 0) {
      return {
        data: markRaw(rows),
        stats: {
          originalCount: rows.length,
          filteredCount: rows.length,
        },
      }
    }

    const matchMode = config.matchMode === 'any' ? 'any' : 'all'
    const filteredRows = rows.filter((row) => {
      const results = conditions.map((condition) => matchesCondition(row, condition))
      return matchMode === 'any' ? results.some(Boolean) : results.every(Boolean)
    })

    return {
      data: markRaw(filteredRows),
      stats: {
        originalCount: rows.length,
        filteredCount: filteredRows.length,
      },
    }
  },
}
