import type { Ref } from 'vue'
import type { ChartFilterPreset } from './types'

type UseChartFilterPresetsOptions = {
  lowerBound: Ref<number | null>
  upperBound: Ref<number | null>
  selectedPresetId: Ref<string | null>
  savedPresets: Ref<ChartFilterPreset[]>
  defaultPresetId: Ref<string | 'none' | null>
  presetNameInput: Ref<string>
}

const createDefaultPresetName = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `过滤条件 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export const useChartFilterPresets = ({
  lowerBound,
  upperBound,
  selectedPresetId,
  savedPresets,
  defaultPresetId,
  presetNameInput,
}: UseChartFilterPresetsOptions) => {
  const applyPreset = (preset: ChartFilterPreset | null) => {
    lowerBound.value = preset?.lowerBound ?? null
    upperBound.value = preset?.upperBound ?? null
    selectedPresetId.value = preset?.id ?? null
    presetNameInput.value = preset?.name ?? ''
  }

  const applyDefaultPreset = () => {
    if (defaultPresetId.value === 'none') {
      applyPreset(null)
      return
    }

    const preset = savedPresets.value.find((item) => item.id === defaultPresetId.value) ?? null
    if (!preset) {
      defaultPresetId.value = null
      applyPreset(null)
      return
    }

    applyPreset(preset)
  }

  const saveCurrentPreset = () => {
    const preset: ChartFilterPreset = {
      id: `chart_filter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: presetNameInput.value.trim() || createDefaultPresetName(),
      lowerBound: lowerBound.value,
      upperBound: upperBound.value,
      updatedAt: Date.now(),
    }

    const existingIndex = selectedPresetId.value
      ? savedPresets.value.findIndex((item) => item.id === selectedPresetId.value)
      : -1

    if (existingIndex >= 0) {
      savedPresets.value = savedPresets.value.map((item, index) =>
        index === existingIndex ? { ...preset, id: item.id } : item,
      )
      selectedPresetId.value = savedPresets.value[existingIndex]?.id ?? null
      return
    }

    savedPresets.value = [preset, ...savedPresets.value]
    selectedPresetId.value = preset.id
  }

  const deletePreset = (presetId: string) => {
    savedPresets.value = savedPresets.value.filter((item) => item.id !== presetId)
    if (selectedPresetId.value === presetId) {
      selectedPresetId.value = null
      presetNameInput.value = ''
    }
    if (defaultPresetId.value === presetId) {
      defaultPresetId.value = null
    }
  }

  const selectAndApplyPreset = (preset: ChartFilterPreset) => {
    applyPreset(preset)
  }

  const markCurrentSelectionAsDefault = () => {
    if (!selectedPresetId.value) return
    defaultPresetId.value = selectedPresetId.value
  }

  const setNoFilterAsDefault = () => {
    defaultPresetId.value = 'none'
    applyPreset(null)
  }

  const syncSelectionWithBounds = () => {
    if (!selectedPresetId.value) return
    const selectedPreset = savedPresets.value.find((item) => item.id === selectedPresetId.value)
    if (!selectedPreset) {
      selectedPresetId.value = null
      return
    }

    const unchanged =
      selectedPreset.lowerBound === lowerBound.value && selectedPreset.upperBound === upperBound.value

    if (!unchanged) {
      selectedPresetId.value = null
    }
  }

  return {
    applyPreset,
    applyDefaultPreset,
    deletePreset,
    markCurrentSelectionAsDefault,
    saveCurrentPreset,
    selectAndApplyPreset,
    setNoFilterAsDefault,
    syncSelectionWithBounds,
  }
}
