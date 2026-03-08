import type { NodeDefinition } from '../types'

export const manualJsonImportNode: NodeDefinition = {
  name: 'manual-json-import',
  displayName: '手动输入数据',
  icon: 'edit-3',
  category: 'trigger',
  description: '手动输入 JSON 格式的原始数据集，支持快速调试。',
  properties: [
    {
      name: 'jsonData',
      displayName: 'JSON 数据内容',
      type: 'json',
      required: true,
      default:
        '[\n  { "f1": 10, "f2": 20, "target": 1 },\n  { "f1": 12, "f2": 18, "target": 0 }\n]',
      description: '请直接输入符合 JSON 标准的数组或对象数据',
    },
  ],
  execute: async (input, config) => {
    const rawData = config.jsonData
    if (!rawData) throw new Error('请输入 JSON 数据内容')

    try {
      const parsedData = JSON.parse(rawData)
      // 统一确保输出为包含 data 属性的对象，符合系统内部流转标准
      if (Array.isArray(parsedData)) {
        return { data: parsedData, filename: 'manual_input.json', type: 'manual' }
      } else if (parsedData && typeof parsedData === 'object') {
        // 如果输入本身就是 { data: [...] } 结构，直接返回
        if (parsedData.data && Array.isArray(parsedData.data)) {
          return { ...parsedData, filename: 'manual_input.json', type: 'manual' }
        }
        // 否则将单个对象包装进数组
        return { data: [parsedData], filename: 'manual_input.json', type: 'manual' }
      }
      throw new Error('JSON 数据必须是数组或对象格式')
    } catch (err: any) {
      throw new Error(`JSON 解析失败: ${err.message}`, { cause: err })
    }
  },
}
