/**
 * Notebook Worker 工厂。
 *
 * 单独放一个文件的原因：vite 的 ?worker import 是构建期魔法，
 * 在 vitest / node 环境下需要解析 worker 入口源文件，
 * 这给单测带来不必要的副作用。
 *
 * WorkerHost 默认调 createDefaultWorker；测试时可注入 mock factory。
 */

import NotebookWorker from '../worker/worker?worker'

export type WorkerFactory = () => Worker

export const createDefaultWorker: WorkerFactory = () =>
  new NotebookWorker({ name: 'notebook-pyodide' })
