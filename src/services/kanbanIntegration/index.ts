export interface KanbanTreeNode {
  key: string
  label: string
  data?: Record<string, any>
  children?: KanbanTreeNode[]
}

export interface KanbanSceneValue {
  sceneId: string
  sceneLable: string
  subSceneId: string
  subSceneLable: string
}

export interface KanbanFactorValue {
  factorKey: string
  factorName: string
  materialType: string
  processName: string
  r2Name: string
}

export interface KanbanProductOption {
  name: string
  value: string
}

export interface KanbanFactorCatalogItem {
  sceneName: string
  processName: string
  factorName: string
  factorKey: string
  materialType?: string
  r2Name?: string
}

export interface KanbanSceneCatalogItem extends KanbanSceneValue {
}

export interface KanbanSchemeCatalogItem {
  stageName: string
  schemeName: string
  schemeKey: string
}

export interface KanbanFetchParams {
  token: string
  productName: string
  fetchMode: 'time' | 'scheme' | 'sn' | 'taskOrder'
  scene?: KanbanSceneValue
  facotrs: KanbanFactorValue[]
  processList: string[]
  materialType?: string
  timeRange?: [string, string]
  schemeList?: string[]
  taskOrderType?: string
  snList?: string[]
  taskOrderList?: string[]
}

export interface KanbanFetchResult {
  rows: Array<Record<string, any>>
  metadata?: Record<string, any>
}

export interface KanbanDataBridge {
  listAuthorizedProducts?: (params: { token: string }) => Promise<KanbanProductOption[]>
  listMaterialTypes?: (params: { token: string; productName?: string }) => Promise<KanbanProductOption[]>
  listTaskOrderTypes?: (params: { token: string; productName?: string }) => Promise<KanbanProductOption[]>
  listScene?: (params: {
    token: string
    productName: string
  }) => Promise<KanbanSceneCatalogItem[]>
  listFactorCatalog?: (params: {
    token: string
    productName: string
    scene?: KanbanSceneValue
  }) => Promise<KanbanFactorCatalogItem[]>
  listSchemeCatalog?: (params: {
    token: string
    productName: string
  }) => Promise<KanbanSchemeCatalogItem[]>
  fetchKanbanData: (params: KanbanFetchParams) => Promise<KanbanFetchResult>
}

declare global {
  interface Window {
    __KANBAN_DATA_BRIDGE__?: KanbanDataBridge
  }
}

const HOST_TOKEN_EVENT_TYPES = new Set([
  'KANBAN_HOST_AUTH_TOKEN',
  'kanban-host-auth-token',
  'KANBAN_DATA_TOKEN',
])

let authToken = ''
let hasInitializedHostBridge = false
const MOCK_AUTH_TOKEN = '__mock_kanban_token__'

const defaultProducts: KanbanProductOption[] = [
  { name: '试制产品 A1', value: '试制产品 A1' },
  { name: '量产产品 B2', value: '量产产品 B2' },
]

const defaultMaterialTypes: KanbanProductOption[] = [
  { name: '正极', value: '正极' },
  { name: '负极', value: '负极' },
  { name: '壳体', value: '壳体' },
]

const defaultTaskOrderTypes: KanbanProductOption[] = [
  { name: '试制任务令', value: '试制任务令' },
  { name: '量产任务令', value: '量产任务令' },
]

const createMockFactor = (
  processName: string,
  factorName: string,
  factorKey: string,
  materialType = '正极',
): KanbanFactorCatalogItem => ({
  sceneName: '全场景/全场景',
  processName,
  factorName,
  factorKey,
  materialType,
  r2Name: `R2-${factorKey}`,
})

