type DevApiApp = {
  ready: () => Promise<void>
  close: () => Promise<void>
  server: {
    emit: (event: 'request', request: NodeJS.ReadableStream, response: NodeJS.WritableStream & NodeJS.EventEmitter) => boolean
  }
}

export const createReusableDevApiHandler = (
  loadApp: () => Promise<DevApiApp>,
) => {
  let appTask: Promise<DevApiApp> | null = null

  const getApp = async () => {
    if (!appTask) {
      appTask = loadApp().then(async (app) => {
        await app.ready()
        return app
      })
    }

    return appTask
  }

  return {
    async handle(
      request: NodeJS.ReadableStream,
      response: NodeJS.WritableStream & NodeJS.EventEmitter,
    ) {
      const app = await getApp()
      app.server.emit('request', request, response)
    },

    async dispose() {
      if (!appTask) return

      const app = await appTask
      appTask = null
      await app.close()
    },
  }
}
