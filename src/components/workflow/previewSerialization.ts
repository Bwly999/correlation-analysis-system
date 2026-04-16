import {
  isPlainObject,
  type NodeResult,
} from '@/nodes/result'
import {
  getResultKindLabel,
  getResultGroups,
  getResultRows,
  getResultSchemaFields,
  getResultPreviewSummary,
  getResultReport,
  normalizeWorkflowResult,
} from './resultView'

export interface PreviewSerializeOptions {
  maxDepth: number
  maxArrayItems: number
  maxObjectKeys: number
  maxStringLength: number
  maxVisitedNodes: number
  maxEstimatedChars: number
}

export const DEFAULT_PREVIEW_SERIALIZE_OPTIONS: PreviewSerializeOptions = {
  maxDepth: 4,
  maxArrayItems: 20,
  maxObjectKeys: 20,
  maxStringLength: 240,
  maxVisitedNodes: 400,
  maxEstimatedChars: 8000,
}

export interface StructuredPreviewOptions {
  maxRows: number
  maxColumns: number
  maxStringLength: number
  maxGroups: number
  maxGroupRows: number
  maxObjectEntries: number
  maxTextLength: number
}

export interface StructuredPreviewSummary {
  label: string
  description: string
  rowCount?: number
  columnCount?: number
  groupCount?: number
  omittedRowCount?: number
  omittedColumnCount?: number
  omittedGroupCount?: number
  truncated: boolean
}

export interface StructuredPreviewTableGroup {
  name: string
  rowCount: number
  rows: Array<Record<string, string>>
}

export interface StructuredPreviewEntry {
  key: string
  value: string
}

export interface StructuredPreview {
  kind: 'table' | 'tableCollection' | 'report' | 'chart' | 'file' | 'json' | 'empty'
  summary: StructuredPreviewSummary
  columns: string[]
  rows: Array<Record<string, string>>
  groups: StructuredPreviewTableGroup[]
  entries: StructuredPreviewEntry[]
  notes: string[]
  textSource: unknown
}

export const DEFAULT_STRUCTURED_PREVIEW_OPTIONS: StructuredPreviewOptions = {
  maxRows: 5,
  maxColumns: 12,
  maxStringLength: 120,
  maxGroups: 4,
  maxGroupRows: 2,
  maxObjectEntries: 8,
  maxTextLength: 2400,
}

type PreviewSerializeState = {
  truncated: boolean
  visitedNodes: number
  estimatedChars: number
  seen: WeakSet<object>
}

const createPreviewState = (): PreviewSerializeState => ({
  truncated: false,
  visitedNodes: 0,
  estimatedChars: 0,
  seen: new WeakSet<object>(),
})

const truncateText = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value

