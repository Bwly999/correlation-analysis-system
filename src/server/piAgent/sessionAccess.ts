const createSessionAccessError = (statusCode: number, message: string) => {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

export const createSessionNotFoundError = (message: string) =>
  createSessionAccessError(404, message)

export const createSessionForbiddenError = (message: string) =>
  createSessionAccessError(403, message)

export const assertSessionOwner = (options: {
  sessionId: string
  currentUserId: string
  resolveOwnerId: (sessionId: string) => string | null
  missingMessage: string
  forbiddenMessage: string
}) => {
  const ownerId = options.resolveOwnerId(options.sessionId)
  if (!ownerId) {
    throw createSessionNotFoundError(options.missingMessage)
  }

  if (ownerId !== options.currentUserId) {
    throw createSessionForbiddenError(options.forbiddenMessage)
  }
}
