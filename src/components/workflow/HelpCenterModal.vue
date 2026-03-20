<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BookOpenText, HelpCircle, Network, ArrowLeft } from 'lucide-vue-next'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { helpCenterContent } from '@/help/content'
import { nodeDefinitions } from '@/nodes/registry'
import NodeHelpPanel from './help/NodeHelpPanel.vue'
import QuickStartGuide from './help/QuickStartGuide.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits(['close'])

const selectedCategory = ref<'trigger' | 'action' | 'terminal' | null>(null)
const selectedNodeType = ref<string | null>(null)

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      selectedCategory.value = null
      selectedNodeType.value = null
    }
  },
)

const selectedNodeDefinition = computed(() =>
  nodeDefinitions.find((definition) => definition.name === selectedNodeType.value) ?? null,
)

const groupedNodes = computed(() =>
  helpCenterContent.categories.map((category) => ({
    ...category,
    nodes: nodeDefinitions.filter((definition) => definition.category === category.id),
  })),
)

const activeCategoryGroup = computed(() =>
  groupedNodes.value.find((group) => group.id === selectedCategory.value) ?? null,
)

const openCategory = (categoryId: 'trigger' | 'action' | 'terminal') => {
  selectedCategory.value = categoryId
  selectedNodeType.value = null
}

const openNode = (nodeType: string) => {
  selectedNodeType.value = nodeType
}

const goBack = () => {
  if (selectedNodeType.value) {
    selectedNodeType.value = null
    return
  }
  selectedCategory.value = null
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="false"
    class="help-center-dialog"
    :style="{ width: 'min(1180px, 94vw)', height: 'min(860px, 88vh)' }"
    @update:visible="emit('close')"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <BookOpenText :size="20" />
          </div>
          <div>
            <div class="text-lg font-semibold text-slate-900">帮助中心</div>
            <p class="mt-1 text-sm text-slate-500">先看最短上手流程，再按节点查具体说明。</p>
          </div>
        </div>
        <Button severity="secondary" text class="cursor-pointer" @click="emit('close')">
          关闭
        </Button>
      </div>
    </template>

    <div class="flex h-full flex-col overflow-hidden border-t border-slate-200 bg-slate-50 -mx-6">
      <div class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div class="flex items-center gap-3">
          <button
            v-if="selectedCategory || selectedNodeType"
            class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            @click="goBack"
          >
            <ArrowLeft :size="16" />
            返回
          </button>
          <div>
            <div class="text-sm font-semibold text-slate-900">
              {{
                selectedNodeDefinition?.displayName ||
                activeCategoryGroup?.title ||
                '3 分钟上手'
              }}
            </div>
            <div class="mt-1 text-xs text-slate-500">
              {{
                selectedNodeDefinition?.help?.summary ||
                activeCategoryGroup?.description ||
                '固定三步模板，帮助你从导入到输出快速走通一次分析流程。'
              }}
            </div>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-6 py-6">
        <template v-if="selectedNodeDefinition">
          <NodeHelpPanel :node-definition="selectedNodeDefinition" />
        </template>

        <template v-else-if="activeCategoryGroup">
          <section class="rounded-3xl border border-slate-200 bg-white p-5">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Network :size="18" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-slate-900">{{ activeCategoryGroup.title }}</h3>
                <p class="mt-1 text-sm leading-6 text-slate-500">{{ activeCategoryGroup.description }}</p>
              </div>
            </div>

            <div class="mt-5 grid gap-3 lg:grid-cols-2">
              <button
                v-for="node in activeCategoryGroup.nodes"
                :key="node.name"
                class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
                @click="openNode(node.name)"
              >
                <div class="text-sm font-semibold text-slate-900">{{ node.displayName }}</div>
                <p class="mt-2 text-sm leading-6 text-slate-600">{{ node.help?.summary || node.description }}</p>
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="space-y-8">
            <div class="rounded-[32px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6">
              <div class="mb-5 flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <BookOpenText :size="18" />
                </div>
                <div>
                  <h3 class="text-xl font-semibold text-slate-900">3 分钟上手</h3>
                  <p class="mt-1 text-sm text-slate-500">按固定三步先跑通一条最短分析链路。</p>
                </div>
              </div>
              <QuickStartGuide :steps="helpCenterContent.quickStart" />
            </div>

            <div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <section class="rounded-3xl border border-slate-200 bg-white p-5">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <HelpCircle :size="18" />
                  </div>
                  <div>
                    <h3 class="text-base font-semibold text-slate-900">常见问题</h3>
                    <p class="mt-1 text-sm text-slate-500">先看这些高频问题，能解决大多数第一次使用时的困惑。</p>
                  </div>
                </div>

                <div class="mt-5 space-y-3">
                  <div
                    v-for="faq in helpCenterContent.faqs"
                    :key="faq.question"
                    class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div class="text-sm font-semibold text-slate-900">{{ faq.question }}</div>
                    <p class="mt-2 text-sm leading-6 text-slate-600">{{ faq.answer }}</p>
                  </div>
                </div>
              </section>

              <section class="rounded-3xl border border-slate-200 bg-white p-5">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <Network :size="18" />
                  </div>
                  <div>
                    <h3 class="text-base font-semibold text-slate-900">按节点分类查帮助</h3>
                    <p class="mt-1 text-sm text-slate-500">点击分类后继续看节点摘要，再进入节点详情。</p>
                  </div>
                </div>

                <div class="mt-5 space-y-3">
                  <button
                    v-for="group in groupedNodes"
                    :key="group.id"
                    class="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
                    @click="openCategory(group.id)"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <div class="text-sm font-semibold text-slate-900">{{ group.title }}</div>
                        <p class="mt-2 text-sm leading-6 text-slate-600">{{ group.description }}</p>
                      </div>
                      <span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                        {{ group.nodes.length }} 个节点
                      </span>
                    </div>
                  </button>
                </div>
              </section>
            </div>
          </section>
        </template>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
:deep(.help-center-dialog .p-dialog-content) {
  padding-top: 0 !important;
  height: calc(100% - 84px);
}
</style>