const stringifyPlainValue = (value: unknown, maxLength: number): string => {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return truncateText(value, maxLength)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[数组(${value.length})]`
  }
  if (isPlainObject(value)) {
    return `{对象(${Object.keys(value).length}个键)}`
  }
  return truncateText(String(value), maxLength)
}

const clampSerializedText = (text: string, maxLength: number) =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n\n// ... 已截断`

const resolvePreviewRows = (value: unknown) => {
  const directRows = getResultRows(value)
  if (directRows.length > 0) return directRows

  const normalized = normalizeWorkflowResult(value)
  if (normalized?.kind === 'json' && Array.isArray(normalized.payload)) {
    return normalized.payload.filter((row): row is Record<string, unknown> => isPlainObject(row))
  }

  return []
}

const resolvePreviewGroups = (value: unknown) => {
  const directGroups = getResultGroups(value)
  if (directGroups.length > 0) return directGroups

  const normalized = normalizeWorkflowResult(value)
  if (normalized?.kind === 'json' && Array.isArray(normalized.payload)) {
    return normalized.payload
      .filter(
        (group): group is { name: string; data: Array<Record<string, unknown>> } =>
          isPlainObject(group) && typeof group.name === 'string' && Array.isArray(group.data),
      )
      .map((group) => ({
        name: group.name,
        data: group.data.filter((row): row is Record<string, unknown> => isPlainObject(row)),
      }))
  }

  return []
}

const createEmptyStructuredPreview = (value: unknown): StructuredPreview => ({
  kind: 'empty',
  summary: {
    label: getResultKindLabel(value),
    description: getResultPreviewSummary(value) || '暂无数据可用。',
    truncated: false,
  },
  columns: [],
  rows: [],
  groups: [],
  entries: [],
  notes: ['暂无数据可用。'],
  textSource: {},
})

const createStructuredTablePreview = (
  value: unknown,
  options: StructuredPreviewOptions,
): StructuredPreview | null => {
  const rows = resolvePreviewRows(value)
  if (rows.length === 0) return null

  const fields = getResultSchemaFields(value).map((field) => field.name)
  const resolvedFields =
    fields.length > 0 ? fields : Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const columns = resolvedFields.slice(0, options.maxColumns)
  const sampleRows = rows.slice(0, options.maxRows).map((row) =>
    Object.fromEntries(
      columns.map((column) => [column, stringifyPlainValue(row[column], options.maxStringLength)]),
    ),
  )
  const omittedRowCount = Math.max(0, rows.length - sampleRows.length)
  const omittedColumnCount = Math.max(0, resolvedFields.length - columns.length)
  const notes: string[] = []

  if (omittedRowCount > 0) notes.push(`已省略 ${omittedRowCount} 行样本`)
  if (omittedColumnCount > 0) notes.push(`已省略 ${omittedColumnCount} 列`)

  return {
    kind: 'table',
    summary: {
      label: '表格数据',
      description: getResultPreviewSummary(value) || `共 ${rows.length} 行，${resolvedFields.length} 列`,
      rowCount: rows.length,
      columnCount: resolvedFields.length,
      omittedRowCount,
      omittedColumnCount,
      truncated: omittedRowCount > 0 || omittedColumnCount > 0,
    },
    columns,
    rows: sampleRows,
    groups: [],
    entries: [],
    notes,
    textSource: {
      kind: 'table',
      summary: {
        rowCount: rows.length,
        columnCount: resolvedFields.length,
        omittedRowCount,
        omittedColumnCount,
      },
      columns,
      sampleRows,
    },
  }
}

const createStructuredCollectionPreview = (
  value: unknown,
  options: StructuredPreviewOptions,
): StructuredPreview | null => {
  const groups = resolvePreviewGroups(value)
  if (groups.length === 0) return null

  const sampleGroups = groups.slice(0, options.maxGroups).map((group) => {
    const tablePreview = createStructuredTablePreview(group.data, {
      ...options,
      maxRows: options.maxGroupRows,
    })

    return {
      name: group.name,
      rowCount: group.data.length,
      rows: tablePreview?.rows ?? [],
    }
  })
  const omittedGroupCount = Math.max(0, groups.length - sampleGroups.length)
  const totalRows = groups.reduce((sum, group) => sum + group.data.length, 0)
  const notes: string[] = []

  if (omittedGroupCount > 0) notes.push(`已省略 ${omittedGroupCount} 个分组`)
  if (groups.some((group) => group.data.length > options.maxGroupRows)) {
    notes.push('分组内仅展示有限样本行')
  }

  return {
    kind: 'tableCollection',
    summary: {
      label: '分组数据集',
      description: getResultPreviewSummary(value) || `共 ${groups.length} 组，${totalRows} 行样本`,
      groupCount: groups.length,
      rowCount: totalRows,
      omittedGroupCount,
      truncated: omittedGroupCount > 0 || notes.length > 0,
    },
    columns: [],
    rows: [],
    groups: sampleGroups,
    entries: [],
    notes,
    textSource: {
      kind: 'tableCollection',
      summary: {
        groupCount: groups.length,
        rowCount: totalRows,
        omittedGroupCount,
      },
      sampleGroups,
    },
  }
}

const createStructuredReportLikePreview = (
  value: unknown,
  kind: StructuredPreview['kind'],
  entries: StructuredPreviewEntry[],
  notes: string[] = [],
): StructuredPreview => ({
  kind,
  summary: {
    label: getResultKindLabel(value),
    description: getResultPreviewSummary(value) || `${getResultKindLabel(value)}摘要`,
    truncated: true,
  },
  columns: [],
  rows: [],
  groups: [],
  entries,
  notes,
  textSource: {
    kind,
    summary: getResultPreviewSummary(value),
    entries,
    notes,
  },
})

const createStructuredJsonPreview = (
  value: unknown,
  options: StructuredPreviewOptions,
): StructuredPreview => {
  const safePreview = createSafeJsonPreview(value, {
    ...DEFAULT_PREVIEW_SERIALIZE_OPTIONS,
    maxObjectKeys: Math.max(options.maxObjectEntries, DEFAULT_PREVIEW_SERIALIZE_OPTIONS.maxObjectKeys),
    maxStringLength: options.maxStringLength,
    maxEstimatedChars: Math.max(options.maxTextLength, DEFAULT_PREVIEW_SERIALIZE_OPTIONS.maxEstimatedChars),
  })
  const source: Record<string, unknown> = isPlainObject(safePreview) ? safePreview : { value: safePreview }
  const keys = Object.keys(source)
  const visibleKeys = keys.slice(0, options.maxObjectEntries)
  const entries = visibleKeys.map((key) => ({
    key,
    value: stringifyPlainValue(source[key], options.maxStringLength),
  }))
  const omittedCount = Math.max(0, keys.length - visibleKeys.length)
  const notes = omittedCount > 0 ? [`已省略 ${omittedCount} 个顶层字段`] : []
  const normalized = normalizeWorkflowResult(value)
  const label =
    normalized?.kind === 'json' || isPlainObject(value) || Array.isArray(value) ? 'JSON 数据' : getResultKindLabel(value)
  const metaPreviewTruncated =
    isPlainObject(source.meta) && source.meta.previewTruncated === true
  const previewTruncated =
    omittedCount > 0 || source.__previewTruncated === true || metaPreviewTruncated

  if (previewTruncated) {
    notes.push('已截断超出预算的预览内容')
  }

  return {
    kind: 'json',
    summary: {
      label,
      description: getResultPreviewSummary(value) || 'JSON 结构摘要',
      truncated: previewTruncated,
    },
    columns: [],
    rows: [],
    groups: [],
    entries,
    notes,
    textSource: source,
  }
}

const createBudgetExceededPlaceholder = (
  type: 'array' | 'object' | 'value',
  extra: Record<string, unknown> = {},
) => ({
  __truncated: true,
  __reason: 'budgetExceeded',
  __type: type,
  ...extra,
})

const consumeEstimatedChars = (
  amount: number,
  state: PreviewSerializeState,
  options: PreviewSerializeOptions,
) => {
  state.estimatedChars += amount
  if (state.estimatedChars <= options.maxEstimatedChars) return false

  state.truncated = true
  return true
}

const touchNode = (state: PreviewSerializeState, options: PreviewSerializeOptions) => {
  state.visitedNodes += 1
  if (state.visitedNodes <= options.maxVisitedNodes) return false

  state.truncated = true
  return true
}

const sanitizeString = (
  value: string,
  options: PreviewSerializeOptions,
  state: PreviewSerializeState,
) => {
  if (consumeEstimatedChars(Math.min(value.length, options.maxStringLength), state, options)) {
    return createBudgetExceededPlaceholder('value', { __originalLength: value.length })
  }

  if (value.length <= options.maxStringLength) return value

  state.truncated = true
  return {
    __truncatedString: `${value.slice(0, options.maxStringLength)}...`,
    __originalLength: value.length,
  }
}

const sanitizeArray = (
  value: unknown[],
  depth: number,
  options: PreviewSerializeOptions,
  state: PreviewSerializeState,
) => {
  if (consumeEstimatedChars(Math.min(value.length, options.maxArrayItems) * 4, state, options)) {
    return createBudgetExceededPlaceholder('array', { __originalLength: value.length })
  }

  const items: unknown[] = []
  const visibleCount = Math.min(value.length, options.maxArrayItems)

  for (let index = 0; index < visibleCount; index += 1) {
    items.push(sanitizePreviewValue(value[index], depth + 1, options, state))
  }

  if (value.length <= options.maxArrayItems) return items

  state.truncated = true
  return {
    __truncated: true,
    __type: 'array',
    __items: items,
    __omittedItems: value.length - options.maxArrayItems,
    __originalLength: value.length,
  }
}

const sanitizeObject = (
  value: Record<string, unknown>,
  depth: number,
  options: PreviewSerializeOptions,
  state: PreviewSerializeState,
) => {
  const nextValue: Record<string, unknown> = {}
  let keyCount = 0

  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue

    keyCount += 1

    // 根层普通大对象会先在这里快速降级，避免继续深挖造成卡顿。
    if (depth === 0 && keyCount > options.maxObjectKeys) {
      state.truncated = true
      return createBudgetExceededPlaceholder('object', {
        __processedKeys: options.maxObjectKeys,
        __minimumOriginalKeyCount: keyCount,
      })
    }

    if (keyCount > options.maxObjectKeys) break

    if (consumeEstimatedChars(key.length, state, options)) {
      return createBudgetExceededPlaceholder('object', {
        __processedKeys: keyCount - 1,
        __minimumOriginalKeyCount: keyCount,
      })
    }

    nextValue[key] = sanitizePreviewValue(value[key], depth + 1, options, state)
  }

  if (keyCount > options.maxObjectKeys) {
    state.truncated = true
    nextValue.__truncated = true
    nextValue.__omittedKeys = keyCount - options.maxObjectKeys
    nextValue.__originalKeyCount = keyCount
  }

  return nextValue
}

