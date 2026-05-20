import { describe, expect, it } from 'vitest'
import { getChartStrategy } from '../strategies'

describe('chart strategy registry', () => {
  it('declares tool usage per chart type', () => {
    expect(getChartStrategy('line').getEnabledTools()).toEqual([
      'sampling',
      'filter',
      'normalization',
      'outlier',
    ])

    expect(getChartStrategy('scatter').getEnabledTools()).toEqual([
      'xField',
      'filter',
      'normalization',
    ])
    expect(getChartStrategy('bar').getEnabledTools()).toEqual([
      'xField',
      'filter',
      'normalization',
    ])
    expect(getChartStrategy('normal').getEnabledTools()).toEqual([
      'filter',
      'normalization',
      'outlier',
    ])
    expect(getChartStrategy('boxplot').getEnabledTools()).toEqual([
      'filter',
      'normalization',
      'outlier',
      'boxplotWhisker',
    ])
    expect(getChartStrategy('grouped-scatter').getEnabledTools()).toEqual(['xField', 'filter'])
    expect(getChartStrategy('grouped-bar').getEnabledTools()).toEqual(['filter'])
  })
})
