import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useChartFilterPresets } from '../useChartFilterPresets'

describe('useChartFilterPresets', () => {
  it('clears selected preset when bounds diverge from the saved preset', () => {
    const lowerBound = ref<number | null>(10)
    const upperBound = ref<number | null>(20)
    const selectedPresetId = ref<string | null>('preset-1')
    const savedPresets = ref([
      {
        id: 'preset-1',
        name: '默认过滤',
        lowerBound: 10,
        upperBound: 20,
        updatedAt: 1,
      },
    ])
    const defaultPresetId = ref<string | 'none' | null>('preset-1')
    const presetNameInput = ref('')

    const presets = useChartFilterPresets({
      lowerBound,
      upperBound,
      selectedPresetId,
      savedPresets,
      defaultPresetId,
      presetNameInput,
    })

    lowerBound.value = 11
    presets.syncSelectionWithBounds()

    expect(selectedPresetId.value).toBeNull()
    expect(defaultPresetId.value).toBe('preset-1')
  })

  it('supports applying no-filter as default and resolving it on startup', () => {
    const lowerBound = ref<number | null>(5)
    const upperBound = ref<number | null>(15)
    const selectedPresetId = ref<string | null>(null)
    const savedPresets = ref([
      {
        id: 'preset-1',
        name: '过滤条件',
        lowerBound: 5,
        upperBound: 15,
        updatedAt: 1,
      },
    ])
    const defaultPresetId = ref<string | 'none' | null>('none')
    const presetNameInput = ref('')

    const presets = useChartFilterPresets({
      lowerBound,
      upperBound,
      selectedPresetId,
      savedPresets,
      defaultPresetId,
      presetNameInput,
    })

    presets.applyDefaultPreset()

    expect(lowerBound.value).toBeNull()
    expect(upperBound.value).toBeNull()
    expect(selectedPresetId.value).toBeNull()
  })
})
