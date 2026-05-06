import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { extractTableCollectionGroups, extractTableRows, isPlainObject } from '@/nodes/result'
import { normalizeWorkflowResult } from '../resultView'

type DataQualityFieldType = 'number' | 'string' | 'boolean' | 'date' | 'json' | 'unknown'

export interface DataQualityFieldProfile {
  field: string
  type: DataQualityFieldType
  totalCount: number
  missingCount: number
  nonMissingCount: number
  missingRate: number
  min?: number
  max?: number
  mean?: number
}

export interface DataQualitySummary {
  rowCount: number
  fieldCount: number
  missingFieldCount: number
  highestMissingRate: number
  numericFieldCount: number
}

export interface MissingRateBucket {
  label: string
  min: number
  max: number
  count: number
}

type SourceProfile = {
  field?: unknown
  type?: unknown
  missingCount?: unknown
  nonNullCount?: unknown
  nonMissingCount?: unknown
  missingRate?: unknown
  min?: unknown
  max?: unknown
  mean?: unknown
}

type SourceMetrics = {
  rowCount?: unknown
  fieldCount?: unknown
  numericFieldCount?: unknown
}

type FieldAccumulator = {
  field: string
  presentCount: number
  numericCount: number
  booleanCount: number
  dateCount: number
  stringCount: number
  jsonCount: number
  numericPresentCount: number
  numericSum: number
  numericMin?: number
  numericMax?: number
}

const isMissingValue = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'number' && Number.isNaN(value))

const toFiniteNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const isDateLike = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value))

const normalizeProfileType = (type: unknown): DataQualityFieldType => {
  if (type === 'numeric' || type === 'number') return 'number'
  if (type === 'categorical' || type === 'string') return 'string'
  if (type === 'datetime' || type === 'date') return 'date'
  if (type === 'boolean') return 'boolean'
  if (type === 'json') return 'json'
  return 'unknown'
}

const toOptionalNumber = (value: unknown) => {
  const parsed = toFiniteNumber(value)
  return parsed === null ? undefined : parsed
}

const getRowsFromInput = (input: unknown) => {
  const rows = extractTableRows(input)
  if (rows) return rows

  const groups = extractTableCollectionGroups(input)
  if (groups) return groups.flatMap((group) => group.data)

  const normalized = normalizeWorkflowResult(input)
  const sourceData = normalized?.meta?.sourceData
  if (Array.isArray(sourceData)) {
    return sourceData.filter((row): row is Record<string, unknown> => isPlainObject(row))
  }

  return []
}

const getSourceProfiles = (input: unknown): SourceProfile[] => {
  const normalized = normalizeWorkflowResult(input)
  const profile = normalized?.meta?.profile
  return Array.isArray(profile) ? profile.filter(isPlainObject) : []
}

const getSourceMetrics = (input: unknown): SourceMetrics | null => {
  const normalized = normalizeWorkflowResult(input)
  return isPlainObject(normalized?.meta?.metrics) ? normalized.meta.metrics : null
}

const buildProfileFromSource = (
  profile: SourceProfile,
  totalCount: number,
): DataQualityFieldProfile | null => {
  if (typeof profile.field !== 'string' || profile.field.trim() === '') return null
  const missingCount = Math.max(0, Math.round(toOptionalNumber(profile.missingCount) ?? 0))
  const nonMissingCount = Math.max(
    0,
    Math.round(
      toOptionalNumber(profile.nonMissingCount) ?? toOptionalNumber(profile.nonNullCount) ?? 0,
    ),
  )
  const inferredTotal = Math.max(totalCount, missingCount + nonMissingCount)
  const missingRate =
    toOptionalNumber(profile.missingRate) ??
    (inferredTotal === 0 ? 0 : missingCount / inferredTotal)

  return {
    field: profile.field,
    type: normalizeProfileType(profile.type),
    totalCount: inferredTotal,
    missingCount,
    nonMissingCount,
    missingRate,
    min: toOptionalNumber(profile.min),
    max: toOptionalNumber(profile.max),
    mean: toOptionalNumber(profile.mean),
  }
}

const buildProfilesFromRows = (rows: Array<Record<string, unknown>>) => {
  const fieldMap = new Map<string, FieldAccumulator>()

  rows.forEach((row) => {
    Object.keys(row).forEach((field) => {
      const current =
        fieldMap.get(field) ??
        ({
          field,
          presentCount: 0,
          numericCount: 0,
          booleanCount: 0,
          dateCount: 0,
          stringCount: 0,
          jsonCount: 0,
          numericPresentCount: 0,
          numericSum: 0,
        } satisfies FieldAccumulator)

      fieldMap.set(field, current)

      const value = row[field]
      if (isMissingValue(value)) return

      current.presentCount += 1

      const numericValue = toFiniteNumber(value)
      if (numericValue !== null) {
        current.numericCount += 1
        current.numericPresentCount += 1
        current.numericSum += numericValue
        current.numericMin = current.numericMin === undefined
          ? numericValue
          : Math.min(current.numericMin, numericValue)
        current.numericMax = current.numericMax === undefined
          ? numericValue
          : Math.max(current.numericMax, numericValue)
      }

      if (typeof value === 'boolean') current.booleanCount += 1
      if (isDateLike(value)) current.dateCount += 1
      if (typeof value === 'string') current.stringCount += 1
      if (isPlainObject(value) || Array.isArray(value)) current.jsonCount += 1
    })
  })

  const totalRowCount = rows.length

  return [...fieldMap.values()]
    .sort((left, right) => left.field.localeCompare(right.field))
    .map((field) => {
      const missingCount = totalRowCount - field.presentCount
      const values = [
        field.numericCount === field.presentCount && field.presentCount > 0 ? 'number' : null,
        field.booleanCount === field.presentCount && field.presentCount > 0 ? 'boolean' : null,
        field.dateCount === field.presentCount && field.presentCount > 0 ? 'date' : null,
        field.stringCount === field.presentCount && field.presentCount > 0 ? 'string' : null,
        field.jsonCount === field.presentCount && field.presentCount > 0 ? 'json' : null,
      ]
      const type = (values.find(Boolean) as DataQualityFieldType | undefined) ?? 'unknown'

      return {
        field: field.field,
        type,
        totalCount: totalRowCount,
        missingCount,
        nonMissingCount: field.presentCount,
        missingRate: totalRowCount === 0 ? 0 : missingCount / totalRowCount,
        min: type === 'number' ? field.numericMin : undefined,
        max: type === 'number' ? field.numericMax : undefined,
        mean:
          type === 'number' && field.numericPresentCount > 0
            ? field.numericSum / field.numericPresentCount
            : undefined,
      } satisfies DataQualityFieldProfile
    })
}

