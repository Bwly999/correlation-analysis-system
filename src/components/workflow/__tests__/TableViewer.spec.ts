import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TableViewer from '../viewers/TableViewer.vue'

const createRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `row-${index}`,
  }))

describe('TableViewer', () => {
  it('paginates table rows instead of rendering all rows at once', async () => {
    const wrapper = mount(TableViewer, {
      props: {
        data: {
          kind: 'table',
          payload: createRows(60),
        },
      },
    })

    expect(wrapper.text()).toContain('row-0')
    expect(wrapper.text()).toContain('row-49')
    expect(wrapper.text()).not.toContain('row-50')
    expect(wrapper.findAll('[data-test=\"table-row\"]')).toHaveLength(50)

    await wrapper.get('[data-test="table-next-page"]').trigger('click')

    expect(wrapper.text()).toContain('row-50')
    expect(wrapper.text()).not.toContain('row-0')
    expect(wrapper.findAll('[data-test=\"table-row\"]')).toHaveLength(10)
  })
})
