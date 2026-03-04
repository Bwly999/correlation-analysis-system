import type { NodeDefinition } from '../types';

export const neighborSystemNode: NodeDefinition = {
  name: 'neighbor-system',
  displayName: '相邻系统对接',
  icon: 'database',
  category: 'trigger',
  description: '从生产监控系统实时拉取选定因子的数据集。',
  properties: [
    {
      name: 'timeRange',
      displayName: '数据获取时间范围',
      type: 'datetime-range',
      required: true,
      isRuntimeInput: true, // 标记为运行时输入
      description: '指定需要回溯的数据时间段'
    },
    {
      name: 'selectedFactors',
      displayName: '选择监测因子',
      type: 'tree',
      required: true
    },
    {
      name: 'samplingRate',
      displayName: '采样频率 (秒)',
      type: 'number',
      default: 60
    }
  ],
  execute: async (input, config) => {
    console.log('Fetching data with range:', config.timeRange);
    return { 
      data: [ { temp: 25.4, press: 1.2, time: Date.now() } ], 
      range: config.timeRange 
    };
  }
};
