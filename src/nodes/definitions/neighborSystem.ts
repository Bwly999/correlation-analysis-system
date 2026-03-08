import type { NodeDefinition } from '../types'

export const neighborSystemNode: NodeDefinition = {
  name: 'neighbor-system',
  displayName: '相邻系统对接',
  icon: 'database',
  category: 'trigger',
  description: '从相邻系统拉取多因子数据。支持按时间、方案或 SN 集合进行筛选。',
  properties: [
    {
      name: 'fetchMode',
      displayName: '数据获取模式',
      type: 'options',
      default: 'time',
      options: [
        { name: '按时间范围', value: 'time' },
        { name: '按方案 (Scheme)', value: 'scheme' },
        { name: '按 SN 集合', value: 'sn' },
      ],
    },
    {
      name: 'timeRange',
      displayName: '时间范围',
      type: 'datetime-range',
      isRuntimeInput: true,
      description: '仅在模式为“按时间范围”时生效',
      displayIf: (config) => config.fetchMode === 'time',
    },
    {
      name: 'schemeId',
      displayName: '选择方案',
      type: 'options',
      default: '',
      options: [
        { name: '方案 A (高精度)', value: 'sch_a' },
        { name: '方案 B (快速扫描)', value: 'sch_b' },
      ],
      displayIf: (config) => config.fetchMode === 'scheme',
    },
    {
      name: 'snList',
      displayName: 'SN 序列号集合',
      type: 'string',
      default: '',
      placeholder: '请输入 SN，多个以逗号分隔',
      description: '仅在模式为“按 SN 集合”时生效',
      displayIf: (config) => config.fetchMode === 'sn',
    },
    {
      name: 'selectedFactors',
      displayName: '选择监测因子',
      type: 'tree',
      required: true,
      description: '选择需要分析的因子（系统 -> 模块 -> 因子）',
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
                { key: 'f_level', label: '液位传感器', data: 'Level' },
              ],
            },
          ],
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
                { key: 'f_curr', label: '电流', data: 'Current' },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'samplingRate',
      displayName: '采样频率 (秒)',
      type: 'number',
      default: 60,
    },
  ],
  execute: async (input, config) => {
    // 模拟从 API 获取数据
    const factors = Object.keys(config.selectedFactors || {}).filter((k) => k.startsWith('f_'))
    console.log('Fetching data for factors:', factors, 'Mode:', config.fetchMode)

    // 生成一些模拟数据
    const data = Array.from({ length: 15 }).map((_, i) => {
      const entry: any = {
        time: Date.now() - i * (config.samplingRate || 60) * 1000,
        sn: `SN_${1000 + i}`,
      }
      factors.forEach((f) => {
        entry[f] = 20 + Math.random() * 80
      })
      return entry
    })

    return {
      data,
      count: data.length,
      mode: config.fetchMode,
      factors,
      range: config.timeRange,
    }
  },
}
