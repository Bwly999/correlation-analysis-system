import type { NodeDefinition } from '../types';
import Papa from 'papaparse';

export const fileImportNode: NodeDefinition = {
  name: 'file-import',
  displayName: '本地文件导入',
  icon: 'file-type',
  category: 'trigger',
  description: '从 CSV, JSON, Excel 等文件读取原始因子数据。',
  properties: [
    {
      name: 'fileData',
      displayName: '选择数据文件',
      type: 'file',
      required: true,
      isRuntimeInput: true, // 标记为运行时输入
      description: '请上传需要分析的原始数据集'
    },
    {
      name: 'format',
      displayName: '文件格式强制声明',
      type: 'options',
      default: 'auto',
      options: [
        { name: '自动识别', value: 'auto' },
        { name: 'CSV', value: 'csv' },
        { name: 'JSON', value: 'json' }
      ]
    }
  ],
  execute: async (input, config) => {
    const file = config.fileData;
    if (!file) throw new Error('未选择任何文件');

    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        complete: (results) => resolve({ data: results.data, filename: file.name }),
        error: (err) => reject(err)
      });
    });
  }
};
