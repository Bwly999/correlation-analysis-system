import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TableCollectionViewer from '../viewers/TableCollectionViewer.vue'

const groupedResult = {
  kind: 'tableCollection',
  payload: [
    {
      name: '组 A',
      data: [
        { score: 1, city: 'Shanghai' },
        { score: 2, city: 'Beijing' },
      ],
    },
    {
      name: '组 B',
      data: [
        { score: 9, city: 'Shenzhen' },
      ],
    },
  ],
}

describe('TableCollectionViewer', () => {
  it('persists the active group per node scope', async () => {
    localStorage.clear()

    const wrapper = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-a',
      },
    })

    await wrapper.get('button').trigger('click')
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.text()).toContain('Shenzhen')
    await wrapper.unmount()

    const remounted = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-a',
      },
    })

    expect(remounted.text()).toContain('Shenzhen')
    expect(remounted.findAll('button')[1]!.classes()).toContain('bg-blue-600')

    const otherNode = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-b',
      },
    })

    expect(otherNode.text()).toContain('Shanghai')
    expect(otherNode.findAll('button')[0]!.classes()).toContain('bg-blue-600')
  })
})
