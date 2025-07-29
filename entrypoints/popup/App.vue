<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { MousePointer, FileText, History, Settings } from 'lucide-vue-next';

const isLoading = ref(false);
const currentTab = ref<any | null>(null);

onMounted(async () => {
  // Get current active tab
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  currentTab.value = tab;
});

async function startSelection() {
  if (!currentTab.value?.id) return;

  isLoading.value = true;
  try {
    // Send message to content script to start selection
    await browser.tabs.sendMessage(currentTab.value.id, { type: 'START_SELECTION' });
    
    // Close popup after starting selection
    window.close();
  } catch (error) {
    console.error('Failed to start selection:', error);
  } finally {
    isLoading.value = false;
  }
}

async function selectAll() {
  if (!currentTab.value?.id) return;

  isLoading.value = true;
  try {
    // Send message to content script to extract full page
    await browser.tabs.sendMessage(currentTab.value.id, { type: 'EXTRACT_FULL_PAGE' });
    
    // Close popup after selecting all
    window.close();
  } catch (error) {
    console.error('Failed to select all:', error);
  } finally {
    isLoading.value = false;
  }
}

function openHistory() {
  // Open history page in new tab
  browser.tabs.create({
    url: browser.runtime.getURL('/history.html')
  });
  window.close();
}

function openSettings() {
  // Open options page in new tab  
  browser.tabs.create({
    url: browser.runtime.getURL('/options.html')
  });
  window.close();
}
</script>

<template>
  <div class="w-80 min-h-60 p-4 bg-white font-sans relative">
    <!-- Header -->
    <div class="flex justify-between items-center mb-3 pb-2 border-b border-gray-200">
      <div class="flex items-center gap-2">
        <FileText class="w-5 h-5 text-blue-600" />
        <h1 class="text-lg font-semibold text-gray-800">MD Save</h1>
      </div>
      <button 
        @click="openSettings"
        class="p-1 rounded hover:bg-gray-100 transition-colors"
        title="设置"
      >
        <Settings class="w-4 h-4 text-gray-600" />
      </button>
    </div>

    <!-- Current page info -->
    <div v-if="currentTab" class="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
      <div class="flex items-start gap-2">
        <img 
          :src="currentTab.favIconUrl || '/icon/16.png'" 
          class="w-4 h-4 mt-0.5 flex-shrink-0"
          alt="网站图标"
        />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium text-gray-900 truncate">
            {{ currentTab.title }}
          </div>
          <div class="text-xs text-gray-500 truncate">
            {{ currentTab.url }}
          </div>
        </div>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex flex-col gap-2">
      <button
        @click="startSelection"
        :disabled="isLoading"
        class="flex items-center gap-3 p-3 border border-blue-600 rounded-lg bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-700 active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <MousePointer class="w-5 h-5" />
        <div class="text-left">
          <div class="font-medium">选择区域保存</div>
          <div class="text-xs opacity-75">选择页面中的特定元素</div>
        </div>
      </button>

      <button
        @click="selectAll"
        :disabled="isLoading"
        class="flex items-center gap-3 p-3 border border-blue-600 rounded-lg bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-700 active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileText class="w-5 h-5" />
        <div class="text-left">
          <div class="font-medium">保存整个页面</div>
          <div class="text-xs opacity-75">选择页面的主要内容</div>
        </div>
      </button>

      <button
        @click="openHistory"
        class="flex items-center gap-3 p-3 border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-400 active:translate-y-px transition-all"
      >
        <History class="w-5 h-5" />
        <div class="text-left">
          <div class="font-medium">保存历史</div>
          <div class="text-xs opacity-75">查看已保存的内容</div>
        </div>
      </button>
    </div>

    <!-- Loading overlay -->
    <div v-if="isLoading" class="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center rounded-lg">
      <div class="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
    </div>
  </div>
</template>
