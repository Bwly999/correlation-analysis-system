# 工作流节点说明

本文档是工作流节点文档的入口。整个文档系统聚焦节点的体系分类、定义协议、属性设计规则以及创建新节点的完整规范。

> **读者对象：** 开发者和 LLM Agent，需要理解现有节点体系或创建新节点。

## 与工作流系统文档的关系

| 文档 | 覆盖范围 |
|------|---------|
| `../workflow-system/` | 执行引擎、结果协议、连接规则、持久化、展示链路等**系统级**规则 |
| 本文档（`./workflow-nodes/`） | **节点级**规则：节点清单、定义协议、属性设计、创建规范 |

## 节点体系总览

当前注册节点共 **30 个**，分为三个类别：

| 类别 | 角色 | 活跃节点 | Legacy 节点 |
|------|------|---------|------------|
| **Trigger** | 数据源/运行时入口 | 3 | 0 |
| **Action** | 中间处理（变换/清洗/筛选/聚合/合并） | 10 | 2 (`data-cleaning`, `data-profiling`) |
| **Terminal** | 分析终点/结果输出 | 10 | 5 (`pearson`, `spearman`, `kendall`, `chart-display`, `data-export`) |

连接规则摘要：Trigger → Action/Terminal，Action → Action/Terminal，Terminal 不可输出连线。

## 参考核心文件

| 文件 | 说明 |
|------|------|
| `src/nodes/registry.ts` | 节点注册入口（所有节点汇集于此） |
| `src/nodes/types.ts` | `NodeDefinition` / `NodeProperty` 类型定义 |
| `src/nodes/result.ts` | `NodeResult` 结果协议 |
| `src/nodes/helpCatalog.ts` | 帮助文档、`assistantHints`、`libraryGroup` 映射 |
| `src/nodes/libraryGroups.ts` | 节点库分组定义 |
| `src/nodes/definitions/` | 各节点实现文件 |
| `src/nodes/__tests__/` | 节点测试 |

## 文档导航

| 文档 | 内容 |
|------|------|
| [节点清单](节点清单.md) | Trigger / Action / Terminal 完整清单，含 availability、libraryGroup、output kind |
| [节点定义与属性](节点定义与属性.md) | `NodeDefinition` 接口约束、`NodeProperty` 类型与设计规范 |
| [创建新节点](创建新节点.md) | 9 条创建规则 + 推荐落地流程 + 测试规范 |
| [附录-历史补充说明](附录-历史补充说明.md) | 历史变更记录 |

## 相关文档

- [工作流系统文档](../workflow-system/index.md) — 执行引擎、结果协议、连接规则等系统级规则
