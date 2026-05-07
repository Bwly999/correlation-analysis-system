import { inferSchemaFromRows, type FieldSchema } from '@/nodes/result'
import { getCommonRenderableNumericFieldsFromGroups } from './dataChartSeriesFiltering'

type GroupedRows = Array<{
  name: string
  data: Array<Record<string, unknown>>
}>

const resolveMergedFieldType = (types: Set<FieldSchema['type']>): FieldSchema['type'] => {
  if (types.size === 0) return 'unknown'
  if (types.size === 1) return [...types][0] ?? 'unknown'

  if ([...types].every((type) => type === 'number' || type === 'unknown')) {
    return 'number'
  }

  return 'unknown'
}

export const inferCommonSchemaFromGroups = (groups: GroupedRows): FieldSchema[] => {
  const nonEmptyGroups = groups.filter((group) => Array.isArray(group.data) && group.data.length > 0)
  if (nonEmptyGroups.length === 0) return []

  const groupSchemas = nonEmptyGroups.map((group) => inferSchemaFromRows(group.data).fields ?? [])
  const commonFieldNames = groupSchemas.reduce<string[]>((sharedFields, fields, index) => {
    const names = fields.map((field) => field.name)
    if (index === 0) return names
    return sharedFields.filter((fieldName) => names.includes(fieldName))
  }, [])

  return commonFieldNames.map((fieldName) => {
    const matchingFields = groupSchemas
      .map((fields) => fields.find((field) => field.name === fieldName))
      .filter((field): field is FieldSchema => Boolean(field))

    return {
      name: fieldName,
      type: resolveMergedFieldType(new Set(matchingFields.map((field) => field.type))),
      nullable: matchingFields.some((field) => field.nullable),
    }
  })
}

export const getCommonNumericFieldsFromGroups = (groups: GroupedRows) =>
  getCommonRenderableNumericFieldsFromGroups(groups)
