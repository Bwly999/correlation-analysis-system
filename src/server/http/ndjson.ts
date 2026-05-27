import type { ServerResponse } from 'node:http'

export const writeNdjsonEvent = (response: ServerResponse, event: unknown) => {
  response.write(`${JSON.stringify(event)}\n`)
}

export const startNdjsonStream = (
  response: ServerResponse,
  subscribe: (write: (event: unknown) => void) => (() => void) | null | undefined,
  statusCode = 200,
) => {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  response.setHeader('Cache-Control', 'no-cache, no-transform')

  let cleanedUp = false
  const unsubscribe = subscribe((event) => {
    writeNdjsonEvent(response, event)
  })

  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    unsubscribe?.()
    if (!response.writableEnded) {
      response.end()
    }
  }

  if (!unsubscribe) {
    cleanup()
    return cleanup
  }

  response.once('close', cleanup)
  return cleanup
}