const sanitizePreviewValue = (
  value: unknown,
  depth: number,
  options: PreviewSerializeOptions,
  state: PreviewSerializeState,
): unknown => {
  if (touchNode(state, options)) {
    return createBudgetExceededPlaceholder('value')
  }

  if (value === null || value === undefined) return value
  if (typeof value === 'string') return sanitizeString(value, options, state)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function') {
    state.truncated = true
    return '[Function]'
  }

  if (depth >= options.maxDepth) {
    state.truncated = true
    if (Array.isArray(value)) {
      return {
        __truncated: true,
        __reason: 'maxDepth',
        __type: 'array',
        __originalLength: value.length,
      }
    }

    if (isPlainObject(value)) {
      return {
        __truncated: true,
        __reason: 'maxDepth',
        __type: 'object',
        __originalKeyCount: Object.keys(value).length,
      }
    }
  }

  if (typeof value === 'object') {
    if (state.seen.has(value)) {
      state.truncated = true
      return {
        __truncated: true,
        __reason: 'circular',
      }
    }

    state.seen.add(value)

    if (Array.isArray(value)) {
      return sanitizeArray(value, depth, options, state)
    }

    if (isPlainObject(value)) {
      return sanitizeObject(value, depth, options, state)
    }
  }

  return value
}

