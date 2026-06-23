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
    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ optionIds: ['keep'] })
  })

  it('单选：再次点击其他选项会覆盖原选择', async () => {
    const wrapper = mount(AskUserCard, { props: { block: buildBlock() } })
    await wrapper.findAll('button').filter((b) => b.text().includes('维持现状'))[0]!.trigger('click')
    await wrapper.findAll('button').filter((b) => b.text().includes('使用 SMOTE'))[0]!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认'))!.trigger('click')
    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ optionIds: ['smote'] })
  })

  it('多选：可勾选多个选项并一起提交', async () => {
    const wrapper = mount(AskUserCard, {
      props: { block: buildBlock({ multiSelect: true }) },
    })
    await wrapper.findAll('button').filter((b) => b.text().includes('维持现状'))[0]!.trigger('click')
    await wrapper.findAll('button').filter((b) => b.text().includes('使用 SMOTE'))[0]!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认'))!.trigger('click')
    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({
      optionIds: ['keep', 'smote'],
    })
  })

  it('多选：再次点击已勾选项会取消选中', async () => {
    const wrapper = mount(AskUserCard, {
      props: { block: buildBlock({ multiSelect: true }) },
    })
    const keepBtn = wrapper.findAll('button').filter((b) => b.text().includes('维持现状'))[0]!
    await keepBtn.trigger('click')
    await keepBtn.trigger('click') // 取消
    await wrapper.findAll('button').filter((b) => b.text().includes('使用 SMOTE'))[0]!.trigger('click')
    await wrapper.findAll('button').find((b) => b.text().includes('确认'))!.trigger('click')
    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ optionIds: ['smote'] })
  })

  it('answered 状态：显示"已选择"', () => {
    const wrapper = mount(AskUserCard, {
      props: {
        block: buildBlock({
          status: 'answered',
          answeredOptionIds: ['smote'],
        }),
      },
    })
    expect(wrapper.text()).toContain('已选择')
    expect(wrapper.text()).toContain('使用 SMOTE')
  })

  it('answered 多选：用顿号拼接多个 label', () => {
    const wrapper = mount(AskUserCard, {
      props: {
        block: buildBlock({
          multiSelect: true,
          status: 'answered',
          answeredOptionIds: ['keep', 'smote'],
        }),
      },
    })
    expect(wrapper.text()).toContain('维持现状、使用 SMOTE')
  })

  it('allowFreeText=true 时出现自由输入选项', async () => {
    const wrapper = mount(AskUserCard, {
      props: { block: buildBlock({ allowFreeText: true }) },
    })
    expect(wrapper.text()).toContain('自由输入')
  })

  it('自由文本：选中后必须填文案才能提交', async () => {
    const wrapper = mount(AskUserCard, {
      props: { block: buildBlock({ allowFreeText: true }) },
    })
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('确认'))!
    const freeBtn = wrapper.findAll('button').find((b) => b.text().includes('自由输入'))!
    await freeBtn!.trigger('click')
    // 空文本：不能提交
    expect(confirmBtn!.attributes('disabled')).toBeDefined()
    await wrapper.find('textarea').setValue('我要做聚类')
    expect(confirmBtn!.attributes('disabled')).toBeUndefined()
    await confirmBtn!.trigger('click')
    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({
      optionIds: ['__free_text__'],
      text: '我要做聚类',
    })
  })

  it('问题正文渲染 markdown', () => {
    const wrapper = mount(AskUserCard, {
      props: {
        block: buildBlock({ question: '是否需要 **平衡** 数据？' }),
      },
    })
    expect(wrapper.html()).toContain('<strong>平衡</strong>')
  })

  it('点取消 emit cancel', async () => {
    const wrapper = mount(AskUserCard, { props: { block: buildBlock() } })
    const cancelBtn = wrapper.findAll('button').find((b) => b.text().trim() === '取消')!
    await cancelBtn.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
