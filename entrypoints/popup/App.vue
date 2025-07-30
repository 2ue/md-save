<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { MousePointer, FileText, History, Settings, Download, Cloud } from 'lucide-vue-next';
import { contentService, type ProcessedContent } from '@/utils/content-service';
import { WebDAVClient } from '@/utils/webdav-client';

interface ExtractedContent {
  html: string;
  markdown: string;
  title: string;
  url: string;
  timestamp: string;
}

const isLoading = ref(false);
const currentTab = ref<any | null>(null);
const extractedContent = ref<ExtractedContent | null>(null);
const processedContent = ref<ProcessedContent | null>(null);
const message = ref('');

onMounted(async () => {
  // Get current active tab
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  currentTab.value = tab;
});

// 显示消息
function showMessage(msg: string, type: 'success' | 'error' = 'success') {
  message.value = msg;
  
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = `fixed top-6 right-6 px-4 py-3 rounded-lg font-medium z-50 transition-all duration-300 transform translate-x-full ${
    type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
  }`;
  toast.textContent = msg;
  
  document.body.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
    message.value = '';
  }, 3000);
}

// 获取当前标签页
async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function startSelection() {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  try {
    await browser.tabs.sendMessage(tab.id, { type: 'START_SELECTION' });
    window.close();
  } catch (error) {
    showMessage('无法在此页面使用选择功能', 'error');
  }
}

async function saveFullPage() {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  isLoading.value = true;
  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_FULL_PAGE' });
    if (response.success) {
      extractedContent.value = response.data;
      // Process content using configuration
      processedContent.value = await contentService.processContent(response.data);  
      showMessage('页面内容已提取');
    } else {
      showMessage('提取失败', 'error');
    }
  } catch (error) {
    showMessage('无法提取页面内容', 'error');
  }
  isLoading.value = false;
}

async function downloadLocal() {
  if (!processedContent.value) return;

  const config = contentService.getConfig();
  const downloadPath = config.downloadDirectory === 'custom' && config.customDownloadPath
    ? config.customDownloadPath
    : null;

  try {
    await browser.runtime.sendMessage({
      type: 'DOWNLOAD_FILE',
      data: {
        filename: processedContent.value.filename,
        content: processedContent.value.content,
        downloadPath
      }
    });
    showMessage('文件下载成功');
  } catch (error) {
    showMessage('下载失败', 'error');
  }
}

async function saveToWebDAV() {
  if (!processedContent.value) return;

  const config = contentService.getConfig();
  
  if (!config.webdav.url || !config.webdav.username) {
    showMessage('请先配置WebDAV', 'error');
    openSettings();
    return;
  }

  isLoading.value = true;
  const client = new WebDAVClient(config.webdav);
  const result = await client.uploadFile(processedContent.value.filename, processedContent.value.content);
  isLoading.value = false;

  if (result.success) {
    if (result.cancelled) {
      showMessage('用户取消了上传');
    } else {
      showMessage(`保存到WebDAV成功${result.finalPath ? `: ${result.finalPath}` : ''}`);
    }
  } else {
    showMessage(`保存到WebDAV失败: ${result.error || '未知错误'}`, 'error');
  }
}

function openHistory() {
  browser.tabs.create({
    url: browser.runtime.getURL('/history.html')
  });
  window.close();
}

function openSettings() {
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

    <!-- Message -->
    <!-- Toast messages will show on top-right corner -->

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
    <div v-if="!processedContent" class="flex flex-col gap-2">
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
        @click="saveFullPage"
        :disabled="isLoading"
        class="flex items-center gap-3 p-3 border border-blue-600 rounded-lg bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-700 active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileText class="w-5 h-5" />
        <div class="text-left">
          <div class="font-medium">保存整个页面</div>
          <div class="text-xs opacity-75">保存页面的主要内容</div>
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

    <!-- Content preview and save options -->
    <div v-if="processedContent" class="space-y-4">
      <div class="border-t border-gray-200 pt-4">
        <h3 class="text-sm font-medium text-gray-900 mb-2">内容预览</h3>
        <div class="text-xs text-gray-600 mb-2">
          文件名: {{ processedContent.filename }}
        </div>
        <div class="bg-gray-50 border border-gray-200 rounded-md p-3 max-h-40 overflow-y-auto">
          <pre class="text-xs text-gray-700 whitespace-pre-wrap font-mono">{{ processedContent.content }}</pre>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <button
          @click="downloadLocal"
          :disabled="isLoading"
          class="flex items-center gap-3 p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download class="w-5 h-5" />
          <div class="text-left">
            <div class="font-medium">下载到本地</div>
          </div>
        </button>

        <button
          @click="saveToWebDAV"
          :disabled="isLoading"
          class="flex items-center gap-3 p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Cloud class="w-5 h-5" />
          <div class="text-left">
            <div class="font-medium">保存到WebDAV</div>
          </div>
        </button>

        <button
          @click="processedContent = null; extractedContent = null"
          class="text-sm text-gray-600 hover:text-gray-800 py-2 transition-colors"
        >
          重新选择内容
        </button>
      </div>
    </div>

    <!-- Loading overlay -->
    <div v-if="isLoading" class="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center rounded-lg">
      <div class="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
    </div>
  </div>
</template>