const createPreviewNodeResult = (
  result: NodeResult,
  payload: unknown,
  meta: unknown,
  lineage: unknown,
  previewProps: unknown,
  truncated: boolean,
): NodeResult => ({
  kind: result.kind,
  schema: result.schema,
  lineage: isPlainObject(lineage) ? lineage : undefined,
  preview: result.preview
    ? {
        ...result.preview,
        props: isPlainObject(previewProps) ? previewProps : undefined,
      }
    : undefined,
  meta: {
    ...(isPlainObject(meta) ? meta : {}),
    previewTruncated: truncated,
  },
  payload,
})

const createReportPreview = (
  result: NodeResult,
  options: PreviewSerializeOptions,
  state: PreviewSerializeState,
) => {
  const report = getResultReport(result)
  const sections = Array.isArray(report?.sections) ? report.sections : []
  const summary = {
    title: report?.title,
    summary: getResultPreviewSummary(result),
    sectionCount: sections.length,
    sections: sections.map((section: any) => ({
      type: section?.type,
      title: section?.title,
      itemCount: Array.isArray(section?.items)
        ? section.items.length
        : Array.isArray(section?.allItems)
          ? section.allItems.length
          : undefined,
      cardCount: Array.isArray(section?.cards) ? section.cards.length : undefined,
      hasChart: Boolean(section?.option),
      hasImage: Boolean(section?.url),
    })),
    metadata: sanitizePreviewValue(report?.metadata ?? {}, 0, options, state),
    supplements: sanitizePreviewValue(report?.supplements ?? {}, 0, options, state),
  }

  state.truncated = true
  const sanitizedMeta = sanitizePreviewValue(result.meta ?? {}, 0, options, state)
  const sanitizedLineage = sanitizePreviewValue(result.lineage ?? {}, 0, options, state)
  const sanitizedPreviewProps = sanitizePreviewValue(result.preview?.props ?? {}, 0, options, state)
  return createPreviewNodeResult(
    result,
    summary,
    sanitizedMeta,
    sanitizedLineage,
    sanitizedPreviewProps,
    true,
  )
}

