import type { NodeDefinition } from '../types'
import {
  fetchKanbanData,
  getFactorTree,
  getSceneTree,
  getResolvedKanbanAuthToken,
  getSchemeTree,
  type KanbanFactorValue,
  type KanbanSceneValue,
  listAuthorizedProducts,
  listMaterialTypes,
  listProcessOptions,
  listTaskOrderTypes,
} from '@/services/kanbanIntegration'
import { createTableResult } from '../result'

const FACTOR_KEY_PREFIX = 'factor:'
const SCHEME_KEY_PREFIX = 'scheme:'

type LegacyTreeSelectionState = Record<string, { checked?: boolean }>

interface TreeModelValue {
  selectedKeys?: string[]
  values?: unknown[]
}

const parseDelimitedList = (value: string) =>
  (value || '')
    .split(/[\n,\uff0c]/)
    .map((item) => item.trim())
    .filter(Boolean)

const extractCheckedLeafKeys = (
  selection: Record<string, { checked?: boolean }> | undefined,
  prefix: string,
) =>
  Object.entries(selection || {})
    .filter(([key, state]) => Boolean(state?.checked) && key.startsWith(prefix))
    .map(([key]) => key)

const isLegacyTreeSelectionState = (value: unknown): value is LegacyTreeSelectionState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).some((item) => item && typeof item === 'object' && 'checked' in item)
}

const getSelectedKeys = (selection: unknown) => {
  if (isLegacyTreeSelectionState(selection)) {
    return extractCheckedLeafKeys(selection, '')
  }

  const selectedKeys = (selection as TreeModelValue | undefined)?.selectedKeys
  return Array.isArray(selectedKeys) ? selectedKeys.filter((item): item is string => Boolean(item)) : []
}

const parseFactorSelections = (selection: unknown) => {
  const wrappedValues = (selection as { values?: KanbanFactorValue[] } | undefined)?.values
  if (Array.isArray(wrappedValues) && wrappedValues.length > 0) {
    const factorValues = wrappedValues.filter((item) => Boolean(item?.factorKey))

    return {
      factorKeys: factorValues.map((item) => item.factorKey),
      factorValues,
    }
  }

  const factorSelections = getSelectedKeys(selection).filter((key) => key.startsWith(FACTOR_KEY_PREFIX))

  return {
    factorKeys: factorSelections
      .map((key) => {
        const segments = key.slice(FACTOR_KEY_PREFIX.length).split('::')
        return segments[segments.length - 1]
      })
      .filter((value): value is string => Boolean(value)),
    factorValues: factorSelections
      .map((key) => {
        const segments = key.slice(FACTOR_KEY_PREFIX.length).split('::')
        const processName = segments[0] || ''
        const factorKey = segments[segments.length - 1] || ''

        if (!factorKey) return null

        return {
          factorKey,
          factorName: factorKey,
          materialType: '',
          processName,
          r2Name: '',
        } satisfies KanbanFactorValue
      })
      .filter((value): value is KanbanFactorValue => Boolean(value)),
  }
}

const parseSceneSelection = (selection: unknown): KanbanSceneValue | undefined => {
  const wrappedValues = (selection as TreeModelValue | undefined)?.values
  const value =
    (Array.isArray(wrappedValues) ? wrappedValues[0] : undefined) ??
    (selection as { value?: KanbanSceneValue } | undefined)?.value
  if (!value || typeof value !== 'object') return undefined
  const sceneValue = value as KanbanSceneValue
  if (!sceneValue.sceneId || !sceneValue.subSceneId) return undefined
  return sceneValue
}

const parseSchemeSelections = (selection: unknown) =>
  getSelectedKeys(selection)
    .filter((key) => key.startsWith(SCHEME_KEY_PREFIX))
    .map((key) =>
    key.slice(SCHEME_KEY_PREFIX.length),
  )

