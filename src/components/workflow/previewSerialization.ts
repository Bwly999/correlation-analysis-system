import {
  isPlainObject,
  type NodeResult,
} from '@/nodes/result'
import {
  getResultKindLabel,
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
  truncated: boolean,
): NodeResult => ({
  kind: result.kind,
  schema: result.schema,
  lineage: result.lineage,
  preview: result.preview,
  meta: {
    ...(result.meta ?? {}),
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
  return createPreviewNodeResult(result, summary, true)
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
    return createPreviewNodeResult(normalizedResult, payload, state.truncated)
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