const defaultFactorCatalog: KanbanFactorCatalogItem[] = ([
  ['涂布', '涂布速度', 'COATING_SPEED', '正极'],
  ['涂布', '涂布温度', 'COATING_TEMP', '正极'],
  ['涂布', '涂布面密度', 'COATING_AREAL_DENSITY', '正极'],
  ['涂布', '涂布张力', 'COATING_TENSION', '正极'],
  ['涂布', '烘箱风速', 'OVEN_AIR_SPEED', '正极'],
  ['辊压', '辊压压力', 'CALENDER_PRESSURE', '正极'],
  ['辊压', '辊缝', 'CALENDER_GAP', '正极'],
  ['辊压', '辊压速度', 'CALENDER_SPEED', '正极'],
  ['辊压', '压实密度', 'COMPACTION_DENSITY', '正极'],
  ['辊压', '极片厚度', 'ELECTRODE_THICKNESS', '正极'],
  ['分切', '分切宽度', 'SLITTING_WIDTH', '正极'],
  ['分切', '分切速度', 'SLITTING_SPEED', '正极'],
  ['分切', '毛刺高度', 'BURR_HEIGHT', '正极'],
  ['分切', '边缘缺陷数', 'EDGE_DEFECT_COUNT', '正极'],
  ['卷绕', '卷绕张力', 'WINDING_TENSION', '正极'],
  ['卷绕', '卷绕速度', 'WINDING_SPEED', '正极'],
  ['卷绕', '对齐偏差', 'ALIGNMENT_OFFSET', '正极'],
  ['卷绕', '卷芯直径', 'JELLY_ROLL_DIAMETER', '正极'],
  ['装配', '入壳压力', 'ASSEMBLY_INSERT_PRESSURE', '壳体'],
  ['装配', '焊接能量', 'WELDING_ENERGY', '壳体'],
  ['装配', '焊接时间', 'WELDING_TIME', '壳体'],
  ['装配', '封口压力', 'SEALING_PRESSURE', '壳体'],
  ['装配', '装配扭矩', 'ASSEMBLY_TORQUE', '壳体'],
  ['注液', '注液量', 'INJECTION_VOLUME', '电解液'],
  ['注液', '注液时间', 'INJECTION_TIME', '电解液'],
  ['注液', '真空保持时间', 'VACUUM_HOLD_TIME', '电解液'],
  ['注液', '静置时长', 'SOAKING_DURATION', '电解液'],
  ['化成', '化成电流', 'FORMATION_CURRENT', '电芯'],
  ['化成', '化成电压', 'FORMATION_VOLTAGE', '电芯'],
  ['化成', '化成温度', 'FORMATION_TEMP', '电芯'],
  ['化成', '化成容量', 'FORMATION_CAPACITY', '电芯'],
  ['化成', '压降', 'VOLTAGE_DROP', '电芯'],
  ['分容', '分容容量', 'GRADING_CAPACITY', '电芯'],
  ['分容', '分容内阻', 'GRADING_RESISTANCE', '电芯'],
  ['分容', '分容能量', 'GRADING_ENERGY', '电芯'],
  ['分容', 'OCV', 'GRADING_OCV', '电芯'],
  ['PACK', '模组电压', 'PACK_MODULE_VOLTAGE', 'PACK'],
  ['PACK', '模组内阻', 'PACK_MODULE_RESISTANCE', 'PACK'],
  ['PACK', '均衡压差', 'PACK_BALANCE_DELTA', 'PACK'],
  ['PACK', 'EOL 容量', 'PACK_EOL_CAPACITY', 'PACK'],
] satisfies Array<[string, string, string, string]>).map(
  ([processName, factorName, factorKey, materialType]) =>
    createMockFactor(processName, factorName, factorKey, materialType),
)

const defaultSceneCatalog: KanbanSceneCatalogItem[] = [
  {
    sceneId: 'scene-all',
    sceneLable: '全场景',
    subSceneId: 'sub-scene-all',
    subSceneLable: '全场景',
  },
]

const defaultSchemeCatalog: KanbanSchemeCatalogItem[] = [
  { stageName: 'V3', schemeName: 'A', schemeKey: 'V3::A' },
  { stageName: 'V3', schemeName: 'B', schemeKey: 'V3::B' },
  { stageName: 'V4', schemeName: 'A', schemeKey: 'V4::A' },
  { stageName: 'V4', schemeName: 'C', schemeKey: 'V4::C' },
]

const sortByLocale = <T>(items: T[], getLabel: (item: T) => string) =>
  [...items].sort((left, right) => getLabel(left).localeCompare(getLabel(right), 'zh-CN'))

const buildFactorTree = (catalog: KanbanFactorCatalogItem[]): KanbanTreeNode[] => {
  const processMap = new Map<
    string,
    Array<{
      sceneName: string
      factorName: string
      factorKey: string
      materialType: string
      r2Name: string
    }>
  >()

  catalog.forEach((item) => {
    const sceneName = item.sceneName || '未命名场景'
    const processName = item.processName || '未命名工序'
    const factorName = item.factorName || item.factorKey

    const factors = processMap.get(processName) ?? []

    factors.push({
      sceneName,
      factorName,
      factorKey: item.factorKey,
      materialType: item.materialType || '',
      r2Name: item.r2Name || '',
    })

    processMap.set(processName, factors)
  })

  return sortByLocale(Array.from(processMap.entries()), ([processName]) => processName).map(
    ([processName, factors]) => ({
      key: `process:${processName}`,
      label: processName,
      data: {
        nodeType: 'process',
        sceneName: factors[0]?.sceneName || '未命名场景',
        process: processName,
        searchText: `${factors[0]?.sceneName || '未命名场景'} / ${processName}`,
      },
      children: sortByLocale(factors, (item) => item.factorName).map((factor) => ({
        key: `factor:${processName}::${factor.factorKey}`,
        label: factor.factorName,
        data: {
          nodeType: 'factor',
          sceneName: factor.sceneName,
          process: processName,
          factorKey: factor.factorKey,
          value: {
            factorKey: factor.factorKey,
            factorName: factor.factorName,
            materialType: factor.materialType || '',
            processName,
            r2Name: factor.r2Name || '',
          } satisfies KanbanFactorValue,
          searchText: `${factor.sceneName} / ${processName} / ${factor.factorName}`,
        },
      })),
    }),
  )
}