export const createSafeJsonPreview = (
  value: unknown,
  options: PreviewSerializeOptions = DEFAULT_PREVIEW_SERIALIZE_OPTIONS,
) => {
  const normalizedResult = normalizeWorkflowResult(value)
  const state = createPreviewState()

  if (normalizedResult?.kind === 'report') {
    return createReportPreview(normalizedResult, options, state)
  }

  if (normalizedResult) {
    const payload = sanitizePreviewValue(normalizedResult.payload, 0, options, state)
    const meta = sanitizePreviewValue(normalizedResult.meta ?? {}, 0, options, state)
    const lineage = sanitizePreviewValue(normalizedResult.lineage ?? {}, 0, options, state)
    const previewProps = sanitizePreviewValue(normalizedResult.preview?.props ?? {}, 0, options, state)
    return createPreviewNodeResult(
      normalizedResult,
      payload,
      meta,
      lineage,
      previewProps,
      state.truncated,
    )
  }

  const sanitized = sanitizePreviewValue(value, 0, options, state)
  if (isPlainObject(sanitized)) {
    return {
      ...sanitized,
      __previewLabel: getResultKindLabel(value),
      __previewSummary: getResultPreviewSummary(value),
      __previewTruncated: state.truncated,
    }
  }

  return {
    value: sanitized,
    __previewLabel: getResultKindLabel(value),
    __previewSummary: getResultPreviewSummary(value),
    __previewTruncated: state.truncated,
  }
}

export const stringifySafePreview = (value: unknown) => JSON.stringify(value, null, 2)

export const createStructuredPreview = (
  value: unknown,
  options: StructuredPreviewOptions = DEFAULT_STRUCTURED_PREVIEW_OPTIONS,
): StructuredPreview => {
  const normalized = normalizeWorkflowResult(value)

  if (value === null || value === undefined) return createEmptyStructuredPreview(value)

  const tablePreview = createStructuredTablePreview(value, options)
  if (tablePreview) return tablePreview

  const collectionPreview = createStructuredCollectionPreview(value, options)
  if (collectionPreview) return collectionPreview

  if (normalized?.kind === 'report') {
    const report = getResultReport(normalized)
    const sections = Array.isArray(report?.sections) ? report.sections : []
    return createStructuredReportLikePreview(
      value,
      'report',
      [
        { key: '标题', value: stringifyPlainValue(report?.title, options.maxStringLength) },
        { key: '分节数', value: String(sections.length) },
      ],
      sections.slice(0, options.maxObjectEntries).map((section: any, index) =>
        `${index + 1}. ${stringifyPlainValue(section?.title ?? section?.type, options.maxStringLength)}`,
      ),
    )
  }

  if (normalized?.kind === 'chart') {
    return createStructuredReportLikePreview(value, 'chart', [
      { key: '摘要', value: getResultPreviewSummary(value) || '图表结果' },
      { key: '类型', value: normalized.kind },
    ])
  }

  if (normalized?.kind === 'file') {
    const payload = isPlainObject(normalized.payload) ? normalized.payload : {}
    return createStructuredReportLikePreview(value, 'file', [
      { key: '文件名', value: stringifyPlainValue(payload.filename, options.maxStringLength) },
      { key: '格式', value: stringifyPlainValue(payload.format, options.maxStringLength) },
    ])
  }

  return createStructuredJsonPreview(value, options)
}

export const stringifyStructuredPreview = (
  preview: StructuredPreview,
  maxLength = DEFAULT_STRUCTURED_PREVIEW_OPTIONS.maxTextLength,
) => {
  const serialized = clampSerializedText(JSON.stringify(preview.textSource, null, 2), maxLength)
  if (serialized.includes('已截断') || !preview.summary.truncated) {
    return serialized
  }

  return `${serialized}\n\n// ... 已截断`
}
