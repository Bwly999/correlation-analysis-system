import { ref } from 'vue'

const isValidWidth = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

export const useTablePreviewLayout = () => {
  const columnWidths = ref<Record<string, number | undefined>>({})
  const headerRowHeight = ref(48)
  const selectedFields = ref<string[]>([])
  const pendingWidth = ref<number | null>(null)
  const isWidthPanelOpen = ref(false)

  const setColumnWidth = (field: string, width: number) => {
    if (!isValidWidth(width)) return
    columnWidths.value = {
      ...columnWidths.value,
      [field]: width,
    }
  }

  const applyWidthToFields = () => {
    if (!isValidWidth(pendingWidth.value)) return
    const widthValue = pendingWidth.value as number
    const updated = selectedFields.value.reduce((acc, field) => {
      acc[field] = widthValue
      return acc
    }, {} as Record<string, number | undefined>)

    columnWidths.value = {
      ...columnWidths.value,
      ...updated,
    }
  }

  const resetColumnWidths = () => {
    columnWidths.value = {}
  }

  const openWidthPanel = () => {
    isWidthPanelOpen.value = true
  }

  const closeWidthPanel = () => {
    isWidthPanelOpen.value = false
  }

  return {
    columnWidths,
    headerRowHeight,
    selectedFields,
    pendingWidth,
    isWidthPanelOpen,
    setColumnWidth,
    applyWidthToFields,
    resetColumnWidths,
    openWidthPanel,
    closeWidthPanel,
  }
}
