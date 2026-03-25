import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RuntimeInputs from '../config/RuntimeInputs.vue'

describe('RuntimeInputs', () => {
  it('uses a full-height scroll layout so the last runtime field is not clipped', () => {
    const wrapper = mount(RuntimeInputs, {
      props: {
        properties: [
          { name: 'alpha', displayName: '字段 A', type: 'string', default: '' },
          { name: 'beta', displayName: '字段 B', type: 'string', default: '' },
        ],
        config: {},
        upstreamFactors: [],
      },
      global: {
        stubs: {
          PropertyField: {
            props: ['prop'],
            template: '<div class="property-field-stub">{{ prop.displayName }}</div>',
          },
        },
      },
    })

    const root = wrapper.get('[data-testid="runtime-inputs-root"]')
    const scrollArea = wrapper.get('[data-testid="runtime-inputs-scroll"]')

    expect(root.classes()).toContain('h-full')
    expect(root.classes()).toContain('min-h-0')
    expect(scrollArea.classes()).toContain('pb-8')
  })
})
