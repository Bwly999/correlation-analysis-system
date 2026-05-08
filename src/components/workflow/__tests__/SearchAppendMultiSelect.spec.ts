import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SearchAppendMultiSelect from '../common/SearchAppendMultiSelect.vue'

const multiSelectStub = defineComponent({
  name: 'MultiSelect',
  props: {
    filterMatchMode: {
      type: String,
      default: 'contains',
    },
    emptyFilterMessage: {
      type: String,
      default: '',
    },
  },
  emits: ['filter', 'update:model-value'],
  template: `
    <div>
      <slot name="filtericon" />
      <div data-testid="filter-mode">{{ filterMatchMode }}</div>
      <div data-testid="empty-filter-message">{{ emptyFilterMessage }}</div>
      <button
        type="button"
        data-testid="filter-temperature-regex"
        @click="$emit('filter', { value: '^温' })"
      >
        筛选温度
      </button>
      <button
        type="button"
        data-testid="filter-invalid-regex"
        @click="$emit('filter', { value: '[' })"
      >
        非法正则
      </button>
      <button
        type="button"
        data-testid="select-filtered"
        @click="$emit('update:model-value', ['temperature'])"
      >
        选中筛选项
      </button>
    </div>
  `,
})

describe('SearchAppendMultiSelect', () => {
  it('默认使用普通包含搜索，并显示正则开关按钮', () => {
    const wrapper = mount(SearchAppendMultiSelect, {
      props: {
        modelValue: [],
        options: ['温度', '压力'],
      },
      global: {
        stubs: {
          MultiSelect: multiSelectStub,
        },
      },
    })

    expect(wrapper.get('[data-testid="filter-mode"]').text()).toBe('contains')
    expect(
      wrapper.get('[data-testid="search-append-multi-select-regex-toggle"]').text(),
    ).toContain('.*')
  })

  it('点击开关后切换到正则搜索，并按正则命中结果合并筛选全选', async () => {
    const wrapper = mount(SearchAppendMultiSelect, {
      props: {
        modelValue: ['pressure'],
        options: [
          { label: '温度', value: 'temperature' },
          { label: '压力', value: 'pressure' },
        ],
      },
      global: {
        stubs: {
          MultiSelect: multiSelectStub,
        },
      },
    })

    await wrapper
      .get('[data-testid="search-append-multi-select-regex-toggle"]')
      .trigger('click')
    await wrapper.get('[data-testid="filter-temperature-regex"]').trigger('click')
    await wrapper.get('[data-testid="select-filtered"]').trigger('click')

    expect(wrapper.get('[data-testid="filter-mode"]').text()).toBe('custom_regex')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
      'pressure',
      'temperature',
    ])
  })

  it('非法正则仅提示错误，不会抛出异常', async () => {
    const wrapper = mount(SearchAppendMultiSelect, {
      props: {
        modelValue: [],
        options: ['温度', '压力'],
      },
      global: {
        stubs: {
          MultiSelect: multiSelectStub,
        },
      },
    })

    await wrapper
      .get('[data-testid="search-append-multi-select-regex-toggle"]')
      .trigger('click')
    await wrapper.get('[data-testid="filter-invalid-regex"]').trigger('click')

    expect(wrapper.get('[data-testid="empty-filter-message"]').text()).toBe(
      '正则表达式无效，请检查输入格式',
    )
  })
})
