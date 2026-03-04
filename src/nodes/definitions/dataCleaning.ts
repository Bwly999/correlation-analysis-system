import type { NodeDefinition } from '../types';

export const dataCleaningNode: NodeDefinition = {
  name: 'data-cleaning',
  displayName: '数据清洗',
  icon: 'settings-2',
  category: 'action',
  description: '处理缺失值，使用 IQR 检测并剔除异常值。',
  properties: [
    {
      name: 'algo',
      displayName: '检测异常值算法',
      type: 'options',
      default: 'iqr',
      options: [
        { name: 'IQR 四分位距', value: 'iqr' },
        { name: 'Z-Score 标准差', value: 'zscore' },
        { name: '固定阈值', value: 'limit' }
      ]
    },
    {
      name: 'fillStrategy',
      displayName: '缺失值填充策略',
      type: 'options',
      default: 'mean',
      options: [
        { name: '均值填充', value: 'mean' },
        { name: '中位数填充', value: 'median' },
        { name: '零值填充', value: 'zero' }
      ]
    },
    {
      name: 'iqrK',
      displayName: 'IQR 系数 (k)',
      type: 'number',
      default: 1.5,
      description: '通常取 1.5，极端异常值取 3.0'
    }
  ],
  execute: async (input, config) => {
    // 这里实现真正的清洗算法逻辑
    console.log('Executing Data Cleaning with config:', config);
    return { ...input, cleaned: true, timestamp: Date.now() };
  }
};
