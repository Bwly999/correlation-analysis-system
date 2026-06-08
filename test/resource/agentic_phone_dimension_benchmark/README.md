# 手机尺寸分析评测数据集

这是一套面向 `Codex`、`Claude Code`、`OpenCode` 等通用 Agent 的手机尺寸人工评测包。

这套评测故意保持很轻：

- 不依赖 `sessionId`
- 不依赖 `docs/evaluations/*.xml`
- 不要求统一工具调用链
- 只要求：人发起分析，人看结果，人打分

## 目录结构

- `data/`：评测数据和真值
- `tasks/`：给 Agent 的任务描述
- `guide/`：给评测人的操作说明和评分规则
- `ui/`：可直接打开的评测工作台页面
- `generator/`：数据再生成脚本

## 文件清单

### 数据文件

- `data/part_measurements.csv`：单体物料测量数据，列数 228
- `data/assembly_measurements.csv`：组装后测量数据，列数 226
- `data/mapping_or_lot_bridge.csv`：多表桥接关系表，行数 1440
- `data/field_dictionary.json`：字段字典
- `data/dataset_truth.json`：结构化规律真值与参考结论

### 评测文件

- `tasks/*.json`：轻量任务文件，只包含 `prompt`、参考结论和观察重点
- `guide/rubric.md`：人工评分规则
- `guide/review-sheet.md`：人工评测记录表
- `guide/operation-guide.md`：评测操作说明
- `ui/benchmark-evaluator.html`：评测人快速使用页面

## 怎么用

1. 选一个 `tasks/*.json`
2. 把里面的 `prompt` 发给 Agent
3. 允许 Agent 自由使用它自己的分析方式
4. 查看 Agent 的中文结论、图表和解释
5. 用 `guide/rubric.md` 和 `guide/review-sheet.md` 做人工打分

## 设计特点

- 两张主表均为高维数据，便于考察特征筛选、回归、树模型和多表关联能力
- 同时包含真实根因、中介变量、阈值效应、交互项、伪相关和误导项
- 提供稳定主键与近似可关联键，便于观察 Agent 的 join 策略是否稳健

## 评审提醒

- `reference_conclusions` 是参考命中点，不是唯一标准答案
- 更看重输出是否可信、是否可读、是否有图表和证据支撑
- 如果 Agent 把近似关联键当成稳定主键，或明显把伪相关当根因，应重点扣分
