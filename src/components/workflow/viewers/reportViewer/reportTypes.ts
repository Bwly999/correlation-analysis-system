export type ReportSectionType =
  | 'summary'
  | 'chart'
  | 'dependence'
  | 'text'
  | 'risk-list'
  | 'image'

export type ReportChartOption = Record<string, unknown>

export interface ReportSectionBase {
  key?: string
  type?: ReportSectionType | string
  title?: string
}

export interface ReportSummaryCard {
  label: string
  value: unknown
}

export interface ReportChartSelectControl {
  label?: string
  modelKey?: string
  options?: string[]
}

export interface ReportChartLabelTruncateControl {
  label?: string
  modelKey?: string
  defaultValue?: number
}

export interface ReportChartToggleControl {
  label?: string
  modelKey?: string
  defaultValue?: boolean
}

export interface ReportChartControls {
  select?: ReportChartSelectControl
  labelTruncate?: ReportChartLabelTruncateControl
  toggle?: ReportChartToggleControl
}

export interface ReportDependenceItem {
  feature?: string
  title?: string
  option?: ReportChartOption
}

export interface ReportRiskItem {
  level?: string
  title?: string
  message?: string
}

export interface ReportSummarySection extends ReportSectionBase {
  type?: 'summary'
  cards?: ReportSummaryCard[]
  content?: string
}

export interface ReportChartSection extends ReportSectionBase {
  type?: 'chart'
  option?: ReportChartOption
  optionMap?: Record<string, ReportChartOption>
  controls?: ReportChartControls
  items?: Array<Record<string, unknown>>
}

export interface ReportDependenceSection extends ReportSectionBase {
  type?: 'dependence'
  items?: ReportDependenceItem[]
  defaultVisibleCount?: number
}

export interface ReportTextSection extends ReportSectionBase {
  type?: 'text'
  content?: string
}

export interface ReportRiskListSection extends ReportSectionBase {
  type?: 'risk-list'
  items?: ReportRiskItem[]
}

export interface ReportImageSection extends ReportSectionBase {
  type?: 'image'
  url?: string
  alt?: string
}

export type ReportSection =
  | ReportSummarySection
  | ReportChartSection
  | ReportDependenceSection
  | ReportTextSection
  | ReportRiskListSection
  | ReportImageSection

export interface ReportPayload {
  title?: string
  sections?: ReportSection[]
  supplements?: Record<string, unknown>
  metadata?: Record<string, unknown>
}
