import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TableCollectionViewer from '../viewers/TableCollectionViewer.vue'
import { buildScopedResultPreviewStorageKey } from '../useScopedResultPreviewStorage'

const tableViewerCalls = vi.hoisted(() => vi.fn())

vi.mock('../viewers/TableViewer.vue', () => ({
  default: defineComponent({
    name: 'TableViewerStub',
    props: ['data', 'storageScopeKey'],
    setup(props) {
      tableViewerCalls(props)

      return () =>
        h(
          'div',
          {
            'data-test': 'table-viewer-stub',
            'data-storage-scope-key': props.storageScopeKey ?? '',
            'data-row-count': String(Array.isArray((props.data as any)?.payload) ? (props.data as any).payload.length : 0),
          },
          JSON.stringify(props.data),
        )
    },
  }),
}))

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
      data: [{ score: 9, city: 'Shenzhen' }],
    },
  ],
}

describe('TableCollectionViewer', () => {
  it('persists the active group per node scope', async () => {
    localStorage.clear()
    tableViewerCalls.mockClear()

    const wrapper = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-a',
      },
    })

    await wrapper.findAll('button')[1]!.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Shenzhen')
    expect(wrapper.get('[data-test="table-viewer-stub"]').attributes('data-storage-scope-key')).toBe(
      'node-a:group:组 B',
    )
    await wrapper.unmount()

    localStorage.setItem(buildScopedResultPreviewStorageKey('node-a', 'table-collection-group')!, '组 B')

    const remounted = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-a',
      },
    })

    await nextTick()
    expect(remounted.get('[data-test="table-viewer-stub"]').attributes('data-storage-scope-key')).toBe(
      'node-a:group:组 B',
    )

    const otherNode = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-b',
      },
    })

    expect(otherNode.text()).toContain('Shanghai')
    expect(otherNode.findAll('button')[0]!.classes()).toContain('bg-blue-600')
    expect(otherNode.get('[data-test="table-viewer-stub"]').attributes('data-storage-scope-key')).toBe(
      'node-b:group:组 A',
    )
  })

  it('renders the active group through TableViewer instead of a raw table', () => {
    tableViewerCalls.mockClear()

    const wrapper = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-grid',
      },
    })

    expect(wrapper.find('[data-test="table-viewer-stub"]').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.get('[data-test="table-viewer-stub"]').attributes('data-row-count')).toBe('2')

    expect(tableViewerCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        storageScopeKey: 'node-grid:group:组 A',
        data: expect.objectContaining({
          kind: 'table',
          payload: groupedResult.payload[0]!.data,
        }),
      }),
    )
  })

  it('keeps table storage isolated per group when switching back and forth', async () => {
    tableViewerCalls.mockClear()

    const wrapper = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-isolated',
      },
    })

    expect(wrapper.get('[data-test="table-viewer-stub"]').attributes('data-storage-scope-key')).toBe(
      'node-isolated:group:组 A',
    )

    await wrapper.findAll('button')[1]!.trigger('click')
    await nextTick()
    expect(wrapper.get('[data-test="table-viewer-stub"]').attributes('data-storage-scope-key')).toBe(
      'node-isolated:group:组 B',
    )

    await wrapper.findAll('button')[0]!.trigger('click')
    await nextTick()
    expect(wrapper.get('[data-test="table-viewer-stub"]').attributes('data-storage-scope-key')).toBe(
      'node-isolated:group:组 A',
    )

    expect(tableViewerCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        storageScopeKey: 'node-isolated:group:组 A',
      }),
    )

    await wrapper.findAll('button')[1]!.trigger('click')
    await wrapper.unmount()

    const remounted = mount(TableCollectionViewer, {
      props: {
        data: groupedResult,
        storageScopeKey: 'node-isolated',
      },
    })

    await nextTick()
    expect(remounted.findAll('button')[1]!.classes()).toContain('bg-blue-600')
    expect(remounted.get('[data-test="table-viewer-stub"]').attributes('data-storage-scope-key')).toBe(
      'node-isolated:group:组 B',
    )
  })
})
