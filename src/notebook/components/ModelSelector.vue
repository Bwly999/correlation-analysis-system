<script setup lang="ts">
/**
 * ModelSelector.vue
 *
 * 内嵌于 MessageInput 底部工具栏左侧的模型选择器。
 *
 * 交互：
 *   - 点击当前模型名展开下拉，列出所有可用模型（后台 env + 用户自定义）
 *   - 选中一个 → emit switch（父级调 switch-model 端点）
 *   - 下拉底部「+ 添加自定义模型」→ emit add（父级弹 ModelProfileDialog）
 *   - 每个自定义模型 hover 显示编辑/删除入口
 *
 * 状态由父级持有（availableModels / currentModelId），本组件纯展示 + emit。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, Plus, Settings2, Trash2 } from 'lucide-vue-next'
import type { NotebookModelProfile } from '../runtime/notebookAgentClient'

const props = defineProps<{
  /** 可用模型列表（后台 + 用户自定义） */
  availableModels: NotebookModelProfile[]
  /** 当前会话使用的模型 id */
  currentModelId?: string
  /** 当前会话使用的模型显示名（由 session.model_changed 事件更新） */
  currentModelName?: string
  /** 切换进行中（禁用下拉） */
  switching?: boolean
}>()

const emit = defineEmits<{
  switch: [profileId: string]
  add: []
  edit: [profile: NotebookModelProfile]
  remove: [profile: NotebookModelProfile]
}>()

/** Auto 路由虚拟 profileId，与后端 gateway MODEL_AUTO_ID 保持一致 */
const MODEL_AUTO_ID = 'auto'

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const currentName = computed(() => props.currentModelName || currentProfile.value?.name || '默认模型')

const currentProfile = computed(
  () => props.availableModels.find((m) => m.id === props.currentModelId) ?? null,
)

const formatK = (n?: number) => (n && n >= 1000 ? `${Math.round(n / 1000)}k` : String(n ?? '?'))

const toggle = () => {
  open.value = !open.value
}

const close = () => {
  open.value = false
}

const onSelect = (profile: NotebookModelProfile) => {
  if (profile.id === props.currentModelId) {
    close()
    return
  }
  emit('switch', profile.id)
  close()
}

const onSelectAuto = () => {
  if (MODEL_AUTO_ID === props.currentModelId) {
    close()
    return
  }
  emit('switch', MODEL_AUTO_ID)
  close()
}

const onAdd = () => {
  close()
  emit('add')
}

const onEdit = (profile: NotebookModelProfile) => {
  close()
  emit('edit', profile)
}

const onRemove = (profile: NotebookModelProfile) => {
  close()
  emit('remove', profile)
}

