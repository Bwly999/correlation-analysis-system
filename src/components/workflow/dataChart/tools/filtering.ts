import type { FieldSchema } from '@/nodes/result'
import type { ChartGroup, ChartRow } from '../types'
import { isFiniteNumber } from './normalization'

const collectFieldOrderFromRows = (rows: ChartRow[]) => {
  const orderedFields: string[] = []
  const seen = new Set<string>()

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (seen.has(key)) return
      seen.add(key)
      orderedFields.push(key)
    })
  })

  return orderedFields
}

const hasRenderableNumber = (rows: ChartRow[], key: string) =>
  rows.some((row) => isFiniteNumber(row[key]))

export const getRenderableNumericFieldsFromRows = (
  rows: ChartRow[],
  schemaFields: FieldSchema[] = [],
) => {
  const orderedFields = collectFieldOrderFromRows(rows)
  const renderableFields = new Set(orderedFields.filter((key) => hasRenderableNumber(rows, key)))
  const selected: string[] = []
  const seen = new Set<string>()

  schemaFields.forEach((field) => {
    if (seen.has(field.name)) return
    if (field.type === 'number' || renderableFields.has(field.name)) {
      seen.add(field.name)
      selected.push(field.name)
    }
  })

  orderedFields.forEach((fieldName) => {
    if (seen.has(fieldName) || !renderableFields.has(fieldName)) return
    seen.add(fieldName)
    selected.push(fieldName)
  })

  return selected
}

export const getCommonRenderableNumericFieldsFromGroups = (groups: ChartGroup[]) => {
  const nonEmptyGroups = groups.filter((group) => Array.isArray(group.data) && group.data.length > 0)
  if (nonEmptyGroups.length === 0) return []

  const commonFieldNames = nonEmptyGroups.reduce<string[]>((shared, group, index) => {
    const groupFieldNames = collectFieldOrderFromRows(group.data)
    if (index === 0) return groupFieldNames
    return shared.filter((fieldName) => groupFieldNames.includes(fieldName))
  }, [])

  return commonFieldNames.filter((fieldName) =>
    nonEmptyGroups.every((group) => hasRenderableNumber(group.data, fieldName)),
  )
}

export const filterRowsByRenderableKeys = (rows: ChartRow[], keys: string[]) => {
  if (keys.length === 0) return rows
  return rows.filter((row) => keys.every((key) => isFiniteNumber(row[key])))
}

export const rowMatchesBounds = (
  row: ChartRow,
  keys: string[],
  lowerBound: number | null,
  upperBound: number | null,
) => {
  if (keys.length === 0) return true

  return keys.every((key) => {
    const value = row[key]
    if (!isFiniteNumber(value)) return false
    if (lowerBound !== null && value < lowerBound) return false
    if (upperBound !== null && value > upperBound) return false
    return true
  })
}

export const applyValueBoundsToRows = (
  rows: ChartRow[],
  keys: string[],
  lowerBound: number | null,
  upperBound: number | null,
) => {
  if (lowerBound === null && upperBound === null) return rows
  return rows.filter((row) => rowMatchesBounds(row, keys, lowerBound, upperBound))
}

export const applyValueBoundsToGroups = (
  groups: ChartGroup[],
  keys: string[],
  lowerBound: number | null,
  upperBound: number | null,
) => {
  if (lowerBound === null && upperBound === null) return groups

  return groups.map((group) => ({
    ...group,
    data: applyValueBoundsToRows(group.data ?? [], keys, lowerBound, upperBound),
  }))
}
