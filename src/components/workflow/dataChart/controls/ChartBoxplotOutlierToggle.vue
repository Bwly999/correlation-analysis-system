<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    data-test="boxplot-outlier-toggle"
    class="boxplot-outlier-toggle"
    :class="{ 'boxplot-outlier-toggle--active': model }"
    :data-state="model ? 'active' : 'inactive'"
    type="button"
    @click="model = !model"
  >
    {{ model ? '隐藏离群点' : '显示离群点' }}
  </button>
</template>

<style scoped>
.boxplot-outlier-toggle {
  position: absolute;
  right: 178px;
  top: 12px;
  z-index: 20;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.95);
  color: #475569;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(8px);
  cursor: pointer;
  pointer-events: auto;
}

.boxplot-outlier-toggle--active {
  border-color: #cbd5e1;
  background: #0f172a;
  color: #ffffff;
}
</style>
