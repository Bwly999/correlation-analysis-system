import type { NodeDefinition } from '../types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

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
      description: '请上传需要分析的原始数据集'
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
        { name: 'JSON', value: 'json' }
      ]
    }
  ],
  execute: async (input, config) => {
    const file = config.fileData as File;
    if (!file) throw new Error('未选择任何文件');
    
    // 增加校验：确保 file 是一个真实的文件对象
    if (!file.name || typeof file.name !== 'string') {
      throw new Error('选择的文件已失效（可能是刷新页面导致），请重新选择文件');
    }

    // 防御性处理：确保 format 始终有值
    let format = config.format || 'auto';
    if (format === 'auto') {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv') format = 'csv';
      else if (ext === 'xlsx' || ext === 'xls') format = 'xlsx';
      else if (ext === 'json') format = 'json';
      else throw new Error(`无法识别的文件格式: ${ext}`);
    }

    if (format === 'csv') {
      return new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => resolve({ data: results.data, filename: file.name, type: 'csv' }),
          error: (err) => reject(err)
        });
      });
    } else if (format === 'xlsx') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            resolve({ data: jsonData, filename: file.name, type: 'excel' });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
      });
    } else if (format === 'json') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target?.result as string);
            resolve({ data: Array.isArray(jsonData) ? jsonData : [jsonData], filename: file.name, type: 'json' });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
      });
    }

    throw new Error(`不支持的格式: ${format}`);
  }
};
