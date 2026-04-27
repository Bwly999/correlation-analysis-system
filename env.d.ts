/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_TYPE: 'local' | 'server'
  readonly VITE_API_BASE_URL: string
  readonly VITE_WORKFLOW_AI_API_BASE_URL: string
  readonly VITE_WORKFLOW_API_AUTH_TOKEN?: string
  readonly VITE_WORKFLOW_USER_ID?: string
  readonly VITE_WORKFLOW_USER_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'element-plus/es/components/tree-v2/style/css'
