import type { NodeDefinition } from '../types'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { createTableResult } from '../result'

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
      isRuntimeInput: true,
      description: '请上传需要分析的原始数据集',
    },
    {
      name: 'format',
      displayName: '文件格式',
      type: 'options',
      default: 'auto',
      options: [
        { name: '自动识别', value: 'auto' },
        { name: 'CSV', value: 'csv' },
        { name: 'Excel', value: 'xlsx' },
        { name: 'JSON', value: 'json' },
      ],
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
      type: 'tags', // 使用标签类型，更适合多选操作
      default: [],
      placeholder: '输入字段名并按回车确认',
      displayIf: (config) => !!config.autoClean,
      description: '这些字段的内容将保持原始字符串格式，不进行数值转换',
    },
  ],
  execute: async (input, config) => {
    const file = config.fileData as File
    if (!file) throw new Error('未选择任何文件')

    // 数据清洗工具函数
    const cleanData = (data: any[]) => {
      if (!config.autoClean || !Array.isArray(data)) return data

      const excludes = Array.isArray(config.excludeFields)
        ? config.excludeFields
        : (config.excludeFields || '')
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)

      return data.map((row: any) => {
        if (typeof row !== 'object' || row === null) return row
        const newRow: any = { ...row }
        for (const key in newRow) {
          if (excludes.includes(key)) continue

          const val = newRow[key]
          if (typeof val === 'string') {
            const trimmed = val.trim()
            // 1. 处理特殊空值占位符
            const nullStrings = ['n/a', 'null', 'nan', '-', '', 'undefined', 'none']
            if (nullStrings.includes(trimmed.toLowerCase())) {
              newRow[key] = null
              continue
            }

            // 2. 尝试转换为数字 (仅当转换后不是 NaN 且转换前后一致，或者本身就是合法的数字格式)
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

    // 增加校验：确保 file 是一个真实的文件对象
    if (!file.name || typeof file.name !== 'string') {
      throw new Error('选择的文件已失效（可能是刷新页面导致），请重新选择文件')
    }

    // 防御性处理：确保 format 始终有值
    let format = config.format || 'auto'
    if (format === 'auto') {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'csv') format = 'csv'
      else if (ext === 'xlsx' || ext === 'xls') format = 'xlsx'
      else if (ext === 'json') format = 'json'
      else throw new Error(`无法识别的文件格式: ${ext}`)
    }

    if (format === 'csv') {
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const cleaned = cleanData(results.data)
            resolve(
              createTableResult(cleaned, {
                meta: {
                  filename: file.name,
                  sourceType: 'csv',
                },
              }),
            )
          },
          error: (err) => reject(err),
        })
      })
    } else if (format === 'xlsx') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            const firstSheetName = workbook.SheetNames[0]
            if (!firstSheetName) {
              throw new Error('Excel 文件中未找到可读取的工作表')
            }
            const worksheet = workbook.Sheets[firstSheetName]
            if (!worksheet) {
              throw new Error(`Excel 工作表 ${firstSheetName} 读取失败`)
            }
            const jsonData = XLSX.utils.sheet_to_json(worksheet)
            const cleaned = cleanData(jsonData as any[])
            resolve(
              createTableResult(cleaned, {
                meta: {
                  filename: file.name,
                  sourceType: 'excel',
                },
              }),
            )
          } catch (err) {
            reject(err)
          }
        }
        reader.onerror = (err) => reject(err)
        reader.readAsArrayBuffer(file)
      })
    } else if (format === 'json') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target?.result as string)
            const arrayData = Array.isArray(jsonData) ? jsonData : [jsonData]
            const cleaned = cleanData(arrayData)
            resolve({
              ...createTableResult(cleaned, {
                meta: {
                  filename: file.name,
                  sourceType: 'json',
                },
              }),
            })
          } catch (err) {
            reject(err)
          }
        }
        reader.onerror = (err) => reject(err)
        reader.readAsText(file)
      })
    }

    throw new Error(`不支持的格式: ${format}`)
  },
}
