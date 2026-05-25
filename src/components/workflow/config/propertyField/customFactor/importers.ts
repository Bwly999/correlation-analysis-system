import { createIdentityKey } from './identity'
import type {
  CustomFactorColumnMapping,
  CustomFactorDraft,
  CustomFactorDraftStats,
  CustomFactorField,
  CustomFactorRecord,
} from './types'

const CUSTOM_FACTOR_FIELDS: CustomFactorField[] = [
  'factorKey',
  'factorName',
  'materialType',
  'processName',
  'r2Name',
]

const splitDraftLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)

export const getDraftFieldLineStats = (draft: CustomFactorDraft): CustomFactorDraftStats =>
  Object.fromEntries(
    CUSTOM_FACTOR_FIELDS.map((field) => [
      field,
      {
        lineCount: splitDraftLines(draft[field].value).length,
        locked: draft[field].locked,
      },
    ]),
  ) as CustomFactorDraftStats

const resolveTargetRowCount = (draft: CustomFactorDraft) => {
  const unlockedMultiLineCounts = CUSTOM_FACTOR_FIELDS
    .filter((field) => !draft[field].locked)
    .map((field) => splitDraftLines(draft[field].value).length)
    .filter((count) => count > 0)

  if (unlockedMultiLineCounts.length === 0) {
    const lockedCounts = CUSTOM_FACTOR_FIELDS
      .map((field) => splitDraftLines(draft[field].value).length)
      .filter((count) => count > 0)
    return lockedCounts[0] || 0
  }

  const expectedCount = unlockedMultiLineCounts[0] || 0
  if (unlockedMultiLineCounts.some((count) => count !== expectedCount)) {
    throw new Error('多行字段的行数不一致，请检查后再导入')
  }
  return expectedCount
}

const buildFactorRecord = (values: Record<CustomFactorField, string>): CustomFactorRecord => ({
  uid: crypto.randomUUID(),
  identityKey: createIdentityKey(values),
  factorKey: values.factorKey,
  factorName: values.factorName,
  materialType: values.materialType,
  processName: values.processName,
  r2Name: values.r2Name,
})

export const buildCustomFactorsFromDraft = (draft: CustomFactorDraft): CustomFactorRecord[] => {
  const targetRowCount = resolveTargetRowCount(draft)
  if (targetRowCount <= 0) return []

  return Array.from<unknown, CustomFactorRecord>({ length: targetRowCount }, (_, index) => {
    const row = CUSTOM_FACTOR_FIELDS.reduce<Record<CustomFactorField, string>>((acc, field) => {
      const lines = splitDraftLines(draft[field].value)
      acc[field] = draft[field].locked
        ? (lines[0] || '')
        : (lines[index] || '')
      return acc
    }, {} as Record<CustomFactorField, string>)

    return buildFactorRecord(row)
  }).filter((factor) =>
    CUSTOM_FACTOR_FIELDS.some((field) => Boolean(String(factor[field] || '').trim())),
  )
}

export const buildCustomFactorsFromColumnMapping = (
  rows: Array<Record<string, string>>,
  mapping: CustomFactorColumnMapping,
) =>
  rows.map((row) =>
    buildFactorRecord({
      factorKey: String(row[mapping.factorKey] || '').trim(),
      factorName: String(row[mapping.factorName] || '').trim(),
      materialType: String(row[mapping.materialType] || '').trim(),
      processName: String(row[mapping.processName] || '').trim(),
      r2Name: String(row[mapping.r2Name] || '').trim(),
    }),
  ).filter((factor) =>
    CUSTOM_FACTOR_FIELDS.some((field) => Boolean(String(factor[field] || '').trim())),
  )
