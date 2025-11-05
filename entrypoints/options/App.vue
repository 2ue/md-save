<script lang="ts" setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { Save, TestTube, Settings, FileText, Cloud, HardDrive, Eye, EyeOff, Upload, Download, FolderSync, FileDown, FileUp, RotateCcw } from 'lucide-vue-next';
import type { ExtensionConfig } from '../../types';
import { DEFAULT_CONFIG } from '../../types/config';

// Tab切换状态
type TabType = 'storage' | 'template' | 'sync';
const activeTab = ref<TabType>('storage');

const config = reactive<ExtensionConfig>({ ...DEFAULT_CONFIG });
const isLoading = ref(false);
const isSaving = ref(false);
const isTestingWebDAV = ref(false);
const isUploadingConfig = ref(false);
const isDownloadingConfig = ref(false);
const isExporting = ref(false);
const isImporting = ref(false);
const showPassword = ref(false);
const webdavTestResult = ref<{ success?: boolean; message?: string } | null>(null);
const saveMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const isWebDAVValid = computed(() => {
  return config.webdav.url.trim() &&
         config.webdav.username.trim() &&
         config.webdav.password.trim();
});

const isConfigSyncValid = computed(() => {
  return isWebDAVValid.value && config.configSyncDir?.trim();
});

onMounted(async () => {
  await loadConfig();
});