const buildSceneTree = (catalog: KanbanSceneCatalogItem[]): KanbanTreeNode[] => {
  const sceneMap = new Map<string, KanbanSceneCatalogItem[]>()

  catalog.forEach((item) => {
    const sceneId = item.sceneId || 'scene-unknown'
    const sceneItems = sceneMap.get(sceneId) ?? []
    sceneItems.push(item)
    sceneMap.set(sceneId, sceneItems)
  })

  return sortByLocale(Array.from(sceneMap.entries()), ([, items]) => items[0]?.sceneLable || '').map(
    ([sceneId, items]) => ({
      key: `scene:${sceneId}`,
      label: items[0]?.sceneLable || '未命名场景',
      data: {
        nodeType: 'scene',
        sceneId,
        sceneLable: items[0]?.sceneLable || '未命名场景',
        searchText: items[0]?.sceneLable || '未命名场景',
      },
      children: sortByLocale(items, (item) => item.subSceneLable || '').map((item) => ({
        key: `sub-scene:${sceneId}::${item.subSceneId}`,
        label: item.subSceneLable || '未命名子场景',
        data: {
          nodeType: 'sub-scene',
          sceneId,
          sceneLable: item.sceneLable,
          subSceneId: item.subSceneId,
          subSceneLable: item.subSceneLable,
          value: {
            sceneId,
            sceneLable: item.sceneLable,
            subSceneId: item.subSceneId,
            subSceneLable: item.subSceneLable,
          } satisfies KanbanSceneValue,
          searchText: `${item.sceneLable} / ${item.subSceneLable}`,
        },
      })),
    }),
  )
}

const buildSchemeTree = (catalog: KanbanSchemeCatalogItem[]): KanbanTreeNode[] => {
  const stageMap = new Map<string, KanbanSchemeCatalogItem[]>()

  catalog.forEach((item) => {
    const stageName = item.stageName || '未命名阶段'
    const schemes = stageMap.get(stageName) ?? []
    schemes.push(item)
    stageMap.set(stageName, schemes)
  })

  return sortByLocale(Array.from(stageMap.entries()), ([stageName]) => stageName).map(
    ([stageName, schemes]) => ({
      key: `stage:${stageName}`,
      label: stageName,
      data: { nodeType: 'stage', stage: stageName, searchText: stageName },
      children: sortByLocale(schemes, (item) => item.schemeName).map((scheme) => ({
        key: `scheme:${scheme.schemeKey}`,
        label: scheme.schemeName,
        data: {
          nodeType: 'scheme',
          stage: stageName,
          scheme: scheme.schemeName,
          schemeKey: scheme.schemeKey,
          searchText: `${stageName} / ${scheme.schemeName}`,
        },
      })),
    }),
  )
}

