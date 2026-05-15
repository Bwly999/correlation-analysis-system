import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorkflowStore } from '../../stores/workflowStore'
import { WorkflowApi } from '../workflowApi'

describe('WorkflowApi', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('addNode', () => {
    it('应通过节点类型名称创建节点并返回包含 id 的节点对象', () => {
      const node = WorkflowApi.addNode('manual-json-import', '测试输入节点')

      expect(node).toBeDefined()
      expect(node.id).toBeTruthy()
      // Vue Flow 渲染类型为 'custom'，实际工作流节点类型在 data.type
      expect(node.data.type).toBe('manual-json-import')
    })

    it('应正确设置节点的标签和位置', () => {
      const node = WorkflowApi.addNode('manual-json-import', '带位置的节点', { x: 300, y: 200 })

      expect(node.position).toEqual({ x: 300, y: 200 })
    })

    it('创建节点后 store 中应包含该节点', () => {
      const node = WorkflowApi.addNode('manual-json-import', '持久化测试')

      const store = useWorkflowStore()
      const found = store.nodes.find((n) => n.id === node.id)
      expect(found).toBeDefined()
      expect(found?.id).toBe(node.id)
    })
  })

  describe('connectNodes', () => {
    it('应通过节点 id 创建连线并返回 edge 对象', () => {
      // trigger → action 是合法的连接规则
      const source = WorkflowApi.addNode('manual-json-import', '源节点', { x: 0, y: 0 })
      const target = WorkflowApi.addNode('js-transform', '目标节点', { x: 400, y: 0 })

      const edge = WorkflowApi.connectNodes(source.id, target.id)

      expect(edge).toBeDefined()
      expect(edge.id).toBeTruthy()
      expect(edge.source).toBe(source.id)
      expect(edge.target).toBe(target.id)
    })

    it('创建连线后 store 中应包含该连线', () => {
      const source = WorkflowApi.addNode('manual-json-import', '源', { x: 0, y: 0 })
      const target = WorkflowApi.addNode('js-transform', '目标', { x: 400, y: 0 })

      const edge = WorkflowApi.connectNodes(source.id, target.id)

      const store = useWorkflowStore()
      const found = store.edges.find((e) => e.id === edge.id)
      expect(found).toBeDefined()
    })
  })

  describe('updateNodeConfig', () => {
    it('应更新指定节点的配置参数', () => {
      const node = WorkflowApi.addNode('manual-json-import', '配置测试')

      WorkflowApi.updateNodeConfig(node.id, { jsonData: '{"test": 1}' })

      const store = useWorkflowStore()
      const updated = store.nodes.find((n) => n.id === node.id)
      expect(updated?.data?.config).toBeDefined()
    })
  })

  describe('renameNode', () => {
    it('应修改节点的显示标签', () => {
      const node = WorkflowApi.addNode('manual-json-import', '旧名称')

      WorkflowApi.renameNode(node.id, '新名称')

      const store = useWorkflowStore()
      const updated = store.nodes.find((n) => n.id === node.id)
      expect(updated?.data?.label).toBe('新名称')
    })
  })

  describe('removeNode', () => {
    it('应删除画布上的指定节点', () => {
      const node = WorkflowApi.addNode('manual-json-import', '待删除')

      WorkflowApi.removeNode(node.id)

      const store = useWorkflowStore()
      const found = store.nodes.find((n) => n.id === node.id)
      expect(found).toBeUndefined()
    })
  })

  describe('disconnectEdge', () => {
    it('应删除两个节点之间的连线', () => {
      const source = WorkflowApi.addNode('manual-json-import', '源', { x: 0, y: 0 })
      const target = WorkflowApi.addNode('js-transform', '目标', { x: 400, y: 0 })
      const edge = WorkflowApi.connectNodes(source.id, target.id)

      WorkflowApi.disconnectEdge(edge.id)

      const store = useWorkflowStore()
      const found = store.edges.find((e) => e.id === edge.id)
      expect(found).toBeUndefined()
    })
  })

  describe('moveNode', () => {
    it('应更新节点在画布上的位置坐标', () => {
      const node = WorkflowApi.addNode('manual-json-import', '可移动节点', { x: 100, y: 100 })

      WorkflowApi.moveNode(node.id, { x: 500, y: 300 })

      const store = useWorkflowStore()
      const moved = store.nodes.find((n) => n.id === node.id)
      expect(moved?.position).toEqual({ x: 500, y: 300 })
    })
  })
})
