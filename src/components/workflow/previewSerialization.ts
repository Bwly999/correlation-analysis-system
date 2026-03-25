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
}

export const DEFAULT_PREVIEW_SERIALIZE_OPTIONS: PreviewSerializeOptions = {
  maxDepth: 4,
  maxArrayItems: 20,
  maxObjectKeys: 20,
  maxStringLength: 240,
}

type PreviewSerializeState = {
  truncated: boolean
  seen: WeakSet<object>
}

const createPreviewState = (): PreviewSerializeState => ({
  truncated: false,
  seen: new WeakSet<object>(),
})

const sanitizeString = (
  value: string,
  options: PreviewSerializeOptions,
  state: PreviewSerializeState,
) => {
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
  const items = value
    .slice(0, options.maxArrayItems)
    .map((item) => sanitizePreviewValue(item, depth + 1, options, state))

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
  const entries = Object.entries(value)
  const limitedEntries = entries.slice(0, options.maxObjectKeys)
  const nextValue: Record<string, unknown> = {}

  limitedEntries.forEach(([key, nestedValue]) => {
    nextValue[key] = sanitizePreviewValue(nestedValue, depth + 1, options, state)
  })

  if (entries.length > options.maxObjectKeys) {
    state.truncated = true
    nextValue.__truncated = true
    nextValue.__omittedKeys = entries.length - options.maxObjectKeys
    nextValue.__originalKeyCount = entries.length
  }

  return nextValue
}

const sanitizePreviewValue = (
  value: unknown,
  depth: number,
  options: PreviewSerializeOptions,
  state: PreviewSerializeState,
): unknown => {
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
