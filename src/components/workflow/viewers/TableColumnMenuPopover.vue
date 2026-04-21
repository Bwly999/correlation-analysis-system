<script setup lang="ts">
import { computed, shallowRef } from 'vue'

interface ColumnVisibilityOption {
  name: string
  value: string
  visible: boolean
}

const props = defineProps<{
  field: string
  left: number
  top: number
  pinned?: 'left' | 'right'
  columns: ColumnVisibilityOption[]
}>()

const emit = defineEmits<{
  close: []
  pinLeft: []
  pinRight: []
  unpin: []
  autoSizeCurrent: []
  autoSizeAll: []
  reset: []
  toggleColumnVisibility: [field: string, visible: boolean]
}>()

const isColumnChooserOpen = shallowRef(false)
const chooserKeyword = shallowRef('')
const menuZIndex = 1400

const filteredColumns = computed(() => {
  const keyword = chooserKeyword.value.trim().toLowerCase()
  if (!keyword) return props.columns
  return props.columns.filter((column) => column.name.toLowerCase().includes(keyword))
})

const toggleColumnVisibility = (field: string, visible: boolean) => {
  emit('toggleColumnVisibility', field, visible)
}
</script>

<template>
  <div
    data-test="table-column-menu"
    class="table-column-menu"
    :style="{ left: `${left}px`, top: `${top}px`, zIndex: menuZIndex }"
  >
    <div class="table-column-menu__section">
      <button
        type="button"
        class="table-column-menu__item"
        :class="{ 'table-column-menu__item--active': pinned === 'left' }"
        data-test="table-column-menu-pin-left"
        @click="emit('pinLeft')"
      >
        固定到左侧
      </button>
      <button
        type="button"
        class="table-column-menu__item"
        :class="{ 'table-column-menu__item--active': pinned === 'right' }"
        data-test="table-column-menu-pin-right"
        @click="emit('pinRight')"
      >
        固定到右侧
      </button>
      <button
        type="button"
        class="table-column-menu__item"
        data-test="table-column-menu-unpin"
        @click="emit('unpin')"
      >
        取消固定
      </button>
    </div>

    <div class="table-column-menu__divider" />

    <div class="table-column-menu__section">
      <button
        type="button"
        class="table-column-menu__item"
        data-test="table-column-menu-auto-size-current"
        @click="emit('autoSizeCurrent')"
      >
        自动调整当前列宽
      </button>
      <button
        type="button"
        class="table-column-menu__item"
        data-test="table-column-menu-auto-size-all"
        @click="emit('autoSizeAll')"
      >
        自动调整全部列宽
      </button>
    </div>

    <div class="table-column-menu__divider" />

    <div class="table-column-menu__section">
      <button
        type="button"
        class="table-column-menu__item"
        data-test="table-column-menu-toggle-columns"
        @click="isColumnChooserOpen = !isColumnChooserOpen"
      >
        选择列
      </button>
      <div v-if="isColumnChooserOpen" class="table-column-menu__chooser">
        <input
          v-model="chooserKeyword"
          class="table-column-menu__search"
          placeholder="搜索列名"
          type="text"
        />
        <div class="table-column-menu__chooser-list">
          <label
            v-for="column in filteredColumns"
            :key="column.value"
            class="table-column-menu__checkbox"
            :data-test="`table-column-menu-visibility-${column.value}`"
          >
            <input
              type="checkbox"
              :checked="column.visible"
              @change="toggleColumnVisibility(column.value, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ column.name }}</span>
          </label>
        </div>
      </div>

      <button
        type="button"
        class="table-column-menu__item"
        data-test="table-column-menu-reset"
        @click="emit('reset')"
      >
        恢复默认视图
      </button>
    </div>
  </div>
</template>

<style scoped>
.table-column-menu {
  position: fixed;
  width: 248px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);
  padding: 8px;
}

.table-column-menu__section {
  display: grid;
  gap: 4px;
}

.table-column-menu__divider {
  height: 1px;
  margin: 8px 4px;
  background: rgba(226, 232, 240, 0.95);
}

.table-column-menu__item {
  width: 100%;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  padding: 0 10px;
  cursor: pointer;
}

.table-column-menu__item:hover,
.table-column-menu__item--active {
  border-color: rgba(147, 197, 253, 0.45);
  background: #eff6ff;
  color: #1d4ed8;
}

.table-column-menu__chooser {
  display: grid;
  gap: 8px;
  padding: 8px 6px 2px;
}

.table-column-menu__search {
  width: 100%;
  height: 32px;
  border: 1px solid #d6dbe5;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  color: #0f172a;
  outline: none;
}

.table-column-menu__search:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.2);
}

.table-column-menu__chooser-list {
  max-height: 180px;
  overflow: auto;
  display: grid;
  gap: 4px;
}

.table-column-menu__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  border-radius: 8px;
  padding: 0 6px;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
}

.table-column-menu__checkbox:hover {
  background: #f8fafc;
}
</style>
