import { effectScope } from 'vue'
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { init, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useReportSections } from './viewers/reportViewer/useReportSections'
import type {
  ReportChartSection,
  ReportDependenceSection,
  ReportPayload,
  ReportRiskListSection,
  ReportSection,
  ReportSummarySection,
  ReportTextSection,
} from './viewers/reportViewer/reportTypes'

interface OfflineReportExportOptions {
  filename: string
}

interface ResolvedChartSection {
  kind: 'chart'
  key: string
  title: string
  option: Record<string, unknown>
}

interface ResolvedDependenceSection {
  kind: 'dependence'
  key: string
  title: string
  items: Array<{ key: string; title: string; option: Record<string, unknown> }>
}

interface ResolvedSummarySection {
  kind: 'summary'
  key: string
  section: ReportSummarySection
}

interface ResolvedRiskSection {
  kind: 'risk-list'
  key: string
  section: ReportRiskListSection
}

interface ResolvedTextSection {
  kind: 'text'
  key: string
  section: ReportTextSection
}

interface ResolvedImageSection {
  kind: 'image'
  key: string
  section: ReportSection
}

type ResolvedReportSection =
  | ResolvedChartSection
  | ResolvedDependenceSection
  | ResolvedSummarySection
  | ResolvedRiskSection
  | ResolvedTextSection
  | ResolvedImageSection

use([
  SVGRenderer,
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  VisualMapComponent,
])

const CHART_WIDTH = 960
const CHART_HEIGHT = 420
const DEPENDENCE_CHART_WIDTH = 440
const DEPENDENCE_CHART_HEIGHT = 280

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderChartToSvg = (option: Record<string, unknown>, width: number, height: number) => {
  const chart = init(null as unknown as HTMLElement, undefined, {
    renderer: 'svg',
    ssr: true,
    width,
    height,
  })

  try {
    chart.setOption(
      {
        animation: false,
        backgroundColor: '#ffffff',
        ...option,
      },
      { notMerge: true },
    )

    return chart.renderToSVGString()
  } finally {
    chart.dispose()
  }
}

const resolveOfflineSections = (report: ReportPayload) => {
  const scope = effectScope()

  try {
    const resolved = scope.run(() => {
      const {
        sections,
        supplements,
        expandedDependence,
        visibleDependence,
        resolveChartOption,
      } = useReportSections(() => ({
        kind: 'report',
        payload: report,
      }))

      expandedDependence.value = true

      const resolvedSections: ResolvedReportSection[] = sections.value.map((section, index) => {
        const key = String(section.key || `section-${index}`)

        if (section.type === 'chart') {
          return {
            kind: 'chart',
            key,
            title: String(section.title || '图表'),
            option: resolveChartOption(section as ReportChartSection, index),
          }
        }

        if (section.type === 'dependence') {
          return {
            kind: 'dependence',
            key,
            title: String(section.title || '因子趋势明细'),
            items: visibleDependence.value.map((item, itemIndex) => ({
              key: `${key}-${item.feature || item.title || itemIndex}`,
              title: String(item.title || item.feature || `因子 ${itemIndex + 1}`),
              option: (item.option ?? {}) as Record<string, unknown>,
            })),
          }
        }

        if (section.type === 'summary') {
          return {
            kind: 'summary',
            key,
            section: section as ReportSummarySection,
          }
        }

        if (section.type === 'risk-list') {
          return {
            kind: 'risk-list',
            key,
            section: section as ReportRiskListSection,
          }
        }

        if (section.type === 'text') {
          return {
            kind: 'text',
            key,
            section: section as ReportTextSection,
          }
        }

        return {
          kind: 'image',
          key,
          section,
        }
      })

      return {
        sections: resolvedSections,
        supplements: supplements.value,
      }
    })

    return (
      resolved ?? {
        sections: [] as ResolvedReportSection[],
        supplements: {} as Record<string, unknown>,
      }
    )
  } finally {
    scope.stop()
  }
}

const buildSummarySectionHtml = (section: ReportSummarySection) => `
  <section class="report-section">
    <h2>${escapeHtml(section.title || '摘要')}</h2>
    ${
      section.content
        ? `<p class="section-text">${escapeHtml(section.content)}</p>`
        : ''
    }
    <div class="summary-grid">
      ${(section.cards ?? [])
        .map(
          (card) => `
            <article class="summary-card">
              <p class="summary-label">${escapeHtml(card.label)}</p>
              <p class="summary-value">${escapeHtml(card.value)}</p>
            </article>
          `,
        )
        .join('')}
    </div>
  </section>
`

const buildRiskSectionHtml = (section: ReportRiskListSection) => `
  <section class="report-section">
    <h2>${escapeHtml(section.title || '结果可信提示')}</h2>
    <div class="risk-list">
      ${(section.items ?? [])
        .map(
          (item) => `
            <article class="risk-item">
              <div class="risk-head">
                <h3>${escapeHtml(item.title)}</h3>
                <span class="risk-badge">${escapeHtml(
                  item.level === 'danger' ? '高风险' : item.level === 'warning' ? '需关注' : '提示',
                )}</span>
              </div>
              <p class="section-text">${escapeHtml(item.message)}</p>
            </article>
          `,
        )
        .join('')}
    </div>
  </section>
`

const buildTextSectionHtml = (section: ReportTextSection) => `
  <section class="report-section">
    <h2>${escapeHtml(section.title || '说明')}</h2>
    <pre class="detail-block">${escapeHtml(section.content || '')}</pre>
  </section>
`

