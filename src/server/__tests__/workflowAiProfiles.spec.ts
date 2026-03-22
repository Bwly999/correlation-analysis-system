import { describe, expect, it } from 'vitest'
import { getSystemModelProfiles } from '../workflowAi/profiles.js'

describe('workflowAi profiles', () => {
  it('provides zhipu glm-4.7 as the default system profile', () => {
    const profiles = getSystemModelProfiles()

    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toMatchObject({
      id: 'system-default-zhipu-glm-4-7',
      name: '默认智谱 GLM-4.7',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.7',
      enabled: true,
      isDefault: true,
      source: 'system',
    })
  })
})

