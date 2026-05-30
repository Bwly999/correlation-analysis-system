type LegacyTreeSelectionState = Record<string, { checked?: boolean }>

interface TreeModelValue<TValue = unknown> {
  selectedKeys?: string[]
  values?: TValue[]
}

export interface NeighborSystemFactorSelectionValue {
  factorKey: string
  factorName?: string
  materialType?: string
  processName?: string
  r2Name?: string
}

const FACTOR_KEY_PREFIX = 'factor:'

const extractCheckedLeafKeys = (
  selection: Record<string, { checked?: boolean }> | undefined,
  prefix: string,
) =>
  Object.entries(selection || {})
    .filter(([key, state]) => Boolean(state?.checked) && key.startsWith(prefix))
    .map(([key]) => key)

const isLegacyTreeSelectionState = (value: unknown): value is LegacyTreeSelectionState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).some((item) => item && typeof item === 'object' && 'checked' in item)
}

export const getSelectedKeys = (selection: unknown) => {
  if (isLegacyTreeSelectionState(selection)) {
    return extractCheckedLeafKeys(selection, '')
  }

  const selectedKeys = (selection as TreeModelValue | undefined)?.selectedKeys
  return Array.isArray(selectedKeys) ? selectedKeys.filter((item): item is string => Boolean(item)) : []
}

export const parseFactorSelections = (selection: unknown) => {
  const wrappedValues = (selection as { values?: NeighborSystemFactorSelectionValue[] } | undefined)?.values
  if (Array.isArray(wrappedValues) && wrappedValues.length > 0) {
    const factorValues = wrappedValues.filter((item) => Boolean(item?.factorKey))

    return {
      factorKeys: factorValues.map((item) => item.factorKey),
      factorValues,
    }
  }

  const factorSelections = getSelectedKeys(selection).filter((key) => key.startsWith(FACTOR_KEY_PREFIX))

  return {
    factorKeys: factorSelections
      .map((key) => {
        const segments = key.slice(FACTOR_KEY_PREFIX.length).split('::')
        return segments[segments.length - 1]
      })
      .filter((value): value is string => Boolean(value)),
    factorValues: factorSelections
      .map((key) => {
        const segments = key.slice(FACTOR_KEY_PREFIX.length).split('::')
        const processName = segments[0] || ''
        const factorKey = segments[segments.length - 1] || ''

        if (!factorKey) return null

        return {
          factorKey,
          factorName: factorKey,
          materialType: '',
          processName,
          r2Name: '',
        } satisfies NeighborSystemFactorSelectionValue
      })
      .filter((value): value is NeighborSystemFactorSelectionValue => Boolean(value)),
  }
}

export const extractProcessNamesFromFactorSelection = (selection: unknown) => {
  const { factorValues } = parseFactorSelections(selection)

  return Array.from(
    new Set(
      factorValues
        .map((item) => item.processName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )
}
