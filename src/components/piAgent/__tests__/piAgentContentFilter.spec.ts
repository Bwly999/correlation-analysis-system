import { describe, expect, it } from 'vitest'
import { stripPiAgentToolSummary } from '../piAgentContentFilter'

describe('piAgentContentFilter', () => {
  it('removes obvious tool summary blocks from assistant content', () => {
    const input = [
      '你好呀！',
      '',
      '📦 可用节点一览',
      '🔵 数据导入（Trigger）',
      'workflow_get_session_context',
      '输出结果如下',
    ].join('\n')

    const output = stripPiAgentToolSummary(input)

    expect(output).toContain('你好呀！')
    expect(output).not.toContain('可用节点一览')
    expect(output).not.toContain('workflow_get_session_context')
  })

  it('removes obvious system prompt echoes from assistant content', () => {
    const input = [
      '你是一个数据分析助手，帮助用户构建和执行多因子相关性分析工作流。',
      '',
      '## 你的能力',
      '1. 理解用户需求',
      '## 用户需求',
      '分析销量',
      '',
      '最终建议：先看价格因子。',
    ].join('\n')

    const output = stripPiAgentToolSummary(input)

    expect(output).not.toContain('你是一个数据分析助手')
    expect(output).not.toContain('## 你的能力')
    expect(output).not.toContain('## 用户需求')
    expect(output).toContain('最终建议：先看价格因子。')
  })

  it('removes prompt echo lines like user message and mode labels', () => {
    const input = [
      '所有回复使用中文',
      '核心结论必须有数据支撑',
      '优先构建最小可运行工作流，避免过度设计',
      '删除节点等高风险操作需要先确认',
      '创建工作流时确保节点之间正确连接',
      '配置节点参数时参考节点定义中的 properties 说明',
      '模式：创建新工作流',
      '你好',
      '用户消息：你好',
      '最终建议：继续看相关系数。',
    ].join('\n')

    const output = stripPiAgentToolSummary(input)

    expect(output).not.toContain('所有回复使用中文')
    expect(output).not.toContain('模式：创建新工作流')
    expect(output).not.toContain('用户消息：你好')
    expect(output).toContain('最终建议：继续看相关系数。')
  })

  it('removes json tool blocks from assistant content', () => {
    const input = [
      '{',
      '"mode": "create",',
      '"prompt": "你好",',
      '"workflowSnapshotSummary": null,',
      '"contextHints": {},',
      '"dataSources": []',
      '}',
      '',
      '{',
      '"total": 16,',
      '"count": 16,',
      '"offset": 0,',
      '"limit": 50,',
      '"hasMore": false,',
      '"nextOffset": null',
      '}',
      '',
      '最终建议：继续分析。',
    ].join('\n')

    const output = stripPiAgentToolSummary(input)

    expect(output).not.toContain('"mode": "create"')
    expect(output).not.toContain('"total": 16')
    expect(output).toContain('最终建议：继续分析。')
  })
})
