import type { NodeProperty } from '@/nodes/types'

interface ApplyDependencyResetParams {
  properties: NodeProperty[]
  previousConfig: Record<string, any>
  propName: string
  value: unknown
}

const getDefaultValue = (property: NodeProperty) => {
  if (property.default !== undefined) return property.default
  if (property.type === 'multi-options') return []
  if (property.type === 'tree') return {}
  return null
}

export const applyDependencyReset = ({
  properties,
  previousConfig,
  propName,
  value,
}: ApplyDependencyResetParams) => {
  const nextConfig = { ...previousConfig, [propName]: value }

  if (Object.is(previousConfig[propName], value)) {
    return nextConfig
  }

  const queue = [propName]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current)) continue
    visited.add(current)

    properties.forEach((property) => {
      if (!property.dependencies?.includes(current)) return
      nextConfig[property.name] = getDefaultValue(property)
      queue.push(property.name)
    })
  }

  return nextConfig
}
