import type { ChartStrategy, ChartType } from '../types'
import { barChartStrategy } from './barChartStrategy'
import { boxplotChartStrategy } from './boxplotChartStrategy'
import { groupedBarStrategy } from './groupedBarStrategy'
import { groupedScatterStrategy } from './groupedScatterStrategy'
import { lineChartStrategy } from './lineChartStrategy'
import { normalDistributionStrategy } from './normalDistributionStrategy'
import { scatterChartStrategy } from './scatterChartStrategy'

export const chartStrategies: Record<ChartType, ChartStrategy> = {
  line: lineChartStrategy,
  scatter: scatterChartStrategy,
  bar: barChartStrategy,
  boxplot: boxplotChartStrategy,
  normal: normalDistributionStrategy,
  'grouped-scatter': groupedScatterStrategy,
  'grouped-bar': groupedBarStrategy,
}

export const getChartStrategy = (type: ChartType) => chartStrategies[type]
