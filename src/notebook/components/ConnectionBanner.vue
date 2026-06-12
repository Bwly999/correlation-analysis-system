<script setup lang="ts">
/**
 * ConnectionBanner.vue
 *
 * §8.4 网络中断横幅：iframe 顶部显示，重连成功后消失。
 */
import { computed } from 'vue'
import { WifiOff, RotateCw } from 'lucide-vue-next'

const props = defineProps<{
  state: 'online' | 'reconnecting' | 'offline'
}>()

const visible = computed(() => props.state !== 'online')
</script>

<template>
  <transition name="banner">
    <div
      v-if="visible"
      class="flex h-7 items-center justify-center gap-2 border-b text-[11.5px]"
      :style="
        state === 'reconnecting'
          ? {
              borderColor: 'rgba(197, 139, 63, 0.35)',
              backgroundColor: 'var(--nb-amber-soft)',
              color: '#7C5A28',
            }
          : {
              borderColor: 'rgba(184, 84, 80, 0.35)',
              backgroundColor: 'var(--nb-clay-soft)',
              color: '#8B3A37',
            }
      "
    >
      <RotateCw v-if="state === 'reconnecting'" :size="11" :stroke-width="1.8" class="animate-spin" />
      <WifiOff v-else :size="11" :stroke-width="1.8" />
      <span class="nb-mono" style="letter-spacing: 0.06em; font-weight: 600;">
        {{ state === 'reconnecting' ? '服务连接中断，正在重连…' : '已离线，部分功能不可用' }}
      </span>
    </div>
  </transition>
</template>

<style scoped>
.banner-enter-active,
.banner-leave-active {
  transition: all 0.22s ease;
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
