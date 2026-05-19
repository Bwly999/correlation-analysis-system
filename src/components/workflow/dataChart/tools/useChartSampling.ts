import { computed, type Ref } from 'vue'

export const useChartSampling = (chartType: Ref<string>) => {
  const usesSampling = computed(() => chartType.value === 'line')
  return {
    usesSampling,
  }
}
