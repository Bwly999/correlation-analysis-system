/**
 * Notebook 主入口（PoC v0）。
 *
 * 该入口独立于主站 Vue 应用，不挂 PrimeVue / pinia / 路由，
 * 保持极小依赖。M1 再按需补全。
 */
import { createApp } from 'vue'
import App from './App.vue'
import '../style/main.css'

createApp(App).mount('#notebook-root')