const buildBuckets = (profiles: DataQualityFieldProfile[]): MissingRateBucket[] => {
  const buckets: MissingRateBucket[] = [
    { label: '0%', min: 0, max: 0, count: 0 },
    { label: '0-10%', min: 0, max: 0.1, count: 0 },
    { label: '10-30%', min: 0.1, max: 0.3, count: 0 },
    { label: '30-60%', min: 0.3, max: 0.6, count: 0 },
    { label: '60%+', min: 0.6, max: 1, count: 0 },
  ]

  profiles.forEach((profile) => {
    if (profile.missingRate === 0) {
      buckets[0]!.count += 1
    } else if (profile.missingRate <= 0.1) {
      buckets[1]!.count += 1
    } else if (profile.missingRate <= 0.3) {
      buckets[2]!.count += 1
    } else if (profile.missingRate <= 0.6) {
      buckets[3]!.count += 1
    } else {
      buckets[4]!.count += 1
    }
  })

  return buckets
}

const sortByMissingRate = (profiles: DataQualityFieldProfile[]) =>
  [...profiles].sort(
    (left, right) =>
      right.missingRate - left.missingRate || left.field.localeCompare(right.field),
  )

export function useDataQualityProfile(data: MaybeRefOrGetter<unknown>) {
  const resolvedInput = computed(() => toValue(data))
  const rows = computed(() => getRowsFromInput(resolvedInput.value))
  const sourceProfiles = computed(() => getSourceProfiles(resolvedInput.value))
  const sourceMetrics = computed(() => getSourceMetrics(resolvedInput.value))
  const profileRowCount = computed(() => {
    const metricRowCount = toOptionalNumber(sourceMetrics.value?.rowCount)
    if (metricRowCount !== undefined) return Math.max(0, Math.round(metricRowCount))

    if (rows.value.length > 0) return rows.value.length

    return sourceProfiles.value.reduce((max, profile) => {
      const missingCount = Math.round(toOptionalNumber(profile.missingCount) ?? 0)
      const nonMissingCount = Math.round(
        toOptionalNumber(profile.nonMissingCount) ?? toOptionalNumber(profile.nonNullCount) ?? 0,
      )
      const totalCount = Math.max(
        0,
        missingCount + nonMissingCount,
      )
      return Math.max(max, totalCount)
    }, 0)
  })
  const fieldProfiles = computed(() => {
    if (sourceProfiles.value.length > 0) {
      const totalCount = profileRowCount.value
      return sourceProfiles.value
        .map((profile) => buildProfileFromSource(profile, totalCount))
        .filter((profile): profile is DataQualityFieldProfile => Boolean(profile))
        .sort((left, right) => left.field.localeCompare(right.field))
    }

    return buildProfilesFromRows(rows.value)
  })

  const summary = computed<DataQualitySummary>(() => {
    const profiles = fieldProfiles.value
    const metricFieldCount = toOptionalNumber(sourceMetrics.value?.fieldCount)
    const metricNumericFieldCount = toOptionalNumber(sourceMetrics.value?.numericFieldCount)

    return {
      rowCount: profileRowCount.value,
      fieldCount:
        metricFieldCount !== undefined && sourceProfiles.value.length > 0
          ? Math.max(profiles.length, Math.round(metricFieldCount))
          : profiles.length,
      missingFieldCount: profiles.filter((profile) => profile.missingCount > 0).length,
      highestMissingRate: profiles.reduce(
        (highest, profile) => Math.max(highest, profile.missingRate),
        0,
      ),
      numericFieldCount:
        metricNumericFieldCount !== undefined && sourceProfiles.value.length > 0
          ? Math.max(0, Math.round(metricNumericFieldCount))
          : profiles.filter((profile) => profile.type === 'number').length,
    }
  })

  const missingBuckets = computed(() => buildBuckets(fieldProfiles.value))
  const hasProfileData = computed(() => profileRowCount.value > 0 && fieldProfiles.value.length > 0)
  const fieldsAtOrAboveMissingRate = computed(
    () => (thresholdPercent: number) => {
      const thresholdRate = Math.max(0, Math.min(100, thresholdPercent)) / 100
      return sortByMissingRate(
        fieldProfiles.value.filter((profile) => profile.missingRate >= thresholdRate),
      )
    },
  )

  return {
    rows,
    fieldProfiles,
    summary,
    missingBuckets,
    hasProfileData,
    fieldsAtOrAboveMissingRate,
  }
}
