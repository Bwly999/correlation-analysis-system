import type { CustomFactorField, CustomFactorRecord } from './types'

const normalizeIdentitySegment = (value: string) => value.trim().replace(/\s+/g, ' ')

const getIdentitySourceValue = (
  source: Pick<CustomFactorRecord, CustomFactorField> | Record<CustomFactorField, string>,
  field: CustomFactorField,
) => normalizeIdentitySegment(String(source[field] || ''))

export const createIdentityKey = (
  source: Pick<CustomFactorRecord, CustomFactorField> | Record<CustomFactorField, string>,
) => [
  getIdentitySourceValue(source, 'processName'),
  getIdentitySourceValue(source, 'factorKey'),
  getIdentitySourceValue(source, 'factorName'),
  getIdentitySourceValue(source, 'materialType'),
  getIdentitySourceValue(source, 'r2Name'),
].join('__')
