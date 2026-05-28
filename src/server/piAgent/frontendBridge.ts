/**
 * FrontendBridge — 后端 Pi Agent 工具与前端工作流操作的请求-响应桥接层
 *
 * 每个用户会话（PiAgentRuntime）持有一个独立的 FrontendBridge 实例，
 * 确保多用户间完全隔离。
 *
 * 工作原理：
 * 1. 后端 tool.execute() 调用 bridge.request(toolCallId, toolName, params)
 * 2. bridge 通过 sendToFrontend 回调将事件发送到前端（SSE/NDJSON）
 * 3. 前端执行对应的 WorkflowApi 操作
 * 4. 前端通过 HTTP POST 将结果发送回后端
 * 5. 后端调用 bridge.resolveResult(toolCallId, result)
 * 6. bridge.request() 返回的 Promise 被 resolve/reject
 */

import type { PiAgentSafeToolResult } from '../../ai/types.js'

/** 工具执行结果格式（与 Pi SDK defineTool execute 返回类型一致） */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  details: PiAgentSafeToolResult
  isError?: boolean
}

/** 发送到前端的事件回调签名 */
export type SendToFrontendFn = (event: {
  type: string
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
}) => void

/** FrontendBridge 配置选项 */
export interface FrontendBridgeOptions {
  /** 工具执行超时时间（毫秒），默认 30000 */
  timeoutMs: number
}

export interface FrontendBridgeRequestOptions {
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30000

export class FrontendBridgeTimeoutError extends Error {
  readonly code = 'FRONTEND_BRIDGE_TIMEOUT'
  readonly toolName: string
  readonly timeoutMs: number

  constructor(toolName: string, timeoutMs: number) {
    super('等待前端执行超时')
    this.name = 'FrontendBridgeTimeoutError'
    this.toolName = toolName
    this.timeoutMs = timeoutMs
  }
}

/** 挂起的请求记录 */
interface PendingRequest {
  toolName: string
  resolve: (result: ToolResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  timeoutMs: number
}

export class FrontendBridge {
  private readonly sendToFrontend: SendToFrontendFn
  private readonly options: FrontendBridgeOptions
  private readonly pendingRequests: Map<string, PendingRequest>
  private disposed: boolean

  constructor(sendToFrontend: SendToFrontendFn, options?: Partial<FrontendBridgeOptions>) {
    this.sendToFrontend = sendToFrontend
    this.options = { timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS }
    this.pendingRequests = new Map()
    this.disposed = false
  }

  /**
   * 向发送工具执行请求并等待前端结果
   *
   * @param toolCallId - Pi SDK 分配的工具调用唯一标识
   * @param toolName - 工具名称（如 workflow_update_partial_workflow）
   * @param params - 工具参数
   * @returns Promise，前端返回结果时 resolve
   */
  request(
    toolCallId: string,
    toolName: string,
    params: Record<string, unknown>,
    options?: FrontendBridgeRequestOptions,
  ): Promise<ToolResult> {
    if (this.disposed) {
      return Promise.reject(new Error('会话已关闭'))
    }

    return new Promise<ToolResult>((resolve, reject) => {
      const pending: PendingRequest = {
        toolName,
        resolve,
        reject,
        timer: setTimeout(() => undefined, 0),
        timeoutMs: options?.timeoutMs ?? this.options.timeoutMs,
      }
      pending.timer = this.createTimeoutTimer(toolCallId, pending)
      this.pendingRequests.set(toolCallId, pending)

      // 发送事件到前端
      this.sendToFrontend({
        type: 'tool.execute',
        toolCallId,
        toolName,
        params,
      })
    })
  }

  /**
   * 前端返回工具执行成功结果时调用
   *
   * @param toolCallId - 工具调用唯一标识
   * @param result - 执行结果
   * @returns 是否成功匹配到待处理请求
   */
  resolveResult(toolCallId: string, result: ToolResult): boolean {
    const pending = this.pendingRequests.get(toolCallId)
    if (!pending) return false

    clearTimeout(pending.timer)
    this.pendingRequests.delete(toolCallId)
    pending.resolve(result)
    return true
  }

  /**
   * 前端返回工具执行失败时调用
   *
   * @param toolCallId - 工具调用唯一标识
   * @param error - 错误信息
   * @returns 是否成功匹配到待处理请求
   */
  rejectResult(toolCallId: string, error: Error): boolean {
    const pending = this.pendingRequests.get(toolCallId)
    if (!pending) return false

    clearTimeout(pending.timer)
    this.pendingRequests.delete(toolCallId)
    pending.reject(error)
    return true
  }

  touchRequest(toolCallId: string): boolean {
    const pending = this.pendingRequests.get(toolCallId)
    if (!pending) return false

    clearTimeout(pending.timer)
    pending.timer = this.createTimeoutTimer(toolCallId, pending)
    return true
  }

  cancelPendingRequests(reason = '当前轮已取消'): void {
    for (const [toolCallId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      this.pendingRequests.delete(toolCallId)
      pending.reject(new Error(reason))
    }
  }

  /** 当前待处理的请求数量 */
  get pendingCount(): number {
    return this.pendingRequests.size
  }

  /**
   * 清理所有待处理请求（会话关闭时调用）
   * 所有挂起的 Promise 将被 reject
   */
  dispose(): void {
    this.disposed = true
    this.cancelPendingRequests('会话已关闭')
  }

  private createTimeoutTimer(toolCallId: string, pending: PendingRequest) {
    return setTimeout(() => {
      this.pendingRequests.delete(toolCallId)
      pending.reject(new FrontendBridgeTimeoutError(pending.toolName, pending.timeoutMs))
    }, pending.timeoutMs)
  }
}
