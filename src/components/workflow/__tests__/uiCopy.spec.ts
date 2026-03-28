import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const files = [
  path.resolve(__dirname, '../RuntimeInputModal.vue'),
  path.resolve(__dirname, '../HelpCenterModal.vue'),
  path.resolve(__dirname, '../NodeConfigModal.vue'),
  path.resolve(__dirname, '../help/NodeHelpPanel.vue'),
  path.resolve(__dirname, '../config/RuntimeInputs.vue'),
  path.resolve(__dirname, '../config/PropertyField.vue'),
  path.resolve(__dirname, '../nodes/BaseNode.vue'),
]

describe('workflow ui copy', () => {
  it('does not contain placeholder question-mark mojibake in key workflow components', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toContain('???')
    }
  })

  it('keeps key debug and empty-state copy readable in workflow components', () => {
    const nodeConfigContent = fs.readFileSync(path.resolve(__dirname, '../NodeConfigModal.vue'), 'utf-8')
    const propertyFieldContent = fs.readFileSync(path.resolve(__dirname, '../config/PropertyField.vue'), 'utf-8')
    const baseNodeContent = fs.readFileSync(path.resolve(__dirname, '../nodes/BaseNode.vue'), 'utf-8')

    expect(nodeConfigContent).toContain('重跑上游后调试')
    expect(nodeConfigContent).toContain('调试节点只重新执行当前节点')
    expect(propertyFieldContent).toContain('当前没有可选字段，请先连接上游数据或使用左侧输入数据')
    expect(propertyFieldContent).toContain('该项为必填，建议先完成配置再运行节点')
    expect(baseNodeContent).toContain('重跑上游后调试')
  })
})
