/**
 * AskUserCard 最小测试
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AskUserCard from '../../cards/AskUserCard.vue'
import type { AskUserBlock } from '../../../types/messageStream'

const buildBlock = (over?: Partial<AskUserBlock>): AskUserBlock => ({
  id: 'q1',
  question: '是否平衡数据？',
  status: 'pending',
  options: [
    { id: 'keep', label: '维持现状', recommended: true, detail: '探索性' },
    { id: 'smote', label: '使用 SMOTE' },
  ],
  allowFreeText: false,
  ...over,
})

describe('AskUserCard', () => {
  it('pending 时按钮 disabled，选中后可提交', async () => {
    const wrapper = mount(AskUserCard, { props: { block: buildBlock() } })
    expect(wrapper.text()).toContain('Agent 想问你')
    expect(wrapper.text()).toContain('维持现状')
    expect(wrapper.text()).toContain('推荐')

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认'))!
    expect(confirmBtn.attributes('disabled')).toBeDefined()

    // 选第一个选项
    const optButtons = wrapper.findAll('button').filter((b) => b.text().includes('维持现状'))
    await optButtons[0]!.trigger('click')
    expect(confirmBtn.attributes('disabled')).toBeUndefined()

    await confirmBtn.trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ optionId: 'keep' })
  })

  it('answered 状态：显示"已选择"', () => {
    const wrapper = mount(AskUserCard, {
      props: {
        block: buildBlock({
          status: 'answered',
          answeredOptionId: 'smote',
        }),
      },
    })
    expect(wrapper.text()).toContain('已选择')
    expect(wrapper.text()).toContain('使用 SMOTE')
  })

  it('allowFreeText=true 时出现自由输入选项', async () => {
    const wrapper = mount(AskUserCard, {
      props: { block: buildBlock({ allowFreeText: true }) },
    })
    expect(wrapper.text()).toContain('自由输入')
  })

  it('点取消 emit cancel', async () => {
    const wrapper = mount(AskUserCard, { props: { block: buildBlock() } })
    const cancelBtn = wrapper.findAll('button').find((b) => b.text().trim() === '取消')!
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
