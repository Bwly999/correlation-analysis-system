// @vitest-environment node

import { createHmac } from 'node:crypto'
import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { createJwtAuthGuard } from '../auth/jwtAuth.js'

const base64UrlEncode = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
    .toString('base64url')

const createToken = (
  payload: Record<string, unknown>,
  secret = 'test-secret',
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
) => {
  const signingInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url')
  return `${signingInput}.${signature}`
}

describe('jwt auth guard', () => {
  it('validates an HS256 token and resolves the storage user from business claims', async () => {
    const guard = createJwtAuthGuard({
      secret: 'test-secret',
      now: () => 1_700_000_000_000,
    })
    const token = createToken({
      w3Account: 'w3-user-1',
      cnName: '测试用户',
      exp: 1_700_000_060,
    })
    const headers: Record<string, string | string[] | undefined> = {
      authorization: `Bearer ${token}`,
      'x-workflow-user-id': 'spoofed-user',
    }

    const result = await guard.authenticate(headers)

    expect(result.enabled).toBe(true)
    expect(result.user).toEqual({
      id: 'w3-user-1',
      name: '测试用户',
    })
    expect(headers['x-workflow-user-id']).toBe('w3-user-1')
    expect(headers['x-workflow-user-name']).toBe('测试用户')
  })

  it('validates a token signed by jose SignJWT', async () => {
    const guard = createJwtAuthGuard({
      secret: 'test-secret',
      now: () => 1_700_000_000_000,
    })
    const token = await new SignJWT({
      w3Account: 'jose-user-1',
      cnName: 'JOSE 用户',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(1_700_000_060)
      .sign(new TextEncoder().encode('test-secret'))

    await expect(guard.authenticate({ authorization: `Bearer ${token}` })).resolves.toEqual({
      enabled: true,
      user: {
        id: 'jose-user-1',
        name: 'JOSE 用户',
      },
    })
  })

  it('rejects requests without a bearer token when auth is enabled', async () => {
    const guard = createJwtAuthGuard({
      secret: 'test-secret',
      now: () => 1_700_000_000_000,
    })

    await expect(guard.authenticate({})).rejects.toThrow('缺少 Authorization Bearer token')
  })

  it('rejects tokens with invalid signatures', async () => {
    const guard = createJwtAuthGuard({
      secret: 'test-secret',
      now: () => 1_700_000_000_000,
    })
    const token = createToken({
      w3Account: 'w3-user-1',
      cnName: '测试用户',
      exp: 1_700_000_060,
    }, 'wrong-secret')

    await expect(guard.authenticate({ authorization: `Bearer ${token}` })).rejects.toThrow('JWT 签名校验失败')
  })

  it('rejects expired tokens', async () => {
    const guard = createJwtAuthGuard({
      secret: 'test-secret',
      now: () => 1_700_000_000_000,
    })
    const token = createToken({
      w3Account: 'w3-user-1',
      cnName: '测试用户',
      exp: 1_699_999_999,
    })

    await expect(guard.authenticate({ authorization: `Bearer ${token}` })).rejects.toThrow('JWT 已过期')
  })

  it('rejects tokens without the w3Account claim', async () => {
    const guard = createJwtAuthGuard({
      secret: 'test-secret',
      now: () => 1_700_000_000_000,
    })
    const token = createToken({
      cnName: '测试用户',
      exp: 1_700_000_060,
    })

    await expect(guard.authenticate({ authorization: `Bearer ${token}` })).rejects.toThrow('JWT 缺少用户标识')
  })

  it('does not block requests when no secret is configured', async () => {
    const guard = createJwtAuthGuard({
      secret: '',
      now: () => 1_700_000_000_000,
    })

    await expect(guard.authenticate({})).resolves.toEqual({ enabled: false })
  })
})