async function loadConfig() {
  isLoading.value = true;
  try {
    const result = await browser.storage.local.get('extensionConfig');
    if (result.extensionConfig) {
      Object.assign(config, result.extensionConfig);

      // 配置迁移: 为已有配置添加默认的 authType
      if (!config.webdav.authType) {
        config.webdav.authType = 'basic';  // Default to 'basic' for better browser compatibility
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error);
    showMessage('error', '加载配置失败');
  } finally {
    isLoading.value = false;
  }
}

async function saveConfig() {
  // Validate configuration before saving
  const validationResult = validateConfig();
  if (!validationResult.valid) {
    showMessage('error', validationResult.errors.join('；'));
    return;
  }

  isSaving.value = true;
  try {
    await browser.storage.local.set({ extensionConfig: config });
    showMessage('success', '设置已保存');
  } catch (error) {
    console.error('Failed to save config:', error);
    showMessage('error', '保存设置失败');
  } finally {
    isSaving.value = false;
  }
}

function validateConfig() {
  const errors: string[] = [];

  // Validate title template
  if (!config.titleTemplate.trim()) {
    errors.push('文件名模板不能为空');
  }

  // Validate content template
  if (!config.contentTemplate.trim()) {
    errors.push('内容模板不能为空');
  }

  // Validate WebDAV path format if provided
  if (config.webdav.path && !config.webdav.path.startsWith('/')) {
    errors.push('WebDAV 保存路径必须以 / 开头');
  }

  // Validate WebDAV URL format if provided
  if (config.webdav.url.trim()) {
    try {
      new URL(config.webdav.url);
    } catch {
      errors.push('WebDAV 服务器地址格式不正确');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

async function testWebDAVConnection() {
  if (!isWebDAVValid.value) {
    webdavTestResult.value = { success: false, message: '请填写完整的 WebDAV 配置' };
    return;
  }

  isTestingWebDAV.value = true;
  webdavTestResult.value = null;

  try {
    // 直接在这里测试,不通过background script
    const { WebDAVClient } = await import('../../utils/webdav-client');
    const client = new WebDAVClient(config.webdav);
    const result = await client.testConnection();

    webdavTestResult.value = {
      success: result,
      message: result ? '连接成功' : '连接失败，请检查服务器地址、用户名和密码'
    };
  } catch (error) {
    console.error('WebDAV test failed:', error);
    webdavTestResult.value = {
      success: false,
      message: '测试连接时出错'
    };
  } finally {
    isTestingWebDAV.value = false;
  }
}

function resetToDefaults() {
  if (confirm('确定要重置所有设置为默认值吗？')) {
    Object.assign(config, DEFAULT_CONFIG);
    webdavTestResult.value = null;
    showMessage('success', '已重置为默认值');
  }
}

function showMessage(type: 'success' | 'error', text: string) {
  saveMessage.value = { type, text };

  // Create toast notification
  const toast = document.createElement('div');
  toast.className = `fixed top-6 right-6 px-4 py-3 rounded-lg font-medium z-50 transition-all duration-300 transform translate-x-full ${
    type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
  }`;
  toast.textContent = text;

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
    saveMessage.value = null;
  }, 3000);
}

function togglePasswordVisibility() {
  showPassword.value = !showPassword.value;
}

async function uploadConfigToWebDAV() {
  if (!isConfigSyncValid.value) {
    showMessage('error', '请先配置 WebDAV 和配置同步目录');
    return;
  }

  if (!confirm('确定要上传配置到 WebDAV 吗？这将覆盖远程已存在的配置文件。')) {
    return;
  }

  isUploadingConfig.value = true;
  try {
    // 先保存当前配置
    await browser.storage.local.set({ extensionConfig: config });

    const { WebDAVClient } = await import('../../utils/webdav-client');
    const client = new WebDAVClient(config.webdav);
    const result = await client.uploadConfigToWebDAV(config, config.configSyncDir!);

    if (result.success) {
      showMessage('success', `配置已成功上传到 ${result.finalPath}`);
    } else {
      showMessage('error', `上传失败: ${result.error}`);
    }
  } catch (error) {
    console.error('Upload config error:', error);
    showMessage('error', '上传配置时出错');
  } finally {
    isUploadingConfig.value = false;
  }
}

async function downloadConfigFromWebDAV() {
  if (!isConfigSyncValid.value) {
    showMessage('error', '请先配置 WebDAV 和配置同步目录');
    return;
  }

  if (!confirm('确定要从 WebDAV 下载配置吗？这将覆盖当前所有本地配置，且不可撤销！')) {
    return;
  }

  isDownloadingConfig.value = true;
  try {
    const { WebDAVClient } = await import('../../utils/webdav-client');
    const client = new WebDAVClient(config.webdav);
    const result = await client.downloadConfigFromWebDAV(config.configSyncDir!);

    if (result.success && result.config) {
      // 覆盖本地配置
      await browser.storage.local.set({ extensionConfig: result.config });
      // 重新加载配置到UI
      Object.assign(config, result.config);
      showMessage('success', '配置已成功从 WebDAV 下载并应用');
    } else {
      showMessage('error', `下载失败: ${result.error}`);
    }
  } catch (error) {
    console.error('Download config error:', error);
    showMessage('error', '下载配置时出错');
  } finally {
    isDownloadingConfig.value = false;
  }
}

// Tab切换函数
function switchTab(tab: TabType) {
  activeTab.value = tab;
}

// 导出配置为JSON文件
async function exportConfigToFile() {
  isExporting.value = true;
  try {
    // 获取当前配置
    const result = await browser.storage.local.get('extensionConfig');
    const configToExport = result.extensionConfig || config;

    // 转换为格式化的JSON
    const json = JSON.stringify(configToExport, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `md-save-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();

    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    showMessage('success', '配置已导出为JSON文件');
  } catch (error) {
    console.error('Export config error:', error);
    showMessage('error', '导出配置时出错');
  } finally {
    isExporting.value = false;
  }
}

// 从JSON文件导入配置
async function importConfigFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!confirm('确定要导入配置吗？这将覆盖当前所有本地配置，且不可撤销！')) {
      return;
    }

    isImporting.value = true;
    try {
      const text = await file.text();
      const importedConfig = JSON.parse(text);

      // 验证配置格式
      if (!importedConfig.titleTemplate || !importedConfig.contentTemplate) {
        showMessage('error', '配置文件格式不正确');
        return;
      }

      // 保存配置
      await browser.storage.local.set({ extensionConfig: importedConfig });

      // 更新UI
      Object.assign(config, importedConfig);

      showMessage('success', '配置已成功导入并应用');
    } catch (error) {
      console.error('Import config error:', error);
      showMessage('error', '导入配置失败，请检查文件格式');
    } finally {
      isImporting.value = false;
    }
  };

  input.click();
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Settings class="w-8 h-8 text-blue-600" />
          <div>
            <h1 class="text-2xl font-bold text-gray-900">MD Save 设置</h1>
            <p class="text-sm text-gray-600">配置内容保存和模板选项</p>
          </div>
        </div>

        <!-- 全局保存按钮 -->
        <button
          @click="saveConfig"
          :disabled="isSaving"
          class="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Save class="w-4 h-4" />
          <span v-if="isSaving">保存中...</span>
          <span v-else>保存设置</span>
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center h-96">
      <div class="flex items-center gap-3">
        <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
        <span class="text-gray-600">加载配置中...</span>
      </div>
    </div>

    <!-- Main content: 左侧tab + 右侧内容 -->
    <div v-else class="max-w-7xl mx-auto p-6">
      <div class="flex gap-6 items-start">
        <!-- 左侧 Tab 列表 -->
        <aside class="w-64 flex-shrink-0">
          <nav class="bg-white rounded-lg shadow-sm p-2 sticky top-6">
            <button
              @click="switchTab('storage')"
              :class="[
                'w-full flex items-center gap-3 px-4 py-3 rounded-md text-left transition-colors',
                activeTab === 'storage'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              ]"
            >
              <HardDrive class="w-5 h-5" />
              <span>存储</span>
            </button>

            <button
              @click="switchTab('template')"
              :class="[
                'w-full flex items-center gap-3 px-4 py-3 rounded-md text-left transition-colors',
                activeTab === 'template'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              ]"
            >
              <FileText class="w-5 h-5" />
              <span>内容模板</span>
            </button>

            <button
              @click="switchTab('sync')"
              :class="[
                'w-full flex items-center gap-3 px-4 py-3 rounded-md text-left transition-colors',
                activeTab === 'sync'
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              ]"
            >
              <FolderSync class="w-5 h-5" />
              <span>配置同步</span>
            </button>
          </nav>
        </aside>

        <!-- 右侧内容区域 -->
        <main class="flex-1 min-w-0">
          <!-- Tab 1: 存储 -->
          <div v-show="activeTab === 'storage'" class="space-y-6">
            <!-- 本地下载配置 -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-5">
                <HardDrive class="w-5 h-5" />
                本地下载
              </h2>

              <div>
                <label class="block font-medium text-gray-700 mb-3">下载目录</label>
                <div class="space-y-3">
                  <label class="flex items-center gap-2 cursor-pointer p-3 border border-gray-200 rounded-lg" :class="config.downloadDirectory === 'default' ? 'border-blue-500 bg-blue-50' : ''">
                    <input
                      type="radio"
                      value="default"
                      v-model="config.downloadDirectory"
                      class="w-4 h-4"
                    />
                    <span class="text-sm text-gray-700">使用浏览器默认下载目录</span>
                  </label>

                  <div class="border border-gray-200 rounded-lg" :class="config.downloadDirectory === 'custom' ? 'border-blue-500' : ''">
                    <label class="flex items-center gap-2 cursor-pointer p-3" :class="config.downloadDirectory === 'custom' ? 'bg-blue-50' : ''">
                      <input
                        type="radio"
                        value="custom"
                        v-model="config.downloadDirectory"
                        class="w-4 h-4"
                      />
                      <span class="text-sm text-gray-700">自定义下载目录</span>
                    </label>

                    <div v-if="config.downloadDirectory === 'custom'" class="px-3 pb-3">
                      <input
                        type="text"
                        v-model="config.customDownloadPath"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                        placeholder="例如: Downloads/MD保存"
                      />
                      <div class="mt-1 text-xs text-gray-500">
                        相对于默认下载目录的路径，如：subfolder 或 subfolder/markdown
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- WebDAV 服务器配置 -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
                <Cloud class="w-5 h-5" />
                WebDAV 服务器
              </h2>

              <p class="text-sm text-gray-600 mb-4">
                配置 WebDAV 服务器信息（可选），保存内容时可选择上传到远程服务器（如坚果云、NextCloud 等）
              </p>

              <div class="space-y-4">
                <!-- 服务器地址 -->
                <div>
                  <label class="block font-medium text-gray-700 mb-1.5">服务器地址</label>
                  <input
                    type="url"
                    v-model="config.webdav.url"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                    placeholder="https://example.com/webdav"
                    @input="webdavTestResult = null"
                  />
                </div>

                <!-- 认证类型 -->
                <div>
                  <label class="block font-medium text-gray-700 mb-1.5">认证类型</label>
                  <select
                    v-model="config.webdav.authType"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all bg-white"
                    @change="webdavTestResult = null"
                  >
                    <option value="basic">Basic (基本认证) - 推荐</option>
                    <option value="digest">Digest (摘要认证) - 仅坚果云</option>
                  </select>
                  <div class="mt-1 text-xs text-gray-500">
                    <strong>重要:</strong> 浏览器扩展环境对Digest认证支持有限<br>
                    • <strong>坚果云</strong>: 两种认证都支持<br>
                    • <strong>自建服务器</strong>: 推荐使用Basic认证<br>
                    • 如使用Digest遇到弹窗,请改用Basic
                  </div>
                </div>

                <!-- 用户名 -->
                <div>
                  <label class="block font-medium text-gray-700 mb-1.5">用户名</label>
                  <input
                    type="text"
                    v-model="config.webdav.username"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                    placeholder="用户名"
                    @input="webdavTestResult = null"
                  />
                </div>

                <!-- 密码 -->
                <div>
                  <label class="block font-medium text-gray-700 mb-1.5">密码</label>
                  <div class="relative">
                    <input
                      :type="showPassword ? 'text' : 'password'"
                      v-model="config.webdav.password"
                      class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                      placeholder="密码"
                      @input="webdavTestResult = null"
                    />
                    <button
                      type="button"
                      @click="togglePasswordVisibility"
                      class="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      :title="showPassword ? '隐藏密码' : '显示密码'"
                    >
                      <Eye v-if="!showPassword" class="w-4 h-4" />
                      <EyeOff v-else class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- 保存路径 -->
                <div>
                  <label class="block font-medium text-gray-700 mb-1.5">保存路径</label>
                  <input
                    type="text"
                    v-model="config.webdav.path"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                    placeholder="/markdown"
                    @input="webdavTestResult = null"
                  />
                  <div class="mt-1 text-xs text-gray-500">
                    可选，默认为根目录 /
                  </div>
                </div>

                <!-- 测试按钮 -->
                <div>
                  <button
                    @click="testWebDAVConnection"
                    :disabled="!isWebDAVValid || isTestingWebDAV"
                    class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <TestTube class="w-4 h-4" />
                    <span v-if="isTestingWebDAV">测试连接中...</span>
                    <span v-else>测试连接</span>
                  </button>

                  <div v-if="webdavTestResult" :class="[
                    'mt-2 px-3 py-2 rounded-md text-sm',
                    webdavTestResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  ]">
                    {{ webdavTestResult.message }}
                  </div>
                </div>

                <!-- 提示：配置同步 -->
                <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p class="text-xs text-blue-800">
                    💡 <strong>提示：</strong>配置好 WebDAV 后，可以在
                    <button
                      @click="switchTab('sync')"
                      class="underline hover:text-blue-900 font-medium"
                    >
                      配置同步
                    </button>
                    页面实现多设备配置同步
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 2: 内容模板 -->
          <div v-show="activeTab === 'template'" class="bg-white rounded-xl p-6 shadow-sm">
            <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-5">
              <FileText class="w-5 h-5" />
              内容模板
            </h2>

            <div class="space-y-5">
              <div>
                <label class="block font-medium text-gray-700 mb-1.5">文件名模板</label>
                <input
                  type="text"
                  v-model="config.titleTemplate"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                  placeholder="&#123;&#123;title&#125;&#125;_&#123;&#123;date&#125;&#125;"
                />
                <div class="mt-1 text-xs text-gray-500">
                  支持变量: &#123;&#123;title&#125;&#125; (页面标题), &#123;&#123;date&#125;&#125; (YYYY-MM-DD), &#123;&#123;time&#125;&#125; (HH:MM:SS), &#123;&#123;domain&#125;&#125; (网站域名)
                </div>
              </div>

              <div>
                <label class="block font-medium text-gray-700 mb-1.5">内容模板</label>
                <textarea
                  v-model="config.contentTemplate"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono resize-y focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                  rows="10"
                  placeholder="---&#10;**原文链接**: &#123;&#123;url&#125;&#125;&#10;**保存时间**: &#123;&#123;date&#125;&#125;&#10;**网站**: &#123;&#123;domain&#125;&#125;&#10;---&#10;&#10;&#123;&#123;content&#125;&#125;"
                ></textarea>
                <div class="mt-1 text-xs text-gray-500">
                  支持变量: &#123;&#123;title&#125;&#125; (页面标题), &#123;&#123;url&#125;&#125; (页面链接), &#123;&#123;domain&#125;&#125; (网站域名), &#123;&#123;date&#125;&#125; (YYYY-MM-DD), &#123;&#123;time&#125;&#125; (HH:MM:SS), &#123;&#123;content&#125;&#125; (页面内容)
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 3: 配置同步 -->
          <div v-show="activeTab === 'sync'" class="space-y-6">
            <!-- WebDAV 配置同步 -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
                <Cloud class="w-5 h-5" />
                WebDAV 配置同步
              </h2>

              <p class="text-sm text-gray-600 mb-4">
                将扩展的所有配置保存到 WebDAV，实现多设备配置同步
              </p>

              <!-- 提示：需要先配置WebDAV -->
              <div v-if="!isWebDAVValid" class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p class="text-xs text-yellow-800">
                  ⚠️ <strong>提示：</strong>需要先在
                  <button
                    @click="switchTab('storage')"
                    class="underline hover:text-yellow-900 font-medium"
                  >
                    存储页面
                  </button>
                  配置 WebDAV 服务器信息
                </p>
              </div>

              <div class="space-y-4">
                <!-- 配置同步目录 -->
                <div>
                  <label class="block font-medium text-gray-700 mb-1.5">配置同步目录</label>
                  <input
                    type="text"
                    v-model="config.configSyncDir"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                    placeholder="/md-save-settings/"
                  />
                  <div class="mt-1 text-xs text-gray-500">
                    配置文件将保存为 config.json。例如：/md-save-settings/config.json
                  </div>
                </div>

                <!-- 同步按钮 -->
                <div class="flex gap-3">
                  <button
                    @click="uploadConfigToWebDAV"
                    :disabled="!isConfigSyncValid || isUploadingConfig"
                    class="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Upload class="w-4 h-4" />
                    <span v-if="isUploadingConfig">上传中...</span>
                    <span v-else>上传配置到 WebDAV（覆盖）</span>
                  </button>

                  <button
                    @click="downloadConfigFromWebDAV"
                    :disabled="!isConfigSyncValid || isDownloadingConfig"
                    class="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Download class="w-4 h-4" />
                    <span v-if="isDownloadingConfig">下载中...</span>
                    <span v-else>从 WebDAV 下载配置（覆盖）</span>
                  </button>
                </div>

                <div class="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <p class="text-xs text-yellow-800">
                    ⚠️ <strong>重要提示：</strong>覆盖操作不可撤销，建议操作前手动备份配置。配置将包含所有设置（包括 WebDAV 密码）。
                  </p>
                </div>
              </div>
            </div>

            <!-- 本地备份与导入 -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
                <FolderSync class="w-5 h-5" />
                本地备份与导入
              </h2>

              <p class="text-sm text-gray-600 mb-4">
                将配置导出为 JSON 文件保存到本地，或从本地文件导入配置
              </p>

              <div class="flex gap-3">
                <button
                  @click="exportConfigToFile"
                  :disabled="isExporting"
                  class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FileDown class="w-4 h-4" />
                  <span v-if="isExporting">导出中...</span>
                  <span v-else>导出配置为 JSON</span>
                </button>

                <button
                  @click="importConfigFromFile"
                  :disabled="isImporting"
                  class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FileUp class="w-4 h-4" />
                  <span v-if="isImporting">导入中...</span>
                  <span v-else>从 JSON 导入配置</span>
                </button>
              </div>

              <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p class="text-xs text-blue-800">
                  💡 <strong>提示：</strong>导出的 JSON 文件包含所有配置（包括 WebDAV 密码），请妥善保管。导入配置将覆盖当前所有设置。
                </p>
              </div>
            </div>

            <!-- 重置设置 -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
                <RotateCcw class="w-5 h-5" />
                重置设置
              </h2>

              <p class="text-sm text-gray-600 mb-4">
                将所有配置恢复为默认值
              </p>

              <button
                @click="resetToDefaults"
                class="px-5 py-2.5 border-2 border-red-300 text-red-700 rounded-md font-medium hover:bg-red-50 hover:border-red-400 transition-colors"
              >
                重置为默认值
              </button>

              <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p class="text-xs text-red-800">
                  ⚠️ <strong>警告：</strong>重置操作会清空所有配置，包括 WebDAV 服务器信息和自定义模板，但不会影响已保存的内容。
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
