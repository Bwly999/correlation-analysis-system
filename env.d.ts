/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_TYPE: 'local' | 'server'
  readonly VITE_API_BASE_URL: string
  // 更多环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
