<script setup lang="ts">
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['save', 'discard', 'cancel'])
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="false"
    :style="{ width: '420px' }"
    @update:visible="(value) => !value && emit('cancel')"
  >
    <template #header>
      <div class="flex flex-col gap-1">
        <span class="text-base font-bold text-slate-900">当前工作流尚未保存</span>
        <span class="text-sm text-slate-500">继续操作会丢失当前修改，是否先保存？</span>
      </div>
    </template>

    <div class="flex justify-end gap-3 pt-2">
      <Button label="取消" severity="secondary" outlined @click="emit('cancel')" />
      <Button label="不保存" severity="contrast" @click="emit('discard')" />
      <Button label="保存并继续" @click="emit('save')" />
    </div>
  </Dialog>
</template>
