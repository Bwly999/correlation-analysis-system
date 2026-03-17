export interface KanbanTreeNode {
  key: string
  label: string
  data?: Record<string, any>
  children?: KanbanTreeNode[]
}

export interface KanbanProductOption {
  name: string
  value: string
}

export interface KanbanFetchParams {
  token: string
  productName: string
  fetchMode: 'time' | 'scheme' | 'sn' | 'taskOrder'
  factorKeys: string[]
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
  getFactorTree?: (params: { token: string; productName: string }) => Promise<KanbanTreeNode[]>
  getSchemeTree?: (params: { token: string; productName: string }) => Promise<KanbanTreeNode[]>
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

const buildDefaultFactorTree = (): KanbanTreeNode[] => [
  {
    key: 'scene:all',
    label: '全场景/全场景',
    data: { nodeType: 'scene', searchText: '全场景/全场景' },
    children: [
      {
        key: 'process:涂布',
        label: '涂布',
        data: {
          nodeType: 'process',
          process: '涂布',
          searchText: '全场景/全场景 / 涂布',
        },
        children: [
          {
            key: 'factor:涂布::F_TEMP',
            label: '温度',
            data: {
              nodeType: 'factor',
              process: '涂布',
              factorKey: 'F_TEMP',
              searchText: '全场景/全场景 / 涂布 / 温度',
            },
          },
          {
            key: 'factor:涂布::F_PRESS',
            label: '压力',
            data: {
              nodeType: 'factor',
              process: '涂布',
              factorKey: 'F_PRESS',
              searchText: '全场景/全场景 / 涂布 / 压力',
            },
          },
        ],
      },
      {
        key: 'process:装配',
        label: '装配',
        data: {
          nodeType: 'process',
          process: '装配',
          searchText: '全场景/全场景 / 装配',
        },
        children: [
          {
            key: 'factor:装配::F_TORQUE',
            label: '扭矩',
            data: {
              nodeType: 'factor',
              process: '装配',
              factorKey: 'F_TORQUE',
              searchText: '全场景/全场景 / 装配 / 扭矩',
            },
          },
        ],
      },
    ],
  },
]

const buildDefaultSchemeTree = (): KanbanTreeNode[] => [
  {
    key: 'stage:V3',
    label: 'V3',
    data: { nodeType: 'stage', stage: 'V3', searchText: 'V3' },
    children: [
      {
        key: 'scheme:V3::A',
        label: 'A',
        data: { nodeType: 'scheme', stage: 'V3', scheme: 'A', searchText: 'V3 / A' },
      },
      {
        key: 'scheme:V3::B',
        label: 'B',
        data: { nodeType: 'scheme', stage: 'V3', scheme: 'B', searchText: 'V3 / B' },
      },
    ],
  },
  {
    key: 'stage:V4',
    label: 'V4',
    data: { nodeType: 'stage', stage: 'V4', searchText: 'V4' },
    children: [
      {
        key: 'scheme:V4::A',
        label: 'A',
        data: { nodeType: 'scheme', stage: 'V4', scheme: 'A', searchText: 'V4 / A' },
      },
      {
        key: 'scheme:V4::C',
        label: 'C',
        data: { nodeType: 'scheme', stage: 'V4', scheme: 'C', searchText: 'V4 / C' },
      },
    ],
  },
]

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
      params.factorKeys.forEach((factorKey, factorIndex) => {
        row[factorKey] = Number(((index + 1) * 10 + factorIndex + 0.5).toFixed(2))
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
  async getFactorTree() {
    return buildDefaultFactorTree()
  },
  async getSchemeTree() {
    return buildDefaultSchemeTree()
  },
  async fetchKanbanData(params) {
    return buildRows(params)
  },
}

let registeredBridge: KanbanDataBridge | null = null

const ensureToken = (token: string) => {
  if (!token) {
    throw new Error('未接收到宿主系统传入的访问凭证')
  }
}

const resolveBridge = (): KanbanDataBridge => {
  if (registeredBridge) return registeredBridge
  if (typeof window !== 'undefined' && window.__KANBAN_DATA_BRIDGE__) {
    return window.__KANBAN_DATA_BRIDGE__
  }
  return defaultBridge
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
  ensureToken(token)
  return (await resolveBridge().listAuthorizedProducts?.({ token })) || []
}

export const listMaterialTypes = async (token: string, productName?: string) => {
  ensureToken(token)
  return (await resolveBridge().listMaterialTypes?.({ token, productName })) || []
}

export const listTaskOrderTypes = async (token: string, productName?: string) => {
  ensureToken(token)
  return (await resolveBridge().listTaskOrderTypes?.({ token, productName })) || []
}

export const getFactorTree = async (token: string, productName: string) => {
  ensureToken(token)
  return (await resolveBridge().getFactorTree?.({ token, productName })) || []
}

export const getSchemeTree = async (token: string, productName: string) => {
  ensureToken(token)
  return (await resolveBridge().getSchemeTree?.({ token, productName })) || []
}

export const fetchKanbanData = async (params: KanbanFetchParams) => {
  ensureToken(params.token)
  return resolveBridge().fetchKanbanData(params)
}
