import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTableResult } from '@/nodes/result'
import DataQualityPivotViewer from '../DataQualityPivotViewer.vue'

vi.mock('primevue/datatable', () => ({
  default: defineComponent({
    name: 'DataTableStub',
    props: ['value', 'sortField', 'sortOrder', 'removableSort', 'scrollable', 'scrollHeight'],
    setup(props, { slots }) {
      return () =>
        h(
          'div',
          {
            'data-test': 'prime-datatable-stub',
            'data-sort-field': props.sortField,
            'data-sort-order': String(props.sortOrder),
            'data-removable-sort': String(props.removableSort),
            'data-scrollable': String(props.scrollable),
            'data-scroll-height': props.scrollHeight,
          },
          [
            h(
              'div',
              { 'data-test': 'prime-datatable-row-count' },
              String((props.value ?? []).length),
            ),
            slots.default?.(),
          ],
        )
    },
  }),
}))

vi.mock('primevue/column', () => ({
  default: defineComponent({
    name: 'ColumnStub',
    props: ['field', 'header', 'sortable', 'headerClass', 'bodyClass', 'pt'],
    setup(props) {
      return () =>
        h(
          'div',
          {
            'data-test': `prime-column-${props.field ?? props.header}`,
            'data-field': props.field,
            'data-sortable': String(props.sortable),
            'data-header-class': props.headerClass,
            'data-body-class': props.bodyClass,
            'data-header-content-class': props.pt?.columnHeaderContent?.class,
            'data-title-class': props.pt?.columnTitle?.class,
          },
          props.header,
        )
    },
  }),
}))

vi.mock('primevue/inputnumber', () => ({
  default: defineComponent({
    name: 'InputNumberStub',
    props: ['modelValue', 'inputId', 'min', 'max'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          'data-test': props.inputId ?? 'input-number',
          type: 'number',
          min: props.min,
          max: props.max,
          value: props.modelValue,
          onInput: (event: Event) =>
            emit('update:modelValue', Number((event.target as HTMLInputElement).value)),
        })
    },
  }),
}))

describe('DataQualityPivotViewer', () => {
  it('renders field detail with PrimeVue DataTable sorted by missing rate descending', () => {
    const wrapper = mount(DataQualityPivotViewer, {
      props: {
        data: createTableResult([
          { score: 1, temp: null, note: '' },
          { score: 2, temp: 20, note: 'ok' },
          { score: 3, temp: null, note: undefined },
        ]),
      },
    })

    const table = wrapper.get('[data-test="prime-datatable-stub"]')
    expect(table.attributes('data-sort-field')).toBe('missingRate')
    expect(table.attributes('data-sort-order')).toBe('-1')
    expect(table.attributes('data-removable-sort')).not.toBe('false')
    expect(table.attributes('data-scrollable')).not.toBe('false')
    expect(table.attributes('data-scroll-height')).toBe('360px')

    expect(wrapper.get('[data-test="prime-column-missingRate"]').attributes('data-sortable')).not.toBe(
      'false',
    )
    expect(wrapper.get('[data-test="prime-column-missingRate"]').attributes('data-header-class')).toBe(
      'data-quality-table__numeric-header',
    )
    expect(wrapper.get('[data-test="prime-column-missingRate"]').attributes('data-body-class')).toBe(
      'data-quality-table__numeric-cell',
    )
    expect(
      wrapper.get('[data-test="prime-column-missingRate"]').attributes('data-header-content-class'),
    ).toBe('data-quality-table__numeric-header-content')
    expect(wrapper.get('[data-test="prime-column-missingRate"]').attributes('data-title-class')).toBe(
      'data-quality-table__numeric-title',
    )
    expect(wrapper.get('[data-test="prime-column-field"]').attributes('data-sortable')).not.toBe(
      'false',
    )
    expect(wrapper.get('[data-test="prime-datatable-row-count"]').text()).toBe('3')
  })
})
