import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const files = [
  path.resolve(__dirname, '../RuntimeInputModal.vue'),
  path.resolve(__dirname, '../HelpCenterModal.vue'),
  path.resolve(__dirname, '../help/NodeHelpPanel.vue'),
  path.resolve(__dirname, '../config/RuntimeInputs.vue'),
  path.resolve(__dirname, '../config/PropertyField.vue'),
]

describe('workflow ui copy', () => {
  it('does not contain placeholder question-mark mojibake in key workflow components', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toContain('???')
    }
  })
})
