# Node 后端架构 Review 待办清单

## 目标

围绕 Node 侧服务端实现，完成以下整改：

- 收敛存储层职责，避免路由、网关、MCP 运行时直接依赖隐式全局存储实现
- 拆分 HTTP 入口与业务模块，降低 `app.ts` 耦合度
- 统一前后端上下文请求头，取消旧兼容命名与 demo 用户隐式兜底
- 为 MCP、Agent、Storage 建立清晰的依赖注入边界
- 将存储 DTO 下沉为共享契约，减少重复定义和边界漂移

## 已完成

### 1. 存储层与共享契约

- [x] 新增共享存储 DTO：`src/shared/contracts/storage.ts`
- [x] 新增 `storageService`，将用户解析、工作流版本、历史记录能力收口到服务层
- [x] 新增 `storageCompositionRoot` 与 `storageRepositoryFactory`，通过组合根装配仓储与服务
- [x] 前端 `src/utils/storage/types.ts` 复用共享 DTO，消除前后端重复模型
- [x] 为仓储工厂与组合根补充定向测试

### 2. HTTP 分层与模块拆分

- [x] `src/server/app.ts` 收敛为轻量组合入口
- [x] 新增 `src/server/http/` 通用层，统一 body 读取、上下文、错误处理、响应写出与 CORS
- [x] 新增 `src/server/modules/` 路由模块，分离 storage、analysis、agent、workflow-ai、workflow-mcp
- [x] 新增 `serverDependencies`，集中装配服务端依赖

### 3. 上下文与请求头统一

- [x] 统一使用：
  - `x-workflow-user-id`
  - `x-workflow-user-name`
  - `x-workflow-session-id`
- [x] 前端 `serverStorageProvider` 改为发送新请求头
- [x] MCP / Agent / Storage 相关测试切换为新请求头
- [x] 清理 `x-user-id`、`x-workflow-storage-user-id`、`x-workflow-ai-session-id` 的遗留引用

### 4. MCP 与运行时依赖注入

- [x] `workflowMcpRuntime` 支持通过 `createWorkflowMcpRuntime({ storage })` 注入存储网关
- [x] `workflowMcpRoutes` 通过组合根传入 `runtime` 与 `resolveStorageUser`
- [x] 修复 `workflowMcpServer` 的工具列表递归参数遗漏
- [x] 修复 MCP 服务端测试依赖形状错误，恢复服务端定向测试

### 5. 默认存储实例问题

- [x] 保留 `src/server/storage.ts` 兼容导出，但默认 API 改为稳定单例
- [x] 避免每次调用重新创建组合根，消除 LowDB / MySQL 生命周期重复构造风险

## 当前验证结果

- [x] `pnpm test:unit -- src/server/__tests__/storageRoutes.spec.ts src/server/__tests__/workflowAiRoutes.spec.ts src/server/opencode/__tests__/workflowMcpTransport.spec.ts src/server/opencode/__tests__/workflowMcpServer.spec.ts src/server/opencode/__tests__/gateway.spec.ts src/utils/storage/__tests__/serverStorageProviderClient.spec.ts`
- [x] `pnpm test:unit -- src/server/__tests__/storageRepositoryFactory.spec.ts src/server/__tests__/storageServiceComposition.spec.ts src/server/opencode/__tests__/workflowMcpServer.spec.ts`
- [x] `pnpm type-check:server`
- [x] `pnpm build`

## 剩余收尾

- [x] 收紧 `gateway.ts` 与 `workflowMcpServer.ts` 中工作流上下文映射的类型定义，完成服务端类型检查
- [x] 在 `type-check:server` 通过后重新执行 `pnpm build`
- [ ] 如后续继续推进，可进一步压缩 `workflowAiRoutes.ts` / `storageRoutes.ts` 内部边界类型，减少局部 `unknown` 到领域对象的直接透传
