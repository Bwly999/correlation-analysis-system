import { markRaw } from 'vue'
import type { NodeDefinition } from '../types'
import { createTableResult, extractTableRows, isPlainObject } from '../result'

type JsTransformConfig = {
  code?: string
}

const DEFAULT_JS_CODE = `return rows.map((row) => ({
  ...row,
}))`

const JS_TRANSFORM_DECLARATIONS = `declare const rows: Array<Record<string, unknown>>
`

const getExecutableCode = (code?: string) => {
  if (typeof code !== 'string' || !code.trim()) {
    throw new Error('请输入 JS 转换代码')
  }

  return code
}

const validateOutputRows = (value: unknown) => {
  if (!Array.isArray(value) || !value.every((row) => isPlainObject(row))) {
    throw new Error('JS代码执行节点必须返回数组对象列表')
  }

  return value as Array<Record<string, unknown>>
}

export const jsTransformNode: NodeDefinition = {
  name: 'js-transform',
  displayName: 'JS代码执行',
  icon: 'edit-3',
  category: 'action',
  description: '使用同步 JS 代码对上游表格数据做灵活转换，并输出新的表格结果。',
  properties: [
    {
      name: 'code',
      displayName: '转换代码',
      type: 'json',
      required: true,
      default: DEFAULT_JS_CODE,
      editorLanguage: 'javascript',
      editorDeclarations: JS_TRANSFORM_DECLARATIONS,
      editorHeight: '560px',
      description:
        '可用变量只有 rows。只能写同步 JS，且必须显式 return 数组对象列表。',
    },
  ],
  execute: async (input, config: JsTransformConfig) => {
    const rows = extractTableRows(input)
    if (!rows) {
      throw new Error('JS代码执行节点只支持表格数据输入')
    }

    const executableCode = getExecutableCode(config.code)

    let transformedRows: Array<Record<string, unknown>>
    try {
      const runner = new Function('rows', executableCode) as (
        rows: Array<Record<string, unknown>>,
      ) => unknown
      const executionResult = runner(markRaw(rows))

      if (
        executionResult &&
        typeof executionResult === 'object' &&
        'then' in executionResult &&
        typeof (executionResult as PromiseLike<unknown>).then === 'function'
      ) {
        throw new Error('JS代码执行节点仅支持同步代码，请不要使用 async 或 await')
      }

      transformedRows = validateOutputRows(executionResult)
    } catch (error) {
      if (error instanceof Error && error.message.includes('JS代码执行节点')) {
        throw error
      }

      throw new Error(`JS代码执行失败：${error instanceof Error ? error.message : '未知错误'}`)
    }

    return createTableResult(markRaw(transformedRows), {
      meta: {
        stats: {
          inputCount: rows.length,
          outputCount: transformedRows.length,
        },
      },
      lineage: {
        transform: 'js-transform',
      },
    })
  },
}