// 点外部关闭
const onDocClick = (event: MouseEvent) => {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    close()
  }
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="nb-focus inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
      style="color: var(--nb-ink-mute);"
      :title="`当前模型：${currentName}`"
      :disabled="switching"
      @click="toggle"
      @mouseenter="(e) => {
        if (!switching) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-copper-soft)';
          (e.currentTarget as HTMLElement).style.color = 'var(--nb-copper-deep)'
        }
      }"
      @mouseleave="(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = '';
        (e.currentTarget as HTMLElement).style.color = 'var(--nb-ink-mute)'
      }"
    >
      <span class="max-w-[120px] truncate">{{ currentName }}</span>
      <ChevronDown
        :size="11"
        :stroke-width="2"
        class="transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <!-- 下拉面板 -->
    <transition name="nb-pop">
      <div
        v-if="open"
        class="absolute bottom-[calc(100%+6px)] left-0 z-[1200] w-[280px] overflow-hidden rounded-[3px] border"
        style="
          background-color: var(--nb-card);
          border-color: var(--nb-rule-strong);
          box-shadow: 0 16px 40px -12px rgba(42, 40, 37, 0.35);
        "
      >
        <!-- 模型列表 -->
        <div class="max-h-[280px] overflow-y-auto py-1">
          <!-- Auto（自动）虚拟项：仅 Notebook Agent，会话不绑定具体模型，由后端 Auto 路由扩展动态选空闲模型 -->
          <button
            type="button"
            class="group flex w-full items-start gap-2 px-3 py-2 text-left transition"
            :style="MODEL_AUTO_ID === currentModelId
              ? { backgroundColor: 'var(--nb-copper-soft)' }
              : {}"
            @click="onSelectAuto"
            @mouseenter="(e) => {
              if (MODEL_AUTO_ID !== currentModelId) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-overlay)'
            }"
            @mouseleave="(e) => {
              if (MODEL_AUTO_ID !== currentModelId) (e.currentTarget as HTMLElement).style.backgroundColor = ''
            }"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span
                  class="truncate text-[12.5px] font-medium"
                  :style="{ color: MODEL_AUTO_ID === currentModelId ? 'var(--nb-copper-deep)' : 'var(--nb-ink)' }"
                >
                  Auto（自动）
                </span>
                <span
                  class="shrink-0 rounded-[2px] px-1 py-px text-[9px] font-medium"
                  style="background-color: var(--nb-rule); color: var(--nb-ink-faint);"
                >
                  推荐
                </span>
              </div>
              <div
                class="mt-0.5 truncate text-[10.5px]"
                style="color: var(--nb-ink-faint);"
              >
                自动选择当前空闲模型，避开繁忙
              </div>
            </div>
          </button>
          <button
            v-for="model in availableModels"
            :key="model.id"
            type="button"
            class="group flex w-full items-start gap-2 px-3 py-2 text-left transition"
            :style="model.id === currentModelId
              ? { backgroundColor: 'var(--nb-copper-soft)' }
              : {}"
            @click="onSelect(model)"
            @mouseenter="(e) => {
              if (model.id !== currentModelId) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-overlay)'
            }"
            @mouseleave="(e) => {
              if (model.id !== currentModelId) (e.currentTarget as HTMLElement).style.backgroundColor = ''
            }"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span
                  class="truncate text-[12.5px] font-medium"
                  :style="{ color: model.id === currentModelId ? 'var(--nb-copper-deep)' : 'var(--nb-ink)' }"
                >
                  {{ model.name }}
                </span>
                <span
                  v-if="model.source === 'system'"
                  class="shrink-0 rounded-[2px] px-1 py-px text-[9px] font-medium"
                  style="background-color: var(--nb-rule); color: var(--nb-ink-faint);"
                >
                  内置
                </span>
              </div>
              <div
                class="mt-0.5 truncate text-[10.5px] tabular-nums"
                style="color: var(--nb-ink-faint);"
              >
                {{ model.model }} · {{ formatK(model.contextWindow) }} 上下文
              </div>
            </div>
            <!-- 自定义模型：hover 显示编辑/删除 -->
            <div
              v-if="model.source === 'custom'"
              class="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100"
              @click.stop
            >
              <button
                type="button"
                class="nb-focus inline-flex h-6 w-6 items-center justify-center rounded-[2px]"
                style="color: var(--nb-ink-faint);"
                title="编辑"
                @click="onEdit(model)"
              >
                <Settings2 :size="12" :stroke-width="1.8" />
              </button>
              <button
                type="button"
                class="nb-focus inline-flex h-6 w-6 items-center justify-center rounded-[2px]"
                style="color: var(--nb-ink-faint);"
                title="删除"
                @click="onRemove(model)"
              >
                <Trash2 :size="12" :stroke-width="1.8" />
              </button>
            </div>
          </button>
        </div>

        <!-- 添加按钮 -->
        <div
          class="border-t"
          style="border-color: var(--nb-rule);"
        >
          <button
            type="button"
            class="nb-focus flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition"
            style="color: var(--nb-copper-deep);"
            @click="onAdd"
            @mouseenter="(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--nb-copper-soft)' }"
            @mouseleave="(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '' }"
          >
            <Plus :size="13" :stroke-width="2" />
            添加自定义模型
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.nb-pop-enter-active,
.nb-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.nb-pop-enter-from,
.nb-pop-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
