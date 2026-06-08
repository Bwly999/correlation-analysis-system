# 手机尺寸评测操作说明

这套评测适用于 `Codex`、`Claude Code`、`OpenCode` 等通用 Agent。

## 1. 选择题目

从 `tasks/` 目录中任选一题：

- `task-01.json`：分析整机齐平间隙主因
- `task-02.json`：分析背盖台阶和漏液风险主链
- `task-03.json`：识别伪相关和错误归因风险

## 2. 准备给 Agent 的输入

把下面几类文件一起提供给 Agent：

- `data/part_measurements.csv`
- `data/assembly_measurements.csv`
- `data/mapping_or_lot_bridge.csv`
- 当前题目的 `prompt`

可选提供：

- `data/field_dictionary.json`

不要提前给 Agent：

- `data/dataset_truth.json`
- `reference_conclusions`
- `guide/rubric.md`

这些内容只给评测人自己看。

## 3. 发起分析

把任务文件里的 `prompt` 原样发给 Agent，允许它自由选择分析过程。

建议要求 Agent 输出：

- 中文结论摘要
- 关键图表
- 主要证据字段
- 对伪相关或不确定性的说明

## 4. 看结果

评测人重点检查：

- 结论是否基本正确
- 有没有把跨表关联做对
- 有没有把伪相关误判成根因
- 图表是否真的支撑文字结论
- 中文表达是否清楚易懂

## 5. 打分

打开 `guide/rubric.md` 和 `guide/review-sheet.md`，按 4 个维度人工评分：

- 结论正确性
- 证据充分性
- 图表与结果可读性
- 表达清晰度

## 6. 记录结果

每个 Agent 建议至少记录：

- 使用的 Agent / 工具名
- 使用的模型
- 任务编号
- 四项评分
- 简短评语

## 7. 对比不同 Agent

如果要横向比较 `Codex`、`Claude Code`、`OpenCode`，尽量保持一致：

- 使用同一题目
- 提供同一批数据文件
- 使用相近的提示词
- 由同一个评测人打分

这样结果才更有可比性。
