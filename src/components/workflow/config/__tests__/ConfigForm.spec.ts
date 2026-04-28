import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { NodeProperty } from '@/nodes/types'
import ConfigForm from '../ConfigForm.vue'

describe('ConfigForm', () => {
  it('keeps analysis method above upstream X/Y fields', () => {
    const properties: NodeProperty[] = [
      {
        name: 'xFields',
        displayName: 'X 字段',
        type: 'multi-options',
        default: [],
        required: true,
        useUpstreamFactors: true,
      },
      {
        name: 'yFields',
        displayName: 'Y 字段',
        type: 'multi-options',
        default: [],
        required: true,
        useUpstreamFactors: true,
      },
      {
        name: 'method',
        displayName: '分析方法',
        type: 'options',
        default: 'pearson',
        options: [
          { name: 'Pearson 相关系数', value: 'pearson' },
          { name: 'Spearman 秩相关系数', value: 'spearman' },
        ],
      },
    ]

    const wrapper = mount(ConfigForm, {
      props: {
        properties,
        config: {
          method: 'pearson',
          xFields: [],
          yFields: [],
        },
        upstreamFactors: [],
      },
      global: {
        stubs: {
          PropertyField: {
            props: ['prop'],
            template: '<div data-testid="property-field">{{ prop.displayName }}</div>',
          },
        },
      },
    })

    expect(wrapper.findAll('[data-testid="property-field"]').map((item) => item.text())).toEqual([
      '分析方法',
      'X 字段',
      'Y 字段',
    ])
  })
})
