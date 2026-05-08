import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import N8nEdge from '../edges/N8nEdge.vue'

describe('N8nEdge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('uses sourceNode status from edge props to render running state', () => {
    const wrapper = mount(N8nEdge, {
      props: {
        id: 'edge_1',
        source: 'node_1',
        target: 'node_2',
        type: 'n8n',
        sourceNode: {
          id: 'node_1',
          data: {
            status: 'running',
          },
        },
        targetNode: {
          id: 'node_2',
          data: {
            status: 'idle',
          },
        },
        sourceX: 0,
        sourceY: 0,
        targetX: 200,
        targetY: 0,
        sourcePosition: 'right',
        targetPosition: 'left',
        markerStart: '',
        markerEnd: '',
        data: {},
        events: {} as any,
      } as any,
      global: {
        stubs: {
          EdgeLabelRenderer: {
            template: '<div><slot /></div>',
          },
        },
      },
    })

    const paths = wrapper.findAll('path')
    expect(paths[0]?.classes()).toContain('stroke-blue-600')
    expect(paths[0]?.classes()).toContain('is-running')
  })
})
