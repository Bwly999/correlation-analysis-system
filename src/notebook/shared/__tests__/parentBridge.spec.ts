/**
 * parentBridge schema 单测。
 *
 * 验证 schema 类型守卫：
 *   - 合法消息识别为 true，非法消息识别为 false
 *   - 必填字段缺失、kind 非法、requestId 缺失、buffer 非 ArrayBuffer 都应失败
 *   - response 消息单独识别
 */

import { describe, it, expect } from 'vitest'
import {
  isParentBridgeRequest,
  isIframeBridgeRequest,
  isParentBridgeResponse,
  PARENT_BRIDGE_KINDS,
  IFRAME_BRIDGE_KINDS,
  type ParentBridgeRequest,
  type IframeBridgeRequest,
  type ParentBridgeResponse,
} from '../parentBridge'

describe('parentBridge schema', () => {
  describe('PARENT_BRIDGE_KINDS / IFRAME_BRIDGE_KINDS 常量', () => {
    it('暴露主站 → iframe 的全部 kind', () => {
      expect(PARENT_BRIDGE_KINDS).toEqual([
        'parent.handshake',
        'parent.import_csv',
        'parent.close_request',
      ])
    })

    it('暴露 iframe → 主站的全部 kind', () => {
      expect(IFRAME_BRIDGE_KINDS).toEqual([
        'iframe.ready',
        'iframe.workspace_changed',
        'iframe.session_state',
        'iframe.request_unload_confirm',
      ])
    })
  })

  describe('isParentBridgeRequest', () => {
    it('parent.handshake 合法', () => {
      const msg: ParentBridgeRequest = {
        kind: 'parent.handshake',
        requestId: 'r-1',
        sessionId: 'sess-1',
        origin: 'http://localhost:5173',
      }
      expect(isParentBridgeRequest(msg)).toBe(true)
    })

    it('parent.import_csv 合法（带 ArrayBuffer）', () => {
      const buffer = new ArrayBuffer(8)
      const msg: ParentBridgeRequest = {
        kind: 'parent.import_csv',
        requestId: 'r-2',
        filename: 'upstream.csv',
        buffer,
        meta: {
          sourceKind: 'canvas-node',
          sourceLabel: 'cleanup-2025',
          rowCount: 100,
          columnCount: 4,
        },
      }
      expect(isParentBridgeRequest(msg)).toBe(true)
    })

    it('parent.close_request 合法', () => {
      const msg: ParentBridgeRequest = {
        kind: 'parent.close_request',
        requestId: 'r-3',
        reason: 'user_clicked_close',
      }
      expect(isParentBridgeRequest(msg)).toBe(true)
    })

    it('null / 非对象 → false', () => {
      expect(isParentBridgeRequest(null)).toBe(false)
      expect(isParentBridgeRequest(undefined)).toBe(false)
      expect(isParentBridgeRequest('string')).toBe(false)
      expect(isParentBridgeRequest(42)).toBe(false)
    })

    it('未知 kind → false', () => {
      expect(isParentBridgeRequest({ kind: 'parent.unknown', requestId: 'r' })).toBe(false)
    })

    it('缺少 requestId → false', () => {
      expect(
        isParentBridgeRequest({
          kind: 'parent.handshake',
          sessionId: 's',
          origin: 'http://localhost',
        }),
      ).toBe(false)
    })

    it('parent.import_csv 缺 filename → false', () => {
      expect(
        isParentBridgeRequest({
          kind: 'parent.import_csv',
          requestId: 'r',
          buffer: new ArrayBuffer(4),
          meta: { sourceKind: 'canvas-node', sourceLabel: '', rowCount: 0, columnCount: 0 },
        }),
      ).toBe(false)
    })

    it('parent.import_csv buffer 非 ArrayBuffer → false', () => {
      expect(
        isParentBridgeRequest({
          kind: 'parent.import_csv',
          requestId: 'r',
          filename: 'x.csv',
          buffer: 'not-an-arraybuffer',
          meta: { sourceKind: 'canvas-node', sourceLabel: '', rowCount: 0, columnCount: 0 },
        }),
      ).toBe(false)
    })

    it('parent.import_csv 跨 realm 风格的 ArrayBuffer 也通过（鸭子类型）', () => {
      // 真实场景：iframe / Worker 边界传过来的 ArrayBuffer 不一定 instanceof 当前 realm 的 ArrayBuffer。
      // 这里用一个最小鸭子模拟：byteLength + slice + Symbol.toStringTag = 'ArrayBuffer'
      const duck = {
        byteLength: 4,
        slice() {
          return duck
        },
        [Symbol.toStringTag]: 'ArrayBuffer',
      }
      expect(
        isParentBridgeRequest({
          kind: 'parent.import_csv',
          requestId: 'r',
          filename: 'x.csv',
          buffer: duck,
          meta: { sourceKind: 'canvas-node', sourceLabel: '', rowCount: 0, columnCount: 0 },
        }),
      ).toBe(true)
    })

    it('parent.close_request reason 非法 → false', () => {
      expect(
        isParentBridgeRequest({
          kind: 'parent.close_request',
          requestId: 'r',
          reason: 'something_else',
        }),
      ).toBe(false)
    })
  })

  describe('isIframeBridgeRequest', () => {
    it('iframe.ready 合法', () => {
      const msg: IframeBridgeRequest = { kind: 'iframe.ready', sessionId: 'sess' }
      expect(isIframeBridgeRequest(msg)).toBe(true)
    })

    it('iframe.workspace_changed 合法（paths 数组）', () => {
      const msg: IframeBridgeRequest = {
        kind: 'iframe.workspace_changed',
        paths: ['inputs/upstream.csv'],
      }
      expect(isIframeBridgeRequest(msg)).toBe(true)
    })

    it('iframe.session_state 合法', () => {
      const msg: IframeBridgeRequest = {
        kind: 'iframe.session_state',
        state: 'ready',
      }
      expect(isIframeBridgeRequest(msg)).toBe(true)
    })

    it('iframe.session_state state 非法 → false', () => {
      expect(
        isIframeBridgeRequest({ kind: 'iframe.session_state', state: 'flying' }),
      ).toBe(false)
    })

    it('iframe.workspace_changed paths 非数组 → false', () => {
      expect(
        isIframeBridgeRequest({ kind: 'iframe.workspace_changed', paths: 'inputs/x' }),
      ).toBe(false)
    })
  })

  describe('isParentBridgeResponse', () => {
    it('合法 response', () => {
      const msg: ParentBridgeResponse = {
        kind: 'response',
        requestId: 'r-1',
        ok: true,
        data: { foo: 'bar' },
      }
      expect(isParentBridgeResponse(msg)).toBe(true)
    })

    it('error 响应也合法', () => {
      const msg: ParentBridgeResponse = {
        kind: 'response',
        requestId: 'r-1',
        ok: false,
        error: { code: 'oops', message: '失败' },
      }
      expect(isParentBridgeResponse(msg)).toBe(true)
    })

    it('缺 requestId → false', () => {
      expect(isParentBridgeResponse({ kind: 'response', ok: true })).toBe(false)
    })

    it('ok 非 boolean → false', () => {
      expect(
        isParentBridgeResponse({ kind: 'response', requestId: 'r', ok: 'yes' }),
      ).toBe(false)
    })
  })
})
