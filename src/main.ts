import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import App from './App.vue'
import './style/main.css'
import Tooltip from 'primevue/tooltip'

const app = createApp(App)

app.use(createPinia())
app.directive('tooltip', Tooltip)
app.use(PrimeVue, {
    theme: {
        preset: Aura,
        options: {
            prefix: 'p',
            darkModeSelector: 'none',
            cssLayer: false
        }
    }
})

app.mount('#app')
