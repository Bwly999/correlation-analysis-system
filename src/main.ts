import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Aura from '@primevue/themes/aura'
import App from './App.vue'
import './style/main.css'
import Tooltip from 'primevue/tooltip'
import { initializeKanbanHostBridge } from '@/services/kanbanIntegration'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
initializeKanbanHostBridge()
if (window) (window as any).pinia = pinia
app.directive('tooltip', Tooltip)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: 'p',
      darkModeSelector: 'none',
      cssLayer: false,
    },
  },
})
app.use(ConfirmationService)
app.use(ToastService)

app.mount('#app')
