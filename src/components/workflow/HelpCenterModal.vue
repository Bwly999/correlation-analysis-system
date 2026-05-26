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
    :style="{ width: 'min(1400px, 96vw)', height: 'min(920px, 92vh)' }"
    @update:visible="emit('close')"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-white shadow-lg">
            <BookOpenText :size="28" />
          </div>
          <div>
            <div class="text-2xl font-black uppercase tracking-tighter text-slate-900 leading-none">帮助中心 / Help Center</div>
            <p class="mt-1.5 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Documentation & Intelligence Systems</p>
          </div>
        </div>
        <Button severity="secondary" text class="cursor-pointer font-black uppercase tracking-widest text-[10px]" @click="emit('close')">
          [ Close / 关闭 ]
        </Button>
      </div>
    </template>

    <div class="flex h-full flex-col overflow-hidden border-t-4 border-slate-900 bg-slate-50 -mx-6 relative">
      <!-- Background Grid Decoration -->
      <div class="absolute inset-0 opacity-[0.03] pointer-events-none z-0" style="background-image: radial-gradient(#000 1px, transparent 1px); background-size: 24px 24px;"></div>

      <!-- Breadcrumb / Sub-header -->
      <div class="relative z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md px-8 py-4">
        <div class="flex items-center gap-6">
          <button
            v-if="selectedCategory || selectedNodeType"
            class="inline-flex h-10 items-center gap-2 rounded bg-slate-900 px-4 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-600 shadow-lg shadow-slate-900/20"
            @click="goBack"
          >
            <ArrowLeft :size="14" />
            Back / 返回
          </button>
          <div class="flex flex-col">
            <div class="text-[9px] font-black uppercase tracking-[0.3em] text-blue-600 mb-0.5">Navigation Path</div>
            <div class="text-base font-black text-slate-900 flex items-center gap-2">
              <span class="opacity-20">/</span>
              {{
                selectedNodeDefinition?.displayName ||
                activeCategoryGroup?.title ||
                '3 分钟上手 / Quick Start'
              }}
            </div>
          </div>
        </div>
        <div class="hidden lg:flex items-center gap-4">
           <div class="h-8 w-[1px] bg-slate-200"></div>
           <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">
             Build <span class="text-slate-900">2026.05.07</span>
           </div>
        </div>
      </div>

      <div class="relative z-10 flex-1 overflow-y-auto px-8 py-8">
        <template v-if="selectedNodeDefinition">
          <NodeHelpPanel :node-definition="selectedNodeDefinition" />
        </template>

        <template v-else-if="activeCategoryGroup">
          <section class="flex flex-col gap-8">
            <div class="border-l-8 border-slate-900 bg-white p-10 shadow-sm relative overflow-hidden">
              <div class="relative z-10">
                <div class="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 mb-3">Group Classification</div>
                <h3 class="text-5xl font-black tracking-tighter text-slate-900">{{ activeCategoryGroup.title }}</h3>
                <p class="mt-6 text-xl font-medium leading-relaxed text-slate-500 max-w-4xl">{{ activeCategoryGroup.description }}</p>
              </div>
              <div class="absolute right-[-20px] top-[-20px] text-[120px] font-black text-slate-50 opacity-[0.05] select-none">{{ activeCategoryGroup.id.toUpperCase() }}</div>
            </div>

            <div class="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
              <button
                v-for="node in activeCategoryGroup.nodes"
                :key="node.name"
                class="group flex flex-col border-2 border-slate-100 bg-white p-6 text-left transition-all hover:border-slate-900 hover:shadow-xl hover:shadow-slate-900/5"
                @click="openNode(node.name)"
              >
                <div class="flex items-center justify-between mb-6 pb-4 border-b border-slate-50">
                  <div class="text-[10px] font-black uppercase tracking-widest text-blue-600 group-hover:text-blue-700">
                    ID: {{ node.name }}
                  </div>
                  <div class="h-2 w-2 rounded-full bg-slate-200 group-hover:bg-blue-500 transition-colors"></div>
                </div>
                <div class="text-xl font-black text-slate-900 mb-3 group-hover:translate-x-1 transition-transform">{{ node.displayName }}</div>
                <p class="text-sm font-medium leading-relaxed text-slate-500 line-clamp-2">{{ node.help?.summary || node.description }}</p>
                
                <div class="mt-auto pt-6 flex items-center justify-between">
                   <span class="text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-slate-400">View Documentation</span>
                   <span class="text-slate-900 opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">➔</span>
                </div>
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="space-y-12">
            <!-- Hero / Quick Start -->
            <div class="bg-slate-900 p-10 text-white rounded-2xl relative overflow-hidden">
               <div class="relative z-10">
                 <div class="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400 mb-4">Initial Onboarding</div>
                 <h3 class="text-5xl font-black tracking-tighter mb-8">3 分钟上手 / QUICK START</h3>
                 <QuickStartGuide :steps="helpCenterContent.quickStart" />
               </div>
               <!-- Background Decor -->
               <div class="absolute right-0 top-0 text-[180px] font-black italic text-white/[0.03] select-none pointer-events-none -translate-y-1/4 translate-x-1/4">IA</div>
            </div>

            <!-- 3 Column Grid -->
            <div class="grid gap-8 lg:grid-cols-3">
              <!-- FAQ -->
              <section class="flex flex-col border-t-4 border-slate-900 bg-white p-6 shadow-sm">
                <div class="mb-8 flex items-center justify-between">
                  <h3 class="text-xl font-black uppercase tracking-tighter text-slate-900">常见问题 / FAQ</h3>
                  <div class="text-[10px] font-black uppercase tracking-widest text-slate-300">Section A</div>
                </div>

                <div class="space-y-4">
                  <div
                    v-for="faq in helpCenterContent.faqs"
                    :key="faq.question"
                    class="border-b border-slate-50 pb-4 last:border-0"
                  >
                    <div class="text-sm font-black text-slate-900 mb-2 leading-tight">Q: {{ faq.question }}</div>
                    <p class="text-xs font-medium leading-relaxed text-slate-500">A: {{ faq.answer }}</p>
                  </div>
                </div>
              </section>

              <!-- Advanced Tips -->
              <section class="flex flex-col border-t-4 border-blue-600 bg-white p-6 shadow-sm">
                <div class="mb-8 flex items-center justify-between">
                  <h3 class="text-xl font-black uppercase tracking-tighter text-slate-900">进阶技巧 / Tips</h3>
                  <div class="text-[10px] font-black uppercase tracking-widest text-slate-300">Section B</div>
                </div>

                <div class="space-y-4">
                  <div
                    v-for="tip in helpCenterContent.advancedTips"
                    :key="tip.title"
                    class="group relative border border-slate-100 bg-slate-50 p-4 transition-colors hover:border-blue-200"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <div class="text-sm font-black text-slate-900 leading-tight">{{ tip.title }}</div>
                      <span v-if="tip.tag" class="rounded bg-slate-900 px-1.5 py-0.5 text-[8px] font-black text-white uppercase tracking-tighter">{{ tip.tag }}</span>
                    </div>
                    <p class="text-xs font-medium leading-relaxed text-slate-500">{{ tip.content }}</p>
                  </div>
                </div>
              </section>

              <!-- Node Library -->
              <section class="flex flex-col border-t-4 border-slate-300 bg-white p-6 shadow-sm">
                <div class="mb-8 flex items-center justify-between">
                  <h3 class="text-xl font-black uppercase tracking-tighter text-slate-900">节点全景 / Nodes</h3>
                  <div class="text-[10px] font-black uppercase tracking-widest text-slate-300">Section C</div>
                </div>

                <div class="space-y-3">
                  <button
                    v-for="group in groupedNodes"
                    :key="group.id"
                    class="group w-full border border-slate-100 p-4 text-left transition-all hover:bg-slate-900"
                    @click="openCategory(group.id)"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex flex-col">
                        <div class="text-xs font-black uppercase tracking-widest text-blue-600 group-hover:text-blue-400 mb-1">Category / {{ group.id }}</div>
                        <div class="text-sm font-black text-slate-900 group-hover:text-white">{{ group.title }}</div>
                      </div>
                      <div class="flex flex-col items-end">
                        <span class="text-[10px] font-black text-slate-300 group-hover:text-slate-500">
                          {{ group.nodes.length }} NODES
                        </span>
                        <span class="text-slate-200 group-hover:text-blue-500 transition-colors">➔</span>
                      </div>
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
