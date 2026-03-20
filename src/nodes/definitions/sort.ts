import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { createTableResult, extractTableRows } from '../result'

type SortDirection = 'asc' | 'desc'

type SortRule = {
  field?: string
  direction?: SortDirection
}

type SortConfig = {
  sortRules?: SortRule[]
}

const toSortableNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const compareValues = (left: unknown, right: unknown, direction: SortDirection) => {
  const leftEmpty = left === null || left === undefined || left === ''
  const rightEmpty = right === null || right === undefined || right === ''
  if (leftEmpty && rightEmpty) return 0
  if (leftEmpty) return 1
  if (rightEmpty) return -1

  const leftNumber = toSortableNumber(left)
  const rightNumber = toSortableNumber(right)
  let result = 0

  if (leftNumber !== null && rightNumber !== null) {
    result = leftNumber - rightNumber
  } else {
    result = String(left).localeCompare(String(right), 'zh-CN')
  }

  return direction === 'desc' ? -result : result
}

export const sortNode: NodeDefinition<unknown, SortConfig> = {
  name: 'sort',
  displayName: '排序',
  icon: 'arrow-up-down',
  category: 'action',
  description: '按多个优先级规则对表格行排序。',
  properties: [
    {
      name: 'sortRules',
      displayName: '排序规则',
      type: 'collection',
      default: [],
      description: '越靠前的规则优先级越高。',
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
          name: 'direction',
          displayName: '排序方向',
          type: 'options',
          default: 'asc',
          options: [
            { name: '升序', value: 'asc' },
            { name: '倒序', value: 'desc' },
          ],
        },
      ],
    },
  ],
  execute: async (input, config) => {
    const rows = extractTableRows(input)
    if (!rows) {
      throw new Error('输入数据格式不正确')
    }

    const sortRules = Array.isArray(config.sortRules)
      ? config.sortRules.filter(
          (rule): rule is SortRule & { field: string } =>
            typeof rule?.field === 'string' && rule.field.trim() !== '',
        )
          .map((rule) => ({
            field: rule.field,
            direction: (rule.direction === 'desc' ? 'desc' : 'asc') as SortDirection,
          }))
      : []

    const outputRows = [...rows].sort((left, right) => {
      for (const rule of sortRules) {
        const compared = compareValues(left[rule.field], right[rule.field], rule.direction)
        if (compared !== 0) return compared
      }
      return 0
    })

    return createTableResult(markRaw(outputRows), {
      meta: {
        stats: {
          ruleCount: sortRules.length,
          outputCount: outputRows.length,
        },
      },
    })
  },
}
