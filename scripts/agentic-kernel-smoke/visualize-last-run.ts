import { readFile, writeFile } from 'node:fs/promises'
import { resolveSmokeArtifactPaths } from './artifacts.js'

type ToolCall = {
  toolName: string
  status: string
}

type ProjectionSnapshot = {
  analysisSummary?: string
  executionStatus?: string
  latestAction?: string
  toolCalls: ToolCall[]
  error?: unknown
}

type SessionSnapshot = {
  id?: string
  status?: string
}

type DebugEvent = {
  scope?: string
  message?: string
  details?: Record<string, unknown>
}

type SnapshotRow = {
  index: number
  sessionStatus: string
  executionStatus: string
  latestAction: string
  cumulativeToolCalls: number
  newTools: string[]
  toolCalls: ToolCall[]
}

type SmokeReport = {
  ok?: boolean
  sessionId?: string
  sessionStatus?: string
  executionStatus?: string
  latestAction?: string
  toolCallCount?: number
  toolNames?: string[]
  analysisSummary?: string
  error?: string
}

const {
  debugLogPath: DEBUG_LOG_PATH,
  reportPath: REPORT_PATH,
  visualizationPath: OUTPUT_PATH,
} = resolveSmokeArtifactPaths()

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const extractLastJsonObject = (content: string) => {
  const trimmed = content.trim()
  const startIndex = trimmed.lastIndexOf('\n{')
  const candidate = startIndex >= 0 ? trimmed.slice(startIndex + 1) : trimmed
  return candidate.trim()
}

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, 'utf8')
  return JSON.parse(extractLastJsonObject(content)) as T
}

const parseDebugEvents = async () => {
  const content = await readFile(DEBUG_LOG_PATH, 'utf8')
  const events: DebugEvent[] = []

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
    try {
      const parsed = JSON.parse(trimmed) as DebugEvent
      if (parsed.scope === 'agentic-kernel-smoke') {
        events.push(parsed)
      }
    } catch {
      // Ignore non-JSON noise emitted by npm or partial lines.
    }
  }

  return events
}

const asProjection = (value: unknown): ProjectionSnapshot => {
  const projection = (value ?? {}) as Record<string, unknown>
  return {
    analysisSummary: typeof projection.analysisSummary === 'string' ? projection.analysisSummary : undefined,
    executionStatus: typeof projection.executionStatus === 'string' ? projection.executionStatus : undefined,
    latestAction: typeof projection.latestAction === 'string' ? projection.latestAction : undefined,
    toolCalls: Array.isArray(projection.toolCalls)
      ? projection.toolCalls
          .map((item) => {
            const tool = item as Record<string, unknown>
            return {
              toolName: typeof tool.toolName === 'string' ? tool.toolName : '',
              status: typeof tool.status === 'string' ? tool.status : '',
            }
          })
          .filter((item) => item.toolName)
      : [],
    error: projection.error,
  }
}

const buildSnapshotRows = (events: DebugEvent[]) => {
  const rows: SnapshotRow[] = []
  let previousTools: string[] = []

  for (const event of events) {
    if (event.message !== 'session poll update' && event.message !== 'message route returned') continue

    const details = (event.details ?? {}) as Record<string, unknown>
    const session = (details.session ?? {}) as SessionSnapshot
    const projection = asProjection(details.projection)
    const currentTools = projection.toolCalls.map((item) => item.toolName)
    const newTools = currentTools.slice(previousTools.length)

    rows.push({
      index: rows.length + 1,
      sessionStatus: session.status ?? 'unknown',
      executionStatus: projection.executionStatus ?? 'unknown',
      latestAction: projection.latestAction ?? '无',
      cumulativeToolCalls: currentTools.length,
      newTools,
      toolCalls: projection.toolCalls,
    })

    previousTools = currentTools
  }

  return rows
}