const buildRows = (params: KanbanFetchParams): KanbanFetchResult => {
  const snList =
    params.snList && params.snList.length > 0
      ? params.snList
      : params.fetchMode === 'taskOrder'
        ? params.taskOrderList?.map((item, index) => `TASK_SN_${index + 1}_${item}`) || []
        : params.fetchMode === 'scheme'
          ? params.schemeList?.map((item, index) => `SCHEME_SN_${index + 1}_${item}`) || []
          : ['SN_DEMO_001', 'SN_DEMO_002']

  return {
    rows: snList.map((sn, index) => {
      const row: Record<string, any> = {
        sn,
        productName: params.productName,
        collectedAt: `2026-03-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
      }
      params.facotrs.forEach((factor, factorIndex) => {
        row[factor.factorKey] = Number(((index + 1) * 10 + factorIndex + 0.5).toFixed(2))
      })
      return row
    }),
    metadata: {
      totalSn: snList.length,
      mode: params.fetchMode,
      mocked: true,
    },
  }
}

const defaultBridge: KanbanDataBridge = {
  async listAuthorizedProducts() {
    return defaultProducts
  },
  async listMaterialTypes() {
    return defaultMaterialTypes
  },
  async listTaskOrderTypes() {
    return defaultTaskOrderTypes
  },
  async listScene() {
    return defaultSceneCatalog
  },
  async listFactorCatalog() {
    return defaultFactorCatalog
  },
  async listSchemeCatalog() {
    return defaultSchemeCatalog
  },
  async fetchKanbanData(params) {
    return buildRows(params)
  },
}

let registeredBridge: KanbanDataBridge | null = null

const resolveBridge = (): KanbanDataBridge => {
  if (registeredBridge) return registeredBridge
  if (typeof window !== 'undefined' && window.__KANBAN_DATA_BRIDGE__) {
    return window.__KANBAN_DATA_BRIDGE__
  }
  return defaultBridge
}

const resolveAccessToken = (token?: string) => {
  if (token) return token
  if (resolveBridge() === defaultBridge) return MOCK_AUTH_TOKEN
  throw new Error('未接收到宿主系统传入的访问凭证')
}

const readTokenFromPayload = (payload: any): string => {
  if (!payload) return ''
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload)
      return readTokenFromPayload(parsed)
    } catch {
      return ''
    }
  }
  if (typeof payload.token === 'string') return payload.token
  if (typeof payload.accessToken === 'string') return payload.accessToken
  if (payload.payload) return readTokenFromPayload(payload.payload)
  if (payload.data) return readTokenFromPayload(payload.data)
  return ''
}

const handleHostTokenPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return

  const explicitType = typeof payload.type === 'string' ? payload.type : ''
  const channel = typeof payload.channel === 'string' ? payload.channel : ''
  const token = readTokenFromPayload(payload)

  if (!token) return
  if (HOST_TOKEN_EVENT_TYPES.has(explicitType) || channel === 'kanban-data-bridge') {
    authToken = token
  }
}

export const setKanbanAuthToken = (token: string) => {
  authToken = token || ''
}

export const getKanbanAuthToken = () => authToken

export const getResolvedKanbanAuthToken = () => resolveAccessToken(authToken)

export const registerKanbanDataBridge = (bridge: KanbanDataBridge | null) => {
  registeredBridge = bridge
}

export const initializeKanbanHostBridge = (target: Window = window) => {
  if (hasInitializedHostBridge) return

  target.addEventListener('message', (event: MessageEvent) => {
    handleHostTokenPayload(event.data)
  })
  target.addEventListener('kanban-host-auth-token', (event: Event) => {
    handleHostTokenPayload((event as CustomEvent).detail)
  })

  hasInitializedHostBridge = true
}

export const listAuthorizedProducts = async (token: string) => {
  const resolvedToken = resolveAccessToken(token)
  return (await resolveBridge().listAuthorizedProducts?.({ token: resolvedToken })) || []
}

export const listMaterialTypes = async (token: string, productName?: string) => {
  const resolvedToken = resolveAccessToken(token)
  return (await resolveBridge().listMaterialTypes?.({ token: resolvedToken, productName })) || []
}

export const listTaskOrderTypes = async (token: string, productName?: string) => {
  const resolvedToken = resolveAccessToken(token)
  return (await resolveBridge().listTaskOrderTypes?.({ token: resolvedToken, productName })) || []
}

export const listScene = async (token: string, productName: string) => {
  const resolvedToken = resolveAccessToken(token)
  return (await resolveBridge().listScene?.({ token: resolvedToken, productName })) || []
}

export const getSceneTree = async (token: string, productName: string) => {
  const catalog = await listScene(token, productName)
  return buildSceneTree(catalog)
}

export const listFactorCatalog = async (
  token: string,
  productName: string,
  scene?: KanbanSceneValue,
) => {
  const resolvedToken = resolveAccessToken(token)
  return (
    (await resolveBridge().listFactorCatalog?.({ token: resolvedToken, productName, scene })) || []
  )
}

export const getFactorTree = async (token: string, productName: string, scene?: KanbanSceneValue) => {
  const catalog = await listFactorCatalog(token, productName, scene)
  return buildFactorTree(catalog)
}

export const listProcessOptions = async (
  token: string,
  productName: string,
  scene?: KanbanSceneValue,
) => {
  if (!productName && resolveBridge() !== defaultBridge) return []

  const catalog = await listFactorCatalog(token, productName, scene)
  return sortByLocale(
    Array.from(new Set(catalog.map((item) => item.processName).filter(Boolean))),
    (item) => item,
  ).map((processName) => ({
    name: processName,
    value: processName,
  }))
}

export const listSchemeCatalog = async (token: string, productName: string) => {
  const resolvedToken = resolveAccessToken(token)
  return (await resolveBridge().listSchemeCatalog?.({ token: resolvedToken, productName })) || []
}

export const getSchemeTree = async (token: string, productName: string) => {
  const catalog = await listSchemeCatalog(token, productName)
  return buildSchemeTree(catalog)
}

export const fetchKanbanData = async (params: KanbanFetchParams) => {
  const resolvedToken = resolveAccessToken(params.token)
  return resolveBridge().fetchKanbanData({
    ...params,
    token: resolvedToken,
  })
}
