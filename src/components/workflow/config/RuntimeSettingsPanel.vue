<script setup lang="ts">
import ToggleSwitch from 'primevue/toggleswitch'

const props = defineProps<{
  isTrigger: boolean
  persistRuntimeInputs: boolean
  reuseLastRuntimeInputs: boolean
}>()

const emit = defineEmits<{
  'update:persistRuntimeInputs': [value: boolean]
  'update:reuseLastRuntimeInputs': [value: boolean]
  'reset-runtime-inputs': []
}>()

const updatePersistRuntimeInputs = (value: boolean) => {
  emit('update:persistRuntimeInputs', value)
}

const updateReuseLastRuntimeInputs = (value: boolean) => {
  emit('update:reuseLastRuntimeInputs', value)
}

const resetRuntimeInputs = () => {
  emit('reset-runtime-inputs')
}
</script>

<template>
  <div v-if="isTrigger" class="mx-auto max-w-3xl space-y-4">
    <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-900">允许保存启动参数</div>
          <p class="mt-1.5 text-[13px] leading-5 text-slate-500">
            {{
              persistRuntimeInputs
                ? '开启后，当前节点的普通启动参数会随工作流一起保存；文件型参数仍不会保存。'
                : '关闭后，当前节点的启动参数只在本次运行中使用，保存工作流时会自动清空。'
            }}
          </p>
        </div>
        <ToggleSwitch
          :model-value="persistRuntimeInputs"
          class="mt-0.5 shrink-0 !scale-[0.74]"
          @update:model-value="updatePersistRuntimeInputs"
        />
      </div>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-900">沿用上次启动参数</div>
          <p class="mt-1.5 text-[13px] leading-5 text-slate-500">
            {{
              reuseLastRuntimeInputs
                ? '开启后，当前节点下次运行会默认沿用本次确认过的启动参数。'
                : '关闭后，当前节点每次运行都会重新要求填写启动参数。'
            }}
          </p>
        </div>
        <ToggleSwitch
          :model-value="reuseLastRuntimeInputs"
          class="mt-0.5 shrink-0 !scale-[0.74]"
          @update:model-value="updateReuseLastRuntimeInputs"
        />
      </div>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-900">重置已保存启动参数</div>
          <p class="mt-1.5 text-[13px] leading-5 text-slate-500">
            立即清空当前节点已保存或已缓存的启动参数，并关闭沿用开关。下次运行会重新弹出参数填写。
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          @click="resetRuntimeInputs"
        >
          重置已保存启动参数
        </button>
      </div>
    </div>
  </div>

  <div
    v-else
    class="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center text-slate-400"
  >
    <div class="text-sm font-semibold text-slate-500">当前节点暂无运行设置</div>
    <p class="mt-1.5 text-[13px] leading-5">
      只有启动节点支持管理“沿用上次启动参数”和“重置已保存启动参数”。
    </p>
  </div>
</template>
