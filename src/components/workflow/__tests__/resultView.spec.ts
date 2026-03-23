import { describe, expect, it } from 'vitest'
import { getResultChartOption } from '../resultView'

describe('resultView', () => {
  it('reads chart option from node result meta when payload is not a chart result', () => {
    const option = {
      xAxis: { type: 'category', data: ['A', 'B'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [1, 2] }],
    }

    const result = {
      kind: 'tableCollection',
      payload: [
        {
          name: 'Group A',
          data: [{ value: 1 }],
        },
      ],
      meta: {
        chartOption: option,
      },
    }

    expect(getResultChartOption(result)).toEqual(option)
  })
})
