import { computed, ref } from 'vue'
import { getResultReport } from '../../resultView'
import type {
  ReportChartOption,
  ReportChartSection,
  ReportDependenceItem,
  ReportDependenceSection,
  ReportPayload,
  ReportSection,
} from './reportTypes'

const FALLBACK_SECTION_KEY_PREFIX = 'section'

export const useReportSections = (getData: () => unknown) => {
  const featureSearch = ref('')
  const expandedDependence = ref(false)
  const chartSelectState = ref<Record<string, string>>({})
  const labelTruncateState = ref<Record<string, number>>({})

  const report = computed<ReportPayload>(() => (getResultReport(getData()) ?? {}) as ReportPayload)
  const sections = computed<ReportSection[]>(() =>
    Array.isArray(report.value.sections) ? report.value.sections : [],
  )
  const supplements = computed<Record<string, unknown>>(() => report.value.supplements ?? {})
  const metadata = computed<Record<string, unknown>>(() => report.value.metadata ?? {})

  const isShapReport = computed(() =>
    sections.value.some(
      (section) => section?.type === 'dependence' || ['importance', 'dependence'].includes(section?.key ?? ''),
    ),
  )

  const dependenceSection = computed<ReportDependenceSection | undefined>(() =>
    sections.value.find(
      (section): section is ReportDependenceSection =>
        section?.key === 'dependence' || section?.type === 'dependence',
    ),
  )

  const importanceRankMap = computed(() => {
    const section = sections.value.find(
      (item) => item?.key === 'importance' || item?.title === '特征贡献排行',
    )
    const items = Array.isArray((section as ReportChartSection | undefined)?.items)
      ? (section as ReportChartSection).items ?? []
      : []

    return new Map(
      items.map((item, index) => [String(item.name ?? item.feature ?? ''), index]),
    )
  })

  const normalizedDependence = computed<ReportDependenceItem[]>(() => {
    const section = dependenceSection.value
    if (!section) return []

    const items = Array.isArray(section.items) ? [...section.items] : []
    items.sort((left, right) => {
      const leftKey = String(left.feature ?? left.title ?? '')
      const rightKey = String(right.feature ?? right.title ?? '')
      const leftRank = importanceRankMap.value.get(leftKey) ?? Number.MAX_SAFE_INTEGER
      const rightRank = importanceRankMap.value.get(rightKey) ?? Number.MAX_SAFE_INTEGER

      if (leftRank !== rightRank) return leftRank - rightRank
      return leftKey.localeCompare(rightKey, 'zh-CN')
    })

    const keyword = featureSearch.value.trim().toLowerCase()
    if (!keyword) return items

    return items.filter((item) =>
      String(item.feature ?? item.title ?? '')
        .toLowerCase()
        .includes(keyword),
    )
  })

  const visibleDependence = computed<ReportDependenceItem[]>(() => {
    const section = dependenceSection.value
    const items = normalizedDependence.value
    if (!section) return []
    if (featureSearch.value.trim() || expandedDependence.value) return items

    const limit = section.defaultVisibleCount || items.length
    return items.slice(0, limit)
  })

  const hasMoreDependence = computed(() => {
    const section = dependenceSection.value
    if (!section || featureSearch.value.trim()) return false

    const items = normalizedDependence.value
    const limit = section.defaultVisibleCount || items.length
    return !expandedDependence.value && items.length > limit
  })

  const getSectionKey = (section: ReportSection, index: number) =>
    section.key || `${FALLBACK_SECTION_KEY_PREFIX}-${index}`

  const getChartSelectedValue = (section: ReportChartSection, index: number) => {
    const stateKey = getSectionKey(section, index)
    const options = section.controls?.select?.options ?? []
    const selectedValue = chartSelectState.value[stateKey]
    if (selectedValue && options.includes(selectedValue)) return selectedValue

    const modelKey = section.controls?.select?.modelKey
    if (typeof modelKey === 'string' && typeof metadata.value[modelKey] === 'string') {
      const metadataValue = String(metadata.value[modelKey])
      if (options.includes(metadataValue)) return metadataValue
    }

    return options[0] ?? ''
  }

  const setChartSelectedValue = (section: ReportChartSection, index: number, value: string) => {
    chartSelectState.value[getSectionKey(section, index)] = value
  }

  const getLabelTruncateLength = (section: ReportChartSection, index: number) => {
    const stateKey = getSectionKey(section, index)
    const stateValue = labelTruncateState.value[stateKey]
    if (typeof stateValue === 'number' && Number.isFinite(stateValue)) {
      return Math.max(0, Math.trunc(stateValue))
    }

    return Math.max(0, Math.trunc(section.controls?.labelTruncate?.defaultValue ?? 12))
  }

  const setLabelTruncateLength = (section: ReportChartSection, index: number, value: number) => {
    labelTruncateState.value[getSectionKey(section, index)] = value
  }

  const truncateLabel = (label: string, length: number) => {
    if (length <= 0 || label.length <= length) return label
    return `${label.slice(0, length)}...`
  }

  const withAxisLabelTruncation = (axis: unknown, truncateLength: number): unknown => {
    if (Array.isArray(axis)) {
      return axis.map((item) => withAxisLabelTruncation(item, truncateLength))
    }

    if (!axis || typeof axis !== 'object') return axis

    const baseAxis = axis as Record<string, unknown>
    return {
      ...baseAxis,
      axisLabel: {
        ...((baseAxis.axisLabel as Record<string, unknown> | undefined) ?? {}),
        formatter: (value: string) => truncateLabel(String(value), truncateLength),
      },
    }
  }

  const resolveChartOption = (section: ReportChartSection, index: number): ReportChartOption => {
    const selectedValue = getChartSelectedValue(section, index)
    const optionMap = section.optionMap ?? {}
    const baseOption =
      (selectedValue ? optionMap[selectedValue] : undefined) ??
      optionMap[Object.keys(optionMap)[0] ?? ''] ??
      section.option

    if (!baseOption) return {}

    const truncateLength = getLabelTruncateLength(section, index)

    return {
      ...baseOption,
      xAxis: withAxisLabelTruncation(baseOption.xAxis, truncateLength),
      yAxis: withAxisLabelTruncation(baseOption.yAxis, truncateLength),
    }
  }

  return {
    report,
    sections,
    supplements,
    isShapReport,
    featureSearch,
    expandedDependence,
    visibleDependence,
    hasMoreDependence,
    getChartSelectedValue,
    setChartSelectedValue,
    getLabelTruncateLength,
    setLabelTruncateLength,
    resolveChartOption,
  }
}
