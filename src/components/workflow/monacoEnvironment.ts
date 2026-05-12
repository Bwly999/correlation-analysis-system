import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

type MonacoWorkerFactory = {
  getWorker?: (workerId: string, label: string) => Worker
}

const resolveWorker = (label: string) => {
  if (label === 'json') {
    return new jsonWorker()
  }

  if (label === 'typescript' || label === 'javascript') {
    return new tsWorker()
  }

  return new editorWorker()
}

export const ensureMonacoEnvironment = () => {
  const environment = (globalThis as typeof globalThis & {
    MonacoEnvironment?: MonacoWorkerFactory
  }).MonacoEnvironment

  if (environment?.getWorker) {
    return
  }

  ;(globalThis as typeof globalThis & {
    MonacoEnvironment: MonacoWorkerFactory
  }).MonacoEnvironment = {
    ...(environment ?? {}),
    getWorker: (_workerId: string, label: string) => resolveWorker(label),
  }
}
