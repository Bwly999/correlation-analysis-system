const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const createTableResultLike = (rows: Array<Record<string, unknown>>) => ({
  kind: 'table' as const,
  payload: rows,
})

const extractRowsFromInput = (value: unknown) => {
  if (value && typeof value === 'object') {
    const normalized = value as { kind?: string; payload?: unknown }
    if (normalized.kind === 'table' && Array.isArray(normalized.payload)) {
      return normalized.payload as Array<Record<string, unknown>>
    }
  }
  if (Array.isArray(value)) {
    return value.filter(isPlainObject)
  }
  return null
}

export type InspectionNodeDefinition = {
  name: string
  displayName: string
  category: 'trigger' | 'action' | 'terminal'
  inputMode?: 'single' | 'multiple'
  properties: Array<{
    name: string
    displayName: string
    required?: boolean
    isRuntimeInput?: boolean
    type: string
    displayIf?: (config: Record<string, unknown>) => boolean
  }>
  execute: (input: unknown, config: Record<string, unknown>) => Promise<unknown> | unknown
}

const manualJsonImportDefinition: InspectionNodeDefinition = {
  name: 'manual-json-import',
  displayName: '手动输入数据',
  category: 'trigger',
  properties: [
    {
      name: 'jsonData',
      displayName: 'JSON 数据内容',
      required: true,
      type: 'json',
    },
  ],
  execute: (_input, config) => {
    const rawData = config.jsonData
    if (typeof rawData !== 'string' || !rawData.trim()) {
      throw new Error('请输入 JSON 数据内容')
    }

    const parsedData = JSON.parse(rawData)
    const rows = Array.isArray(parsedData) ? parsedData : [parsedData]
    if (!rows.every((row) => isPlainObject(row))) {
      throw new Error('JSON 数据必须是对象数组')
    }

    return createTableResultLike(rows)
  },
}

const fieldSelectionDefinition: InspectionNodeDefinition = {
  name: 'field-selection',
  displayName: '字段选择',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('输入数据格式不正确')

    const selectedFields = Array.isArray(config.fields)
      ? config.fields.filter((field): field is string => typeof field === 'string')
      : []
    const mode = config.mode === 'exclude' ? 'exclude' : 'include'

    const outputRows = rows.map((row) => {
      const nextRow: Record<string, unknown> = {}
      Object.keys(row).forEach((field) => {
        const selected = selectedFields.includes(field)
        if ((mode === 'include' && selected) || (mode === 'exclude' && !selected)) {
          nextRow[field] = row[field]
        }
      })
      return nextRow
    })

    return createTableResultLike(outputRows)
  },
}

const dataFilterDefinition: InspectionNodeDefinition = {
  name: 'data-filter',
  displayName: '数据筛选',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('输入数据格式不正确')

    const conditions = Array.isArray(config.conditions)
      ? config.conditions.filter((item): item is Record<string, unknown> => isPlainObject(item))
      : []
    const matchMode = config.matchMode === 'any' ? 'any' : 'all'

    const toNumber = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }

    const filteredRows = rows.filter((row) => {
      const results = conditions.map((condition) => {
        const field = typeof condition.field === 'string' ? condition.field : ''
        const operator = typeof condition.operator === 'string' ? condition.operator : 'equals'
        const expectedValue = condition.value
        const rowValue = row[field]

        if (!field) return true
        if (operator === 'contains') return String(rowValue ?? '').includes(String(expectedValue ?? ''))
        if (operator === 'equals') return rowValue === expectedValue
        if (operator === 'not_equals') return rowValue !== expectedValue
        if (operator === 'is_empty') return rowValue === null || rowValue === undefined || rowValue === ''
        if (operator === 'not_empty') return !(rowValue === null || rowValue === undefined || rowValue === '')

        const left = toNumber(rowValue)
        const right = toNumber(expectedValue)
        if (left === null || right === null) return false
        if (operator === 'gt') return left > right
        if (operator === 'gte') return left >= right
        if (operator === 'lt') return left < right
        if (operator === 'lte') return left <= right

        return false
      })

      return matchMode === 'any' ? results.some(Boolean) : results.every(Boolean)
    })

    return createTableResultLike(filteredRows)
  },
}

const sortDefinition: InspectionNodeDefinition = {
  name: 'sort',
  displayName: '排序',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('输入数据格式不正确')

    const sortRules = Array.isArray(config.sortRules)
      ? config.sortRules.filter((rule): rule is Record<string, unknown> => isPlainObject(rule))
      : []

    const toNumber = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }

    const outputRows = [...rows].sort((left, right) => {
      for (const rule of sortRules) {
        const field = typeof rule.field === 'string' ? rule.field : ''
        if (!field) continue
        const direction = rule.direction === 'desc' ? 'desc' : 'asc'
        const leftValue = left[field]
        const rightValue = right[field]
        const leftNumber = toNumber(leftValue)
        const rightNumber = toNumber(rightValue)
        let result = 0

        if (leftNumber !== null && rightNumber !== null) {
          result = leftNumber - rightNumber
        } else {
          result = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'zh-CN')
        }

        if (result !== 0) {
          return direction === 'desc' ? -result : result
        }
      }

      return 0
    })

    return createTableResultLike(outputRows)
  },
}

const dataLimitDefinition: InspectionNodeDefinition = {
  name: 'data-limit',
  displayName: '数据量限制',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('输入数据格式不正确')

    const limit = Math.max(0, Math.floor(Number(config.limit ?? 100)))
    const mode = config.mode === 'tail' ? 'tail' : 'head'

    return createTableResultLike(mode === 'tail' ? rows.slice(-limit) : rows.slice(0, limit))
  },
}

const jsTransformDefinition: InspectionNodeDefinition = {
  name: 'js-transform',
  displayName: 'JS代码执行',
  category: 'action',
  properties: [],
  execute: (input, config) => {
    const rows = extractRowsFromInput(input)
    if (!rows) throw new Error('JS代码执行节点只支持表格数据输入')

    const code = typeof config.code === 'string' ? config.code : ''
    if (!code.trim()) {
      throw new Error('请输入 JS 转换代码')
    }

    const runner = new Function('rows', code) as (rows: Array<Record<string, unknown>>) => unknown
    const result = runner(rows)
    if (!Array.isArray(result) || !result.every((row) => isPlainObject(row))) {
      throw new Error('JS代码执行节点必须返回数组对象列表')
    }

    return createTableResultLike(result)
  },
}

export const INSPECTABLE_NODE_DEFINITIONS = new Map<string, InspectionNodeDefinition>([
  [manualJsonImportDefinition.name, manualJsonImportDefinition],
  [fieldSelectionDefinition.name, fieldSelectionDefinition],
  [dataFilterDefinition.name, dataFilterDefinition],
  [sortDefinition.name, sortDefinition],
  [dataLimitDefinition.name, dataLimitDefinition],
  [jsTransformDefinition.name, jsTransformDefinition],
])
