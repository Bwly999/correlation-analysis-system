type RequestErrorOptions = {
  fallbackMessage: string
  networkErrorMessage?: string
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

export const buildRequestErrorFromResponse = async (
  response: Response,
  options: RequestErrorOptions,
) => {
  let message: string | null = null

  try {
    const rawText = await response.text()
    if (rawText.trim()) {
      try {
        message = extractMessageFromPayload(JSON.parse(rawText))
      } catch {
        message = rawText.trim()
      }
    }
  } catch {
    message = null
  }

  return new RequestError(message || options.fallbackMessage, {
    statusCode: response.status,
  })
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
