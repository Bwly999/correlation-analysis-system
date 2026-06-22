/**
 * Notebook 主入口（PoC v0）。
 *
 * 该入口独立于主站 Vue 应用，不挂 PrimeVue / pinia / 路由，
 * 保持极小依赖。M1 再按需补全。
 */
import { createApp } from 'vue'
import App from './App.vue'
import '../style/main.css'
import './style/notebook.css'

createApp(App).mount('#notebook-root')

// 注册 Service Worker（仅生产构建；缓存 Pyodide 运行时，热启动 <=5s）
// dev 下不走 SW：vite serve 用 pyodideStaticProxy 中间件直接服务，无需缓存层
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      // base 子路径部署下：SW 脚本与 scope 都随 base 走（/workflow/notebook-sw.js，scope=/workflow/）。
      // SW 最大 scope 受限于脚本所在目录，scope 必须与 base 一致，否则无法接管 /workflow/notebook.html。
      .register(`${import.meta.env.BASE_URL}notebook-sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // SW 注册失败不阻塞笔记本主功能（只是少了缓存，每次重下 pyodide）
      })
  })
}
