<script setup lang="ts">
/**
 * UserMessageBlock.vue
 *
 * 用户发出的消息块。视觉：右对齐的墨色卡片（像钢笔批注盖在稿纸上），
 * 顶部一个铜色「YOU」眉签提示来源。
 *
 * 配色选择：用深墨色而非铜色底——铜色是品牌强调色，留给 ask_user、
 * 选中态等真正需要吸引注意力的元素；用户消息用高对比深底，
 * 视觉上"实在、已确定"，区别于 assistant 的流动正文。
 *
 * 随消息上传的附件渲染为卡片下方的文件 chip（文件名 + 大小），点击 emit openInTree
 * 让父级在文件树选中并预览。
 */
import { Paperclip } from 'lucide-vue-next'
import FileIcon from './FileIcon.vue'
import type { UserMessage } from '../types/messageStream'

const props = defineProps<{ message: UserMessage }>()

const emit = defineEmits<{
  openInTree: [path: string]
}>()

const sizeLabel = (bytes: number) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const hasAttachments = () => props.message.attachments && props.message.attachments.length > 0
</script>

<template>
  <div class="flex justify-end">
    <div class="flex max-w-[78%] flex-col items-end">
      <div
        class="nb-eyebrow mb-1.5 flex items-center gap-1.5"
        style="font-size: 9px; letter-spacing: 0.28em;"
      >
        <span class="h-px w-6" style="background-color: var(--nb-copper); opacity: 0.55;" />
        <span style="color: var(--nb-copper-deep);">YOU</span>
      </div>
      <div
        class="rounded-[var(--nb-radius-md)] rounded-br-[var(--nb-radius-xs)] px-4 py-3"
        style="
          background-color: var(--nb-ink);
          color: var(--nb-paper);
          box-shadow: var(--nb-shadow-md);
        "
      >
        <p
          v-if="message.text"
          class="whitespace-pre-wrap text-[13.5px] leading-[1.7]"
          style="font-feature-settings: 'cv11';"
        >
          {{ message.text }}
        </p>
        <!-- 附件 chip：浅色底，与墨色卡片形成层次 -->
        <div
          v-if="hasAttachments()"
          class="mt-2 flex flex-wrap gap-1.5"
          :class="message.text ? 'pt-2 border-t' : ''"
          :style="message.text ? { borderColor: 'rgba(245, 241, 232, 0.15)' } : {}"
        >
          <button
            v-for="att in message.attachments"
            :key="att.id"
            class="group inline-flex items-center gap-1.5 rounded-[var(--nb-radius-xs)] py-1 pl-1.5 pr-2 transition"
            style="background-color: rgba(245, 241, 232, 0.1);"
            :title="`在文件树中查看 ${att.path}`"
            @click="emit('openInTree', att.path)"
            @mouseenter="(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245, 241, 232, 0.2)'
            }"
            @mouseleave="(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245, 241, 232, 0.1)'
            }"
          >
            <FileIcon :name="att.name" :size="13" />
            <span
              class="max-w-[160px] truncate text-[11.5px]"
              style="color: var(--nb-paper);"
            >
              {{ att.name }}
            </span>
            <span
              v-if="att.size"
              class="nb-mono text-[10px] tabular-nums"
              style="color: rgba(245, 241, 232, 0.6);"
            >
              {{ sizeLabel(att.size) }}
            </span>
            <Paperclip
              :size="10"
              :stroke-width="1.6"
              style="color: rgba(245, 241, 232, 0.45);"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
