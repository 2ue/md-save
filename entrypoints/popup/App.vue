<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { MousePointer, FileText, History, Settings } from 'lucide-vue-next';

const currentTab = ref<any | null>(null);
const isValidPage = ref(true);

onMounted(async () => {
  // Get current active tab
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  currentTab.value = tab;
  // Check if current page is valid for content extraction
  isValidPage.value = isValidWebUrl(tab.url);
});

// 显示消息
function showMessage(msg: string, type: 'success' | 'error' = 'success') {
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
  }, 3000);
}

// 获取当前标签页
async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// 验证URL是否为有效的网页
function isValidWebUrl(url?: string): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

async function startSelection() {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  // 验证URL
  if (!isValidWebUrl(tab.url)) {
    showMessage('此功能仅在网页中可用', 'error');
    return;
  }

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

  // 验证URL
  if (!isValidWebUrl(tab.url)) {
    showMessage('此功能仅在网页中可用', 'error');
    return;
  }

  try {
    // 提取页面内容
    const response = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_FULL_PAGE' });
    if (response.success) {
      // 将内容发送到 content script 显示居中弹窗
      await browser.tabs.sendMessage(tab.id, {
        type: 'SHOW_PREVIEW',
        data: response.data
      });
      // 关闭 popup
      window.close();
    } else {
      showMessage('提取失败', 'error');
    }
  } catch (error) {
    showMessage('无法提取页面内容', 'error');
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

    <!-- Invalid page notice -->
    <div v-if="!isValidPage" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
      <div class="text-sm text-yellow-800">
        <div class="font-medium mb-1">⚠️ 此页面不支持内容提取</div>
        <div class="text-xs">请在普通网页(http/https)中使用本插件</div>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex flex-col gap-2">
      <button
        @click="startSelection"
        :disabled="!isValidPage"
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
        :disabled="!isValidPage"
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
  </div>
</template>
