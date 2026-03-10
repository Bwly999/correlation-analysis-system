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
    {
      name: 'autoClean',
      displayName: '自动转换数字',
      type: 'boolean',
      default: true,
      description: '自动将数字字符串转换为数值，并处理 N/A、null 等特殊空值字符串',
    },
    {
      name: 'excludeFields',
      displayName: '排除字段',
      type: 'tags',
      default: [],
      displayIf: (config) => !!config.autoClean,
      placeholder: '输入字段名并按回车确认',
    },
  ],
  execute: async (input, config) => {
    const rawData = config.jsonData
    if (!rawData) throw new Error('请输入 JSON 数据内容')

    // 数据清洗工具函数
    const cleanData = (data: any[]) => {
      if (!config.autoClean || !Array.isArray(data)) return data
      
      const excludes = Array.isArray(config.excludeFields) 
        ? config.excludeFields 
        : (config.excludeFields || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      
      return data.map((row: any) => {
        if (typeof row !== 'object' || row === null) return row
        const newRow: any = { ...row }
        for (const key in newRow) {
          if (excludes.includes(key)) continue
          
          let val = newRow[key]
          if (typeof val === 'string') {
            const trimmed = val.trim()
            const nullStrings = ['n/a', 'null', 'nan', '-', '', 'undefined', 'none']
            if (nullStrings.includes(trimmed.toLowerCase())) {
              newRow[key] = null
              continue
            }
            if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
              const num = Number(trimmed)
              if (!isNaN(num)) {
                newRow[key] = num
              }
            }
          }
        }
        return newRow
      })
    }

    try {
      const parsedData = JSON.parse(rawData)
      let finalData: any[] = []
      
      if (Array.isArray(parsedData)) {
        finalData = parsedData
      } else if (parsedData && typeof parsedData === 'object') {
        if (parsedData.data && Array.isArray(parsedData.data)) {
          finalData = parsedData.data
        } else {
          finalData = [parsedData]
        }
      } else {
        throw new Error('JSON 数据必须是数组或对象格式')
      }

      const cleaned = cleanData(finalData)
      return { data: cleaned, filename: 'manual_input.json', type: 'manual' }
    } catch (err: any) {
      throw new Error(`JSON 解析失败: ${err.message}`, { cause: err })
    }
  },
}
