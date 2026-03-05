import type { NodeDefinition } from '../types';

export const neighborSystemNode: NodeDefinition = {
  name: 'neighbor-system',
  displayName: '相邻系统对接',
  icon: 'database',
  category: 'trigger',
  description: '从相邻系统拉取多因子数据。',
  properties: [
    {
      name: 'timeRange',
      displayName: '数据获取时间范围',
      type: 'datetime-range',
      required: true,
      isRuntimeInput: true,
      description: '指定需要回溯的数据时间段'
    },
    {
      name: 'selectedFactors',
      displayName: '选择监测因子',
      type: 'tree',
      required: true,
      description: '选择需要分析的因子（系统 -> 模块 -> 因子）',
      // 这里可以放置 Tree 数据
      default: [],
      options: [
        {
          key: 'sys_01',
          label: '生产监控系统',
          data: 'Production System',
          children: [
            {
              key: 'mod_01',
              label: '反应釜模块',
              data: 'Reactor Module',
              children: [
                { key: 'f_temp', label: '温度传感器', data: 'Temperature' },
                { key: 'f_press', label: '压力传感器', data: 'Pressure' },
                { key: 'f_level', label: '液位传感器', data: 'Level' }
              ]
            },
            {
              key: 'mod_02',
              label: '冷却模块',
              data: 'Cooling Module',
              children: [
                { key: 'f_flow', label: '流量计', data: 'Flow Rate' },
                { key: 'f_temp_out', label: '出口温度', data: 'Outlet Temp' }
              ]
            }
          ]
        },
        {
          key: 'sys_02',
          label: '能源管理系统',
          data: 'Energy System',
          children: [
            {
              key: 'mod_03',
              label: '电力分配',
              data: 'Power Distribution',
              children: [
                { key: 'f_volt', label: '电压', data: 'Voltage' },
                { key: 'f_curr', label: '电流', data: 'Current' }
              ]
            }
          ]
        }
      ]
    },
    {
      name: 'samplingRate',
      displayName: '采样频率 (秒)',
      type: 'number',
      default: 60
    }
  ],
  execute: async (input, config) => {
    // 模拟从 API 获取数据
    const factors = Object.keys(config.selectedFactors || {}).filter(k => k.startsWith('f_'));
    console.log('Fetching data for factors:', factors, 'Range:', config.timeRange);
    
    // 生成一些模拟数据
    const data = Array.from({ length: 10 }).map((_, i) => {
      const entry: any = { time: Date.now() - i * config.samplingRate * 1000 };
      factors.forEach(f => {
        entry[f] = Math.random() * 100;
      });
      return entry;
    });

    return { 
      data, 
      count: data.length,
      factors,
      range: config.timeRange 
    };
  }
};
