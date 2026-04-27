import { errors, jwtVerify, type JWTPayload } from 'jose'
import {
  WORKFLOW_USER_ID_HEADER,
  WORKFLOW_USER_NAME_HEADER,
  resolveSingleHeaderValue,
  type WorkflowRequestHeaders,
} from '../http/workflowHeaders.js'

export interface JwtAuthUser {
  id: string
  name: string
}

export interface JwtAuthResult {
  enabled: boolean
  user?: JwtAuthUser
}

export interface JwtAuthGuard {
  authenticate(headers: WorkflowRequestHeaders): Promise<JwtAuthResult>
}

export interface JwtAuthGuardOptions {
  secret?: string
  now?: () => number
}

type JwtPayload = {
  w3Account?: unknown
  cnName?: unknown
} & JWTPayload

const createUnauthorizedError = (message: string) => {
  const error = new Error(message)
  ;(error as Error & { statusCode: number }).statusCode = 401
  return error
}

const resolveBearerToken = (headers: WorkflowRequestHeaders) => {
  const value =
    resolveSingleHeaderValue(headers.authorization) ??
    resolveSingleHeaderValue(headers.Authorization)
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim()
}

const resolveUser = (payload: JwtPayload): JwtAuthUser => {
  const id = typeof payload.w3Account === 'string' ? payload.w3Account.trim() : ''
  if (!id) {
    throw createUnauthorizedError('JWT 缺少用户标识 w3Account')
  }

  const name = typeof payload.cnName === 'string' && payload.cnName.trim()
    ? payload.cnName.trim()
    : id

  return { id, name }
}

const mapJoseError = (error: unknown) => {
  if (error instanceof errors.JWTExpired) {
    return createUnauthorizedError('JWT 已过期')
  }
  if (error instanceof errors.JWTClaimValidationFailed && error.claim === 'nbf') {
    return createUnauthorizedError('JWT 尚未生效')
  }
  if (error instanceof errors.JOSEAlgNotAllowed) {
    return createUnauthorizedError('JWT 仅支持 HS256 算法')
  }
  return createUnauthorizedError('JWT 签名校验失败')
}

export const createJwtAuthGuard = (
  options: JwtAuthGuardOptions = {},
): JwtAuthGuard => {
  const secret = options.secret ?? process.env.WORKFLOW_JWT_SECRET?.trim() ?? ''
  const now = options.now ?? (() => Date.now())

  return {
    async authenticate(headers) {
      if (!secret) {
        return { enabled: false }
      }

      const token = resolveBearerToken(headers)
      if (!token) {
        throw createUnauthorizedError('缺少 Authorization Bearer token')
      }

      let payload: JwtPayload
      try {
        const result = await jwtVerify(token, new TextEncoder().encode(secret), {
          algorithms: ['HS256'],
          currentDate: new Date(now()),
        })
        payload = result.payload as JwtPayload
      } catch (error) {
        throw mapJoseError(error)
      }

      const user = resolveUser(payload)
      headers[WORKFLOW_USER_ID_HEADER] = user.id
      headers[WORKFLOW_USER_NAME_HEADER] = user.name
      return { enabled: true, user }
    },
  }
}
