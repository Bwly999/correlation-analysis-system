<script setup lang="ts">
/**
 * ConnectionBanner.vue
 *
 * §8.4 网络中断横幅：iframe 顶部显示，重连成功后消失。
 *
 * 极简横条，不夺视觉焦点；仅在 reconnecting/offline 时出现。
 */
import { computed } from 'vue'
import { Wifi, WifiOff, RotateCw } from 'lucide-vue-next'

const props = defineProps<{
  state: 'online' | 'reconnecting' | 'offline'
}>()

const visible = computed(() => props.state !== 'online')
</script>

<template>
  <transition name="banner">
    <div
      v-if="visible"
      class="flex h-7 items-center justify-center gap-2 text-[11.5px] font-medium tracking-tight"
      :class="
        state === 'reconnecting'
          ? 'border-b border-amber-200 bg-amber-50 text-amber-800'
          : 'border-b border-rose-200 bg-rose-50 text-rose-800'
      "
    >
      <RotateCw v-if="state === 'reconnecting'" :size="12" class="animate-spin" />
      <WifiOff v-else :size="12" />
      <Wifi v-if="state === 'reconnecting'" :size="12" class="opacity-60" />
      <span>
        {{ state === 'reconnecting' ? '服务连接中断，正在重连…' : '已离线，部分功能不可用' }}
      </span>
    </div>
  </transition>
</template>

<style scoped>
.banner-enter-active,
.banner-leave-active {
  transition: all 0.2s ease;
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
