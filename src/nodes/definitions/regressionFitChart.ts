type PredictionSeries = {
  actual: number[]
  predicted: number[]
}

export const buildRegressionFitChartOption = (predictions: PredictionSeries) => {
  const actual = predictions.actual
  const predicted = predictions.predicted
  const paired = actual.map((value, index) => [value, predicted[index]])
  const minValue = paired.length > 0 ? Math.min(...actual, ...predicted) : 0
  const maxValue = paired.length > 0 ? Math.max(...actual, ...predicted) : 0

  return {
    tooltip: { trigger: 'item' },
    grid: { top: 20, left: 56, right: 20, bottom: 40, containLabel: true },
    xAxis: { type: 'value', name: '实际值' },
    yAxis: { type: 'value', name: '预测值' },
    series: [
      {
        name: '样本点',
        type: 'scatter',
        data: paired,
        itemStyle: { color: '#2563eb', opacity: 0.75 },
      },
      {
        name: '理想拟合线',
        type: 'line',
        data: [
          [minValue, minValue],
          [maxValue, maxValue],
        ],
        symbol: 'none',
        lineStyle: { color: '#94a3b8', type: 'dashed' },
      },
    ],
  }
}
