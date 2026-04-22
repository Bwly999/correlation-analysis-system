import { computed, shallowRef, watch } from 'vue'
import { NUMERIC_ANALYSIS_FIELD_NAMES } from './constants'
import type { PropertyFieldProps } from './types'

export const usePropertyFieldOptions = (props: PropertyFieldProps) => {
  const remoteOptions = shallowRef<any[]>([])
  const isOptionsLoading = shallowRef(false)
  const optionsError = shallowRef('')

  const isHeroSelectButton = computed(
    () => props.prop.type === 'select-button' && props.prop.name === 'fetchMode',
  )

  const dependencyKey = computed(() =>
    JSON.stringify({
      dependencies: (props.prop.dependencies || []).map((key) => props.configContext?.[key] ?? null),
      nodeId: props.nodeId ?? null,
      inputData: props.inputData ?? null,
    }),
  )

  const loadOptions = async () => {
    if (!props.prop.resolveOptions) {
      remoteOptions.value = props.prop.options || []
      optionsError.value = ''
      return
    }

    isOptionsLoading.value = true
    optionsError.value = ''

    try {
      remoteOptions.value =
        (await props.prop.resolveOptions({
          config: props.configContext || {},
          property: props.prop,
          nodeId: props.nodeId,
          inputData: props.inputData,
        })) || []
    } catch (error: any) {
      remoteOptions.value = []
      optionsError.value = error?.message || '选项加载失败'
    } finally {
      isOptionsLoading.value = false
    }
  }

  watch(
    () => [props.prop.name, dependencyKey.value],
    () => {
      void loadOptions()
    },
    { immediate: true },
  )

  const optionSource = computed(() => {
    if (props.prop.useUpstreamFactors) return props.upstreamFactors
    if (props.prop.resolveOptions) return remoteOptions.value
    return props.prop.options || []
  })

  const requiresNumericAnalysisField = computed(() =>
    NUMERIC_ANALYSIS_FIELD_NAMES.includes(
      props.prop.name as (typeof NUMERIC_ANALYSIS_FIELD_NAMES)[number],
    ),
  )

  const normalizedOptionSource = computed(() => {
    const rawOptions = Array.isArray(optionSource.value) ? optionSource.value : []

    return rawOptions.map((option) => {
      if (!option || typeof option !== 'object') return option
      if (
        requiresNumericAnalysisField.value &&
        props.prop.useUpstreamFactors &&
        'dataType' in option &&
        (option as Record<string, any>).dataType &&
        (option as Record<string, any>).dataType !== 'number'
      ) {
        return {
          ...(option as Record<string, any>),
          disabled: true,
          hint: (option as Record<string, any>).hint || '仅支持数值字段参与当前分析',
        }
      }

      return option
    })
  })

  const normalizedMultiOptionsSource = computed(() => {
    const baseOptions = Array.isArray(normalizedOptionSource.value) ? normalizedOptionSource.value : []
    const selectedValues = Array.isArray(props.modelValue) ? props.modelValue : []
    const existingValues = new Set(
      baseOptions.map((option) =>
        option && typeof option === 'object' && 'value' in option ? option.value : option,
      ),
    )
    const missingOptions: Array<{ name: string; value: unknown }> = []

    selectedValues.forEach((value) => {
      if (existingValues.has(value)) return
      missingOptions.push({
        name: String(value),
        value,
      })
      existingValues.add(value)
    })

    if (missingOptions.length === 0) return baseOptions

    return [...baseOptions, ...missingOptions]
  })

  const nonAnalyzableUpstreamFactors = computed(() => {
    if (!requiresNumericAnalysisField.value || !props.prop.useUpstreamFactors) return []

    return normalizedOptionSource.value.filter(
      (option) =>
        option &&
        typeof option === 'object' &&
        'disabled' in option &&
        Boolean((option as Record<string, any>).disabled),
    ) as Array<Record<string, any>>
  })

  const showUpstreamEmptyHint = computed(
    () =>
      props.prop.useUpstreamFactors &&
      requiresNumericAnalysisField.value &&
      optionSource.value.length === 0,
  )

  const nonAnalyzableHintText = computed(() => {
    if (nonAnalyzableUpstreamFactors.value.length === 0) return ''

    return `以下字段暂不支持当前分析：${nonAnalyzableUpstreamFactors.value.map((item) => item.name).join('、')}`
  })

  const upstreamEmptyHintText = '当前没有可选字段，请先连接上游数据或使用左侧输入数据。'

  return {
    isHeroSelectButton,
    optionSource,
    normalizedOptionSource,
    normalizedMultiOptionsSource,
    nonAnalyzableUpstreamFactors,
    showUpstreamEmptyHint,
    nonAnalyzableHintText,
    upstreamEmptyHintText,
    isOptionsLoading,
    optionsError,
  }
}
