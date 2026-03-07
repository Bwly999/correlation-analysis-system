<script setup lang="ts">
import { ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import { 
  LayoutGrid, 
  ChevronRight, 
  Edit2, 
  Save, 
  FileUp,
  Activity
} from 'lucide-vue-next'
import Button from 'primevue/button'
import Menu from 'primevue/menu'

const emit = defineEmits(['open-projects'])
const store = useWorkflowStore()

const menu = ref()
const menuItems = ref([
    {
        label: '文件操作',
        items: [
            { label: '导出 JSON 文件', icon: 'pi pi-download', command: () => store.exportWorkflow() },
            { label: '从 JSON 导入', icon: 'pi pi-upload', command: () => triggerImport() }
        ]
    }
])

const toggleMenu = (event: any) => menu.value.toggle(event)

const fileInput = ref<HTMLInputElement | null>(null)
const triggerImport = () => fileInput.value?.click()
const handleImport = (event: any) => {
    const file = event.target.files[0]
    if (file) {
        store.importWorkflow(file)
    }
}
</script>

<template>
  <header class="absolute top-0 left-0 right-0 h-[56px] bg-white border-b border-slate-200 z-[100] flex items-center justify-between px-6">
    <input type="file" ref="fileInput" class="hidden" accept=".json" @change="handleImport" />
    
    <div class="flex items-center gap-4">
      <!-- 导航/面包屑 -->
      <div 
        @click="emit('open-projects')"
        class="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer group px-2 py-1.5 rounded-md hover:bg-slate-100"
      >
        <LayoutGrid size="16" class="opacity-70 group-hover:opacity-100" />
        <span class="text-[13px] font-medium">Projects</span>
        <ChevronRight size="14" class="opacity-40" />
      </div>
      
      <!-- 项目名称编辑 -->
      <div class="flex items-center gap-2 group relative">
        <input 
          v-model="store.workflowName" 
          class="font-semibold text-[14px] text-slate-900 border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-transparent focus:bg-white rounded-md px-2.5 py-1 transition-all w-[200px] outline-none" 
          placeholder="Untitled Workflow"
        />
        <Edit2 size="12" class="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 pointer-events-none" />
      </div>
    </div>

    <div class="flex items-center gap-3">
      <!-- 在线状态 -->
      <div class="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-md border border-slate-200">
        <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
        <span class="text-[11px] font-medium text-slate-600">Connected</span>
      </div>

      <div class="h-4 w-[1px] bg-slate-200 mx-1"></div>

      <!-- 操作按钮 -->
      <Button @click="store.saveWorkflow()" severity="secondary" text class="h-8 px-4 text-[12px] font-medium flex gap-2 items-center rounded-md bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors shadow-sm">
        <Save :size="15" class="text-slate-500" />
        Save
      </Button>

      <button @click="toggleMenu" class="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 transition-colors shadow-sm bg-white outline-none">
        <FileUp :size="16" />
      </button>
      <Menu ref="menu" :model="menuItems" :popup="true" class="n8n-popup-menu" />
    </div>
  </header>
</template>

<style scoped>
.n8n-popup-menu { 
  border-radius: 12px !important; 
  border: 1px solid #e2e8f0 !important; 
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
}
</style>
