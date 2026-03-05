import type { NodeDefinition } from '../types';

export const dataCleaningNode: NodeDefinition = {
  name: 'data-cleaning',
  displayName: '数据清洗',
  icon: 'settings-2',
  category: 'action',
  description: '处理数据中的缺失值和异常值。',
  properties: [
    {
      name: 'missingValueStrategy',
      displayName: '缺失值处理策略',
      type: 'options',
      default: 'mean',
      options: [
        { name: '均值填充', value: 'mean' },
        { name: '中位数填充', value: 'median' },
        { name: '零值填充', value: 'zero' },
        { name: '直接删除', value: 'drop' }
      ]
    },
    {
      name: 'outlierMethod',
      displayName: '异常值检测方法',
      type: 'options',
      default: 'iqr',
      options: [
        { name: 'IQR 四分位距', value: 'iqr' },
        { name: '百分比剔除', value: 'percentile' },
        { name: '固定上下限', value: 'limit' },
        { name: '无', value: 'none' }
      ]
    },
    {
      name: 'iqrK',
      displayName: 'IQR 系数 (k)',
      type: 'number',
      default: 1.5,
      description: '通常取 1.5。'
    },
    {
      name: 'lowerLimit',
      displayName: '固定下限',
      type: 'number',
      default: 0
    },
    {
      name: 'upperLimit',
      displayName: '固定上限',
      type: 'number',
      default: 100
    }
  ],
  execute: async (input, config) => {
    if (!input || !input.data) return { message: "无输入数据" };
    console.log('Cleaning data with config:', config);
    
    // 模拟清洗逻辑
    const cleanedData = input.data.map((row: any) => {
      const newRow = { ...row };
      // 模拟逻辑...
      return newRow;
    });

    return { 
      data: cleanedData, 
      originalCount: input.data.length,
      cleanedCount: cleanedData.length,
      method: config.outlierMethod 
    };
  }
};
