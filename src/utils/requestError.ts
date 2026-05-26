type RequestErrorOptions = {
  fallbackMessage: string
  networkErrorMessage?: string
}

type ResponseDataLike = {
  status: number
  data?: unknown
}

export class RequestError extends Error {
  statusCode?: number
  cause?: unknown

  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(message)
    this.name = 'RequestError'
    this.statusCode = options?.statusCode
    this.cause = options?.cause
  }
}

const extractMessageFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null

  const candidateKeys = ['detail', 'message', 'error']
  for (const key of candidateKeys) {
    const value = (payload as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

const extractMessageFromResponseData = (payload: unknown): string | null => {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }

  return extractMessageFromPayload(payload)
}

export const buildRequestErrorFromResponseData = (
  response: ResponseDataLike,
  options: RequestErrorOptions,
) => {
  const message = extractMessageFromResponseData(response.data)

  return new RequestError(message || options.fallbackMessage, {
    statusCode: response.status,
  })
}

export const buildRequestErrorFromResponse = async (
  response: Response,
  options: RequestErrorOptions,
) => {
  try {
    const rawText = await response.text()
    const data = rawText.trim()
      ? (() => {
          try {
            return JSON.parse(rawText)
          } catch {
            return rawText.trim()
          }
        })()
      : ''

    return buildRequestErrorFromResponseData(
      {
        status: response.status,
        data,
      },
      options,
    )
  } catch {
    return new RequestError(options.fallbackMessage, {
      statusCode: response.status,
    })
  }
}

export const buildRequestErrorFromUnknown = (
  error: unknown,
  options: RequestErrorOptions,
) => {
  if (error instanceof RequestError) {
    return error
  }

  const message = options.networkErrorMessage || getErrorMessage(error, options.fallbackMessage)
  return new RequestError(message, { cause: error })
}

export const getErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  return fallbackMessage
}
