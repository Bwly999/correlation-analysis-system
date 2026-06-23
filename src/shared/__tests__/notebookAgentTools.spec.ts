/**
 * notebookAgentTools spec 一致性测试。
 *
 * 验收点：
 *   - 全部 10 个工具齐
 *   - name 与 dispatcher 路由表一一对应（强约束：spec 改了 dispatcher 也得跟）
 *   - 关键描述短语命中（防止 prompt 漂移）：
 *       python_exec_* 描述含"无状态"
 *       fs_write 描述含 "scripts/" / "artifacts/"
 *       todo_write 描述含 "全量覆盖"
 *       ask_user 描述含 "grill-me" 或 "刨根问底"
 *   - inputSchema 是合法的 JSON Schema-ish 对象（含 type=object）
 */

import { describe, it, expect } from 'vitest'
import {
  NOTEBOOK_AGENT_TOOL_SPECS,
  getNotebookAgentToolSpec,
} from '../notebookAgentTools'

const EXPECTED_TOOLS = [
  'python_exec_inline',
  'python_exec_file',
  'python_packages',
  'fs_read',
  'fs_write',
  'fs_edit',
  'fs_list',
  'fs_grep',
  'todo_write',
  'ask_user',
] as const

describe('notebookAgentTools spec', () => {
  it('包含全部 10 个工具，无重复', () => {
    const names = NOTEBOOK_AGENT_TOOL_SPECS.map((s) => s.name)
    expect(names.sort()).toEqual([...EXPECTED_TOOLS].sort())
    expect(new Set(names).size).toBe(names.length)
  })

  it('每个工具都有非空 description 与 inputSchema', () => {
    for (const spec of NOTEBOOK_AGENT_TOOL_SPECS) {
      expect(spec.description.length).toBeGreaterThan(5)
      expect(spec.inputSchema).toBeDefined()
      // typebox 生成的 schema 是 { type:'object', properties:{...} }
      const schema = spec.inputSchema as { type?: string; properties?: unknown }
      expect(schema.type).toBe('object')
      expect(schema.properties).toBeDefined()
    }
  })

  it('python_exec_* 描述含"无状态"，强调跨调用变量隔离', () => {
    expect(getNotebookAgentToolSpec('python_exec_inline')!.description).toMatch(/无状态/)
    expect(getNotebookAgentToolSpec('python_exec_file')!.description).toMatch(/scripts\//)
  })

  it('fs_write 描述含 scripts/ 与 artifacts/', () => {
    const desc = getNotebookAgentToolSpec('fs_write')!.description
    expect(desc).toMatch(/scripts\//)
    expect(desc).toMatch(/artifacts\//)
  })

  it('fs_read 描述提示数据文件 10 行 / 文本 300 行', () => {
    const desc = getNotebookAgentToolSpec('fs_read')!.description
    expect(desc).toMatch(/300/)
    expect(desc).toMatch(/10/)
  })

  it('todo_write 描述含 "全量覆盖"', () => {
    expect(getNotebookAgentToolSpec('todo_write')!.description).toMatch(/全量覆盖/)
  })

  it('ask_user 描述含 grill-me 或 刨根问底', () => {
    const desc = getNotebookAgentToolSpec('ask_user')!.description
    expect(desc).toMatch(/grill-me|刨根问底/)
  })

  it('getNotebookAgentToolSpec 未知工具 → undefined', () => {
    expect(getNotebookAgentToolSpec('not_a_real_tool')).toBeUndefined()
  })
})
