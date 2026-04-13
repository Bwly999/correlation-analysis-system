import { getNodeDefinition } from '@/nodes/registry'

const cloneConfigValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneConfigValue(item)) as T
  }

  if (
    (typeof File !== 'undefined' && value instanceof File)
    || (typeof Blob !== 'undefined' && value instanceof Blob)
  ) {
    return value
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T
  }

  if (value && typeof value === 'object') {
    const nextValue: Record<string, unknown> = {}
    Object.entries(value).forEach(([key, nestedValue]) => {
      nextValue[key] = cloneConfigValue(nestedValue)
    })
    return nextValue as T
  }

  return value
}

export const stripRuntimeInputValuesFromConfig = (
  nodeType: string,
  config: Record<string, unknown> | null | undefined,
) => {
  const nextConfig = cloneConfigValue(config ?? {})
  const definition = getNodeDefinition(nodeType)

  if (!definition) return nextConfig

  definition.properties.forEach((property) => {
    if (!property.isRuntimeInput) return
    nextConfig[property.name] = cloneConfigValue(property.default ?? null)
  })

  return nextConfig
}
