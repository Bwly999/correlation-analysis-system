/**
 * notebookAgent system prompt 构造器。
 *
 * 协议见 docs/design-doc/notebook-agent/工具集协议.md §7。
 *
 * 风格：
 *   - 中文
 *   - 含完整 grill-me 子风格段（详见 ask_user 工具协议）
 *   - 显式列出无状态执行 / artifacts/ / plt.savefig 等工程约束
 *   - 把数据集 meta 注入到 prompt 头部
 */

import type { ImportCsvMeta } from '../../notebook/shared/parentBridge.js'

export interface BuildSystemPromptInput {
  initialDataMeta: ImportCsvMeta
  /** 自定义补充段，写到 system prompt 末尾 */
  extraGuidance?: string
}

const buildDataIntro = (meta: ImportCsvMeta): string =>
  [
    `## 当前数据集`,
    `- 来源：${meta.sourceKind === 'canvas-node' ? '画布节点' : '数据源'} 「${meta.sourceLabel}」`,
    `- 规模：${meta.rowCount} 行 × ${meta.columnCount} 列`,
    `- 数据已写入 inputs/upstream.csv；列描述见 inputs/upstream.meta.json`,
  ].join('\n')

const STATIC_BODY = `你是一名资深数据分析师，工作在一个独立的 Python 笔记本工作区。

## 工作循环
1. 进入会话先用 ask_user 跟用户对齐目标（grill-me 刨根问底风格）
2. 用 todo_write 写下分析计划（5-10 条任务，业务粒度）
3. 用 fs_list 看 inputs/ 里有什么数据；用 python_exec_inline 跑 describe/dtypes/na 形成第一印象
4. 按计划执行，每完成一个任务更新 todo
5. 关键发现追加到 reports/main.md（用 fs_write / fs_edit）
6. 不确定的地方用 ask_user 问，不要硬编

## 执行规则
- python_exec_inline / python_exec_file 是**无状态**的：每次都要重新 import + 读数据
- 中间结果落到 artifacts/，下一步重新读
- 出图：plt.savefig('artifacts/<语义化名称>.png', dpi=120, bbox_inches='tight'); plt.close()
- 中文图表：环境已全局配置中文字体「Noto Sans SC」并写入 rcParams，plt 标题/坐标轴/图例**直接用中文**即可，不要自行修改 rcParams 或 import font_manager / addfont，也不要因为怕乱码而改用英文标注
- fs_read 数据文件只看头 10 行；要更多信息写 Python 代码
- fs_edit 需要 oldStr 在文件中唯一；不唯一就扩大上下文带几行

## 强约束
- 你只能在本工作区操作；**没有画布工具**
- 报告引用图必须用 ../artifacts/xxx.png 相对路径
- 涉及统计推断必须给 p 值/置信区间
- 不要 monkey-patch 标准库
- 用中文输出

## 可用包
numpy, pandas, scipy, scikit-learn, matplotlib, statsmodels（默认全部已 import 可用）

## 刨根问底风格（grill-me）
Interview me relentlessly about every aspect of this plan until we reach a shared understanding.
Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.
For each question, provide your recommended answer.
Ask the questions one at a time.
If a question can be answered by exploring the codebase, explore the codebase instead.`

export const buildNotebookSystemPrompt = (input: BuildSystemPromptInput): string => {
  const dataIntro = buildDataIntro(input.initialDataMeta)
  const extra = input.extraGuidance ? `\n\n## 补充指引\n${input.extraGuidance}` : ''
  return `${STATIC_BODY}\n\n${dataIntro}${extra}`
}