const summarizeEvents = (events: DebugEvent[]) => {
  const eventCounts = new Map<string, number>()
  const stageEvents: Array<{ label: string; detail: string }> = []

  for (const event of events) {
    const label = event.message ?? 'unknown'
    eventCounts.set(label, (eventCounts.get(label) ?? 0) + 1)

    if (label === 'started test server') {
      const details = (event.details ?? {}) as Record<string, unknown>
      stageEvents.push({
        label: '启动测试服务',
        detail: `端口 ${String(details.port ?? '-')}`,
      })
    }

    if (label === 'created agent session') {
      const details = (event.details ?? {}) as Record<string, unknown>
      stageEvents.push({
        label: '创建会话',
        detail: `Session ${String(details.sessionId ?? '-')}`,
      })
    }

    if (label === 'message route returned') {
      stageEvents.push({
        label: '触发分析',
        detail: '消息路由已返回，开始异步执行',
      })
    }
  }

  return {
    eventCounts: [...eventCounts.entries()].map(([name, count]) => ({ name, count })),
    stageEvents,
  }
}

const countTools = (toolCalls: ToolCall[]) => {
  const counts = new Map<string, number>()
  for (const tool of toolCalls) {
    counts.set(tool.toolName, (counts.get(tool.toolName) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

const buildBarChart = (items: Array<{ name: string; count: number }>, color: string) => {
  if (items.length === 0) {
    return '<p class="empty">暂无可展示数据</p>'
  }

  const max = Math.max(...items.map((item) => item.count), 1)
  return `
    <div class="bar-chart">
      ${items
        .map((item) => {
          const width = Math.max(8, Math.round((item.count / max) * 100))
          return `
            <div class="bar-row">
              <div class="bar-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
              <div class="bar-track">
                <div class="bar-fill" style="width:${width}%;background:${color}"></div>
              </div>
              <div class="bar-value">${item.count}</div>
            </div>
          `
        })
        .join('')}
    </div>
  `
}

const buildLineChart = (rows: SnapshotRow[]) => {
  if (rows.length === 0) {
    return '<p class="empty">暂无轮询快照</p>'
  }

  const width = 880
  const height = 260
  const padding = 28
  const maxY = Math.max(...rows.map((row) => row.cumulativeToolCalls), 1)
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2

  const points = rows.map((row, index) => {
    const x = padding + (rows.length === 1 ? usableWidth / 2 : (index / (rows.length - 1)) * usableWidth)
    const y = height - padding - (row.cumulativeToolCalls / maxY) * usableHeight
    return { x, y, row }
  })

  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const yAxisLabels = Array.from({ length: 5 }, (_, index) => {
    const value = Math.round((maxY / 4) * (4 - index))
    const y = padding + (usableHeight / 4) * index
    return `
      <g>
        <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="chart-grid" />
        <text x="${padding - 10}" y="${y + 4}" text-anchor="end" class="chart-axis">${value}</text>
      </g>
    `
  }).join('')

  return `
    <svg viewBox="0 0 ${width} ${height}" class="line-chart" role="img" aria-label="轮询快照累计工具调用折线图">
      ${yAxisLabels}
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis-line" />
      <polyline fill="none" stroke="#2563eb" stroke-width="3" points="${polyline}" />
      ${points
        .map(
          (point) => `
            <g>
              <circle cx="${point.x}" cy="${point.y}" r="5" fill="#0f172a" />
              <text x="${point.x}" y="${height - 8}" text-anchor="middle" class="chart-axis">#${point.row.index}</text>
              <title>快照 #${point.row.index}，累计工具调用 ${point.row.cumulativeToolCalls} 次</title>
            </g>
          `,
        )
        .join('')}
    </svg>
  `
}

const renderSummaryCards = (report: SmokeReport, rows: SnapshotRow[], uniqueToolCount: number) => {
  const latestSnapshot = rows.at(-1)
  const cards = [
    { label: '会话 ID', value: report.sessionId ?? '未知' },
    { label: '会话状态', value: report.sessionStatus ?? latestSnapshot?.sessionStatus ?? '未知' },
    { label: '执行状态', value: report.executionStatus ?? latestSnapshot?.executionStatus ?? '未知' },
    { label: '累计工具调用', value: String(report.toolCallCount ?? latestSnapshot?.cumulativeToolCalls ?? 0) },
    { label: '工具种类数', value: String(uniqueToolCount) },
    { label: '最终动作', value: report.latestAction ?? latestSnapshot?.latestAction ?? '未知' },
  ]

  return cards
    .map(
      (card) => `
        <section class="metric-card">
          <div class="metric-label">${escapeHtml(card.label)}</div>
          <div class="metric-value">${escapeHtml(card.value)}</div>
        </section>
      `,
    )
    .join('')
}

const renderSnapshotTable = (rows: SnapshotRow[]) => {
  if (rows.length === 0) {
    return '<p class="empty">未解析到任何快照记录</p>'
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>快照</th>
            <th>会话状态</th>
            <th>执行状态</th>
            <th>累计工具调用</th>
            <th>当次新增工具</th>
            <th>最新动作</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>#${row.index}</td>
                  <td>${escapeHtml(row.sessionStatus)}</td>
                  <td>${escapeHtml(row.executionStatus)}</td>
                  <td>${row.cumulativeToolCalls}</td>
                  <td>${escapeHtml(row.newTools.join('、') || '无新增')}</td>
                  <td>${escapeHtml(row.latestAction)}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `
}

const buildHtml = (input: {
  report: SmokeReport
  rows: SnapshotRow[]
  toolCounts: Array<{ name: string; count: number }>
  eventCounts: Array<{ name: string; count: number }>
  stageEvents: Array<{ label: string; detail: string }>
}) => {
  const { report, rows, toolCounts, eventCounts, stageEvents } = input
  const latestSummary = report.analysisSummary ?? '暂无分析摘要'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agentic Kernel Smoke 过程可视化</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --panel: rgba(255, 255, 255, 0.94);
      --panel-strong: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --line: #dbe4f0;
      --accent: #2563eb;
      --accent-soft: #dbeafe;
      --ok: #16a34a;
      --shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 28%),
        linear-gradient(180deg, #eef4ff 0%, var(--bg) 30%, #f8fafc 100%);
      color: var(--text);
    }

    .page {
      width: min(1360px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }

    .hero {
      padding: 28px 30px;
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 28px;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.94));
      color: #f8fafc;
      box-shadow: var(--shadow);
    }

    .hero h1 {
      margin: 0 0 10px;
      font-size: 32px;
      line-height: 1.15;
    }

    .hero p {
      margin: 0;
      max-width: 860px;
      color: rgba(241, 245, 249, 0.8);
      line-height: 1.7;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-top: 22px;
    }

    .metric-card,
    .panel {
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 22px;
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }

    .metric-card {
      min-height: 132px;
      padding: 18px 18px 16px;
    }

    .metric-label {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #cbd5e1;
    }

    .metric-value {
      margin-top: 16px;
      font-size: 22px;
      line-height: 1.45;
      font-weight: 700;
      word-break: break-word;
    }

    .section-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 18px;
      margin-top: 20px;
    }

    .panel {
      padding: 22px;
    }

    .panel h2 {
      margin: 0 0 6px;
      font-size: 20px;
    }

    .panel-subtitle {
      margin: 0 0 20px;
      color: var(--muted);
      line-height: 1.6;
    }

    .timeline {
      display: grid;
      gap: 12px;
    }

    .timeline-item {
      display: grid;
      grid-template-columns: 34px 1fr;
      gap: 14px;
      align-items: start;
    }

    .timeline-dot {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), #60a5fa);
      color: white;
      display: grid;
      place-items: center;
      font-weight: 700;
    }

    .timeline-card {
      padding: 12px 14px;
      border-radius: 16px;
      background: #f8fbff;
      border: 1px solid var(--line);
    }

    .timeline-card strong {
      display: block;
      margin-bottom: 4px;
    }

    .chart-shell {
      padding: 14px;
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(239,246,255,0.92));
      border: 1px solid var(--line);
    }

    .line-chart {
      width: 100%;
      height: auto;
      display: block;
    }

    .chart-grid {
      stroke: rgba(148, 163, 184, 0.28);
      stroke-width: 1;
    }

    .chart-axis,
    .chart-axis-line {
      fill: #64748b;
      stroke: rgba(100, 116, 139, 0.5);
      font-size: 11px;
    }

    .bar-chart {
      display: grid;
      gap: 10px;
    }

    .bar-row {
      display: grid;
      grid-template-columns: minmax(120px, 220px) 1fr 42px;
      gap: 12px;
      align-items: center;
    }

    .bar-label {
      font-size: 13px;
      color: var(--text);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .bar-track {
      height: 12px;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 999px;
    }

    .bar-value {
      font-variant-numeric: tabular-nums;
      color: var(--muted);
      text-align: right;
    }

    .summary-box {
      padding: 18px 20px;
      border-radius: 18px;
      background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
      border: 1px solid #bfdbfe;
      line-height: 1.8;
      white-space: pre-wrap;
    }

    .table-wrap {
      overflow-x: auto;
      border-radius: 18px;
      border: 1px solid var(--line);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel-strong);
    }

    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }

    th {
      background: #f8fbff;
      color: var(--muted);
      font-weight: 600;
    }

    .full-width {
      margin-top: 18px;
    }

    .empty {
      margin: 0;
      color: var(--muted);
    }

    @media (max-width: 980px) {
      .section-grid {
        grid-template-columns: 1fr;
      }

      .bar-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }

      .page {
        width: min(100% - 20px, 1360px);
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <h1>Agentic Kernel Smoke 过程可视化</h1>
      <p>基于 <code>last-run-debug.log</code> 与 <code>last-run-report.json</code> 自动生成。当前页面重点展示会话推进顺序、轮询快照演进、工具调用分布和最终分析结果，便于快速回放一次 smoke test 的全过程。</p>
      <div class="metrics">
        ${renderSummaryCards(report, rows, toolCounts.length)}
      </div>
    </section>

    <section class="section-grid">
      <section class="panel">
        <h2>阶段时间线</h2>
        <p class="panel-subtitle">按事件顺序展示本次 smoke 执行的关键节点。当前日志没有绝对时间戳，因此这里以事件顺序进行回放。</p>
        <div class="timeline">
          ${stageEvents
            .map(
              (event, index) => `
                <div class="timeline-item">
                  <div class="timeline-dot">${index + 1}</div>
                  <div class="timeline-card">
                    <strong>${escapeHtml(event.label)}</strong>
                    <div>${escapeHtml(event.detail)}</div>
                  </div>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>

      <section class="panel">
        <h2>日志事件分布</h2>
        <p class="panel-subtitle">统计不同调试事件在本次运行中出现的次数，方便判断轮询密度和过程结构。</p>
        ${buildBarChart(eventCounts, '#0f172a')}
      </section>
    </section>

    <section class="section-grid">
      <section class="panel">
        <h2>快照演进</h2>
        <p class="panel-subtitle">每个点代表一次可视化快照。纵轴是累计工具调用数，横轴是快照序号。</p>
        <div class="chart-shell">
          ${buildLineChart(rows)}
        </div>
      </section>

      <section class="panel">
        <h2>工具调用分布</h2>
        <p class="panel-subtitle">按最终完整工具链统计出现次数，能直观看出模型在规划、取节点、创建和测试流程上的重心。</p>
        ${buildBarChart(toolCounts, '#2563eb')}
      </section>
    </section>

    <section class="panel full-width">
      <h2>过程快照表</h2>
      <p class="panel-subtitle">这里列出每次轮询时观察到的状态与增量，适合定位“在哪一步开始扩展工具链”或“哪次轮询进入测试/更新阶段”。</p>
      ${renderSnapshotTable(rows)}
    </section>

    <section class="panel full-width">
      <h2>最终分析摘要</h2>
      <p class="panel-subtitle">直接展示 <code>last-run-report.json</code> 中的总结结果，方便把过程与结果一起审阅。</p>
      <div class="summary-box">${escapeHtml(latestSummary)}</div>
    </section>
  </main>
</body>
</html>`
}

const main = async () => {
  const [events, report] = await Promise.all([
    parseDebugEvents(),
    readJsonFile<SmokeReport>(REPORT_PATH),
  ])

  const rows = buildSnapshotRows(events)
  const finalToolCalls = rows.at(-1)?.toolCalls ?? []
  const { eventCounts, stageEvents } = summarizeEvents(events)
  const html = buildHtml({
    report,
    rows,
    toolCounts: countTools(finalToolCalls),
    eventCounts,
    stageEvents,
  })

  await writeFile(OUTPUT_PATH, html, 'utf8')
  console.log(`已生成可视化页面：${OUTPUT_PATH}`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : '生成可视化页面失败')
  process.exit(1)
})