const buildImageSectionHtml = (section: ReportSection) => {
  if (!('url' in section) || typeof section.url !== 'string' || section.url.trim() === '') {
    return ''
  }

  return `
    <section class="report-section">
      <h2>${escapeHtml(section.title || '图片')}</h2>
      <img class="report-image" src="${escapeHtml(section.url)}" alt="${escapeHtml(
        ('alt' in section && typeof section.alt === 'string' ? section.alt : section.title) || '报告图片',
      )}" />
    </section>
  `
}

export const buildOfflineReportHtml = async (
  report: ReportPayload,
  options: OfflineReportExportOptions,
) => {
  const resolved = resolveOfflineSections(report)
  const sections = resolved.sections
  const supplements = resolved.supplements

  const sectionHtml = sections
    .map((section: ResolvedReportSection) => {
      if (section.kind === 'summary') {
        return buildSummarySectionHtml(section.section)
      }

      if (section.kind === 'chart') {
        const svg = renderChartToSvg(section.option, CHART_WIDTH, CHART_HEIGHT)
        return `
          <section class="report-section">
            <h2>${escapeHtml(section.title)}</h2>
            <div class="chart-shell">${svg}</div>
          </section>
        `
      }

      if (section.kind === 'dependence') {
        return `
          <section class="report-section">
            <h2>${escapeHtml(section.title)}</h2>
            <div class="dependence-grid">
              ${section.items
                .map((item: ResolvedDependenceSection['items'][number]) => {
                  const svg = renderChartToSvg(item.option, DEPENDENCE_CHART_WIDTH, DEPENDENCE_CHART_HEIGHT)
                  return `
                    <article class="dependence-card">
                      <h3>${escapeHtml(item.title)}</h3>
                      <div class="chart-shell">${svg}</div>
                    </article>
                  `
                })
                .join('')}
            </div>
          </section>
        `
      }

      if (section.kind === 'risk-list') {
        return buildRiskSectionHtml(section.section)
      }

      if (section.kind === 'text') {
        return buildTextSectionHtml(section.section)
      }

      return buildImageSectionHtml(section.section)
    })
    .join('')

  const supplementHtml = [
    typeof supplements.fullReportImage === 'string' && supplements.fullReportImage.trim() !== ''
      ? `
        <section class="report-section">
          <h2>后端原始整图</h2>
          <img class="report-image" src="${escapeHtml(supplements.fullReportImage)}" alt="后端原始整图" />
        </section>
      `
      : '',
    typeof supplements.beeswarmImage === 'string' && supplements.beeswarmImage.trim() !== ''
      ? `
        <section class="report-section">
          <h2>后端补充图</h2>
          <img class="report-image" src="${escapeHtml(supplements.beeswarmImage)}" alt="后端补充图" />
        </section>
      `
      : '',
  ].join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(report.title || options.filename)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #e2e8f0;
        --surface: #ffffff;
        --muted: #475569;
        --border: #cbd5e1;
        --title: #0f172a;
        --accent: #2563eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: linear-gradient(180deg, #f8fafc 0%, var(--bg) 100%);
        color: var(--title);
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      }
      .page {
        max-width: 1160px;
        margin: 0 auto;
        padding: 40px 24px 56px;
      }
      .hero, .report-section {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 28px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
      }
      .hero {
        padding: 32px;
      }
      .hero-tag {
        display: inline-flex;
        padding: 8px 14px;
        border-radius: 999px;
        background: #eff6ff;
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
      }
      h1 {
        margin: 18px 0 8px;
        font-size: 34px;
        line-height: 1.2;
      }
      h2 {
        margin: 0 0 18px;
        font-size: 24px;
        line-height: 1.3;
      }
      h3 {
        margin: 0 0 12px;
        font-size: 18px;
        line-height: 1.4;
      }
      .hero-meta, .section-text, .summary-label, .risk-badge {
        color: var(--muted);
      }
      .hero-meta, .section-text {
        font-size: 14px;
        line-height: 1.8;
        white-space: pre-wrap;
      }
      main {
        margin-top: 24px;
        display: grid;
        gap: 20px;
      }
      .report-section {
        padding: 28px;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }
      .summary-card, .risk-item, .dependence-card {
        border: 1px solid var(--border);
        border-radius: 22px;
        background: #f8fafc;
        padding: 18px;
      }
      .summary-label {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .summary-value {
        margin: 10px 0 0;
        font-size: 24px;
        font-weight: 800;
        color: var(--title);
      }
      .risk-list, .dependence-grid {
        display: grid;
        gap: 14px;
      }
      .risk-head {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
      }
      .risk-badge {
        display: inline-flex;
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 4px 10px;
        background: #fff;
        font-size: 12px;
        font-weight: 700;
      }
      .chart-shell {
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 24px;
        background: #fff;
        padding: 10px;
      }
      .chart-shell svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .dependence-grid {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .detail-block {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.7;
        color: var(--muted);
      }
      .report-image {
        display: block;
        width: 100%;
        height: auto;
        border: 1px solid var(--border);
        border-radius: 24px;
        background: #fff;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header class="hero">
        <span class="hero-tag">离线分析报告</span>
        <h1>${escapeHtml(report.title || '分析报告')}</h1>
        <p class="hero-meta">文件名：${escapeHtml(options.filename)}</p>
        <p class="hero-meta">该文件为离线阅读版，可直接在浏览器中打开查看。</p>
      </header>
      <main>
        ${sectionHtml}
        ${supplementHtml}
      </main>
    </div>
  </body>
</html>`
}

export const downloadOfflineReportHtml = async (
  report: ReportPayload,
  options: OfflineReportExportOptions,
) => {
  const html = await buildOfflineReportHtml(report, options)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = options.filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const exportReportToHtmlFile = downloadOfflineReportHtml