const ensureDateRange = (value: Date[] | undefined) => {
  if (!Array.isArray(value) || value.length < 2 || !value[0] || !value[1]) {
    throw new Error('请选择完整的查询日期范围')
  }

  return [value[0].toISOString(), value[1].toISOString()] as [string, string]
}

const parseProcessSelections = (value: string[] | undefined) =>
  Array.from(new Set((value || []).map((item) => item.trim()).filter(Boolean)))

const ensureToken = () => {
  return getResolvedKanbanAuthToken()
}

export const neighborSystemNode: NodeDefinition = {
  name: 'neighbor-system',
  displayName: '看板数据对接',
  icon: 'database',
  category: 'trigger',
  description:
    '通过中间层对接宿主看板系统，按时间、方案、SN 或任务令拉取 SN，再统一查询因子明细数据。',
  properties: [
    {
      name: 'productName',
      displayName: '产品名称',
      type: 'options',
      default: '',
      required: true,
      placeholder: '请选择产品名称',
      resolveOptions: async () => listAuthorizedProducts(ensureToken()),
    },
    {
      name: 'sceneSelection',
      displayName: '场景选择',
      type: 'tree',
      required: true,
      default: {},
      treeViewport: 'sm',
      singleSelect: true,
      filterable: true,
      placeholder: '搜索场景 / 子场景',
      emptyMessage: '请先选择产品名称',
      dependencies: ['productName'],
      resolveOptions: async ({ config }) => {
        if (!config.productName) return []
        return getSceneTree(ensureToken(), config.productName)
      },
    },
    {
      name: 'selectedFactors',
      displayName: '因子全集',
      type: 'tree',
      required: true,
      default: {},
      filterable: true,
      placeholder: '搜索场景 / 工序 / 因子名称',
      emptyMessage: '请先选择产品名称和场景',
      dependencies: ['productName', 'sceneSelection'],
      resolveOptions: async ({ config }) => {
        const scene = parseSceneSelection(config.sceneSelection)
        if (!config.productName || !scene) return []
        return getFactorTree(ensureToken(), config.productName, scene)
      },
    },
    {
      name: 'fetchMode',
      displayName: '启动方式',
      type: 'select-button',
      default: 'time',
      isRuntimeInput: true,
      options: [
        { name: '按时间查询', value: 'time' },
        { name: '按方案查询', value: 'scheme' },
        { name: '按 SN 查询', value: 'sn' },
        { name: '按任务令查询', value: 'taskOrder' },
      ],
    },
    {
      name: 'timeRange',
      displayName: '查询日期',
      type: 'datetime-range',
      default: null,
      required: true,
      isRuntimeInput: true,
      dateOnly: true,
      description: '最小粒度到天，按时间段查询 SN 列表。',
      displayIf: (config) => config.fetchMode === 'time',
    },
    {
      name: 'materialType',
      displayName: '物料类型',
      type: 'options',
      default: '',
      required: true,
      isRuntimeInput: true,
      editable: true,
      placeholder: '请选择或输入物料类型',
      dependencies: ['productName'],
      resolveOptions: async ({ config }) => listMaterialTypes(ensureToken(), config.productName),
      displayIf: (config) => config.fetchMode === 'time',
    },
    {
      name: 'schemeSelection',
      displayName: '阶段方案',
      type: 'tree',
      default: {},
      required: true,
      isRuntimeInput: true,
      filterable: true,
      placeholder: '搜索阶段 / 方案',
      emptyMessage: '请先选择产品名称',
      dependencies: ['productName'],
      resolveOptions: async ({ config }) => {
        if (!config.productName) return []
        return getSchemeTree(ensureToken(), config.productName)
      },
      displayIf: (config) => config.fetchMode === 'scheme',
    },
    {
      name: 'taskOrderType',
      displayName: '任务令类型',
      type: 'options',
      default: '',
      required: true,
      isRuntimeInput: true,
      editable: true,
      placeholder: '请选择或输入任务令类型',
      dependencies: ['productName'],
      resolveOptions: async ({ config }) => listTaskOrderTypes(ensureToken(), config.productName),
      displayIf: (config) => config.fetchMode === 'scheme',
    },
    {
      name: 'snList',
      displayName: 'SN 列表',
      type: 'textarea',
      default: '',
      required: true,
      isRuntimeInput: true,
      placeholder: '请输入 SN，支持换行、英文逗号或中文逗号分隔',
      textareaImport: {
        kind: 'file-column',
        valueLabel: 'SN',
        defaultDeduplicate: true,
      },
      displayIf: (config) => config.fetchMode === 'sn',
    },
    {
      name: 'taskOrderList',
      displayName: '任务令列表',
      type: 'textarea',
      default: '',
      required: true,
      isRuntimeInput: true,
      placeholder: '请输入任务令，支持换行、英文逗号或中文逗号分隔',
      displayIf: (config) => config.fetchMode === 'taskOrder',
    },
    {
      name: 'selectedProcesses',
      displayName: '工序',
      type: 'multi-options',
      default: [],
      required: true,
      isRuntimeInput: true,
      placeholder: '请选择工序',
      autoSelectAllOnOptionsChange: true,
      dependencies: ['productName'],
      description: '四种启动方式都会按这里选择的工序范围查询 SN 与因子数据。',
      resolveOptions: async ({ config }) => {
        return listProcessOptions(ensureToken(), config.productName || '')
      },
    },
  ],
  execute: async (_input, config) => {
    const token = ensureToken()

    if (!config.productName) {
      throw new Error('请选择产品名称')
    }

    const scene = parseSceneSelection(config.sceneSelection)
    if (!scene) {
      throw new Error('请选择场景')
    }

    const { factorKeys, factorValues } = parseFactorSelections(config.selectedFactors)
    if (factorKeys.length === 0) {
      throw new Error('请至少选择一个因子进行获取')
    }
    const processList = parseProcessSelections(config.selectedProcesses)
    if (processList.length === 0) {
      throw new Error('请至少选择一个工序')
    }

    let snList: string[] | undefined
    let schemeList: string[] | undefined
    let timeRange: [string, string] | undefined
    let taskOrderList: string[] | undefined

    if (config.fetchMode === 'time') {
      timeRange = ensureDateRange(config.timeRange)
      if (!config.materialType) {
        throw new Error('请选择物料类型')
      }
    }

    if (config.fetchMode === 'scheme') {
      schemeList = parseSchemeSelections(config.schemeSelection)
      if (schemeList.length === 0) {
        throw new Error('请至少选择一个阶段方案')
      }
      if (!config.taskOrderType) {
        throw new Error('请选择任务令类型')
      }
    }

    if (config.fetchMode === 'sn') {
      snList = parseDelimitedList(config.snList)
      if (snList.length === 0) {
        throw new Error('请输入至少一个 SN')
      }
    }

    if (config.fetchMode === 'taskOrder') {
      taskOrderList = parseDelimitedList(config.taskOrderList)
      if (taskOrderList.length === 0) {
        throw new Error('请输入至少一个任务令')
      }
    }

    const result = await fetchKanbanData({
      token,
      productName: config.productName,
      fetchMode: config.fetchMode,
      scene,
      facotrs: factorValues,
      processList,
      materialType: config.materialType,
      timeRange,
      schemeList,
      taskOrderType: config.taskOrderType,
      snList,
      taskOrderList,
    })

    return createTableResult(result.rows, {
      meta: {
        filename: 'neighbor-system',
        sourceType: 'kanban',
        metadata: {
          total_sn: result.metadata?.totalSn ?? result.rows.length,
          factors_count: factorKeys.length,
          product: config.productName,
          scene,
          fetch_mode: config.fetchMode,
          process_list: processList,
          ...result.metadata,
        },
      },
    })
  },
}
