<script lang="ts" setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { Save, TestTube, Settings, FileText, Cloud, HardDrive, Eye, EyeOff, Upload, Download, FolderSync, FileDown, FileUp, RotateCcw, Folder, Lightbulb, AlertTriangle, Image } from 'lucide-vue-next';
import type { ExtensionConfig } from '../../types';
import { DEFAULT_CONFIG } from '../../types/config';

// Tab切换状态
type TabType = 'storage' | 'template' | 'sync';
const activeTab = ref<TabType>('storage');

// 环境变量初始化状态类型
type EnvInitStatus = 'success' | 'no-env' | 'has-config' | 'error';
interface EnvConfigInit {
  status: EnvInitStatus;
  message: string;
}

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
const envConfigStatus = ref<string>('');

const isWebDAVValid = computed(() => {
  return config.webdav.url.trim() &&
         config.webdav.username.trim() &&
         config.webdav.password.trim();
});

const isConfigSyncValid = computed(() => {
  return isWebDAVValid.value && config.configSyncDir?.trim();
});

// 图片下载开关的计算属性
const imageDownloadEnabled = computed({
  get: () => config.imageDownload?.enabled ?? false,
  set: (value: boolean) => {
    if (!config.imageDownload) {
      config.imageDownload = { enabled: value };
    } else {
      config.imageDownload.enabled = value;
    }
  }
});

// 历史同步开关的计算属性
const historySyncEnabled = computed({
  get: () => config.historySync?.enabled ?? false,
  set: (value: boolean) => {
    if (!config.historySync) {
      config.historySync = { enabled: value, autoSyncOnStartup: true };
    } else {
      config.historySync.enabled = value;
    }
  }
});

// 启动时自动同步的计算属性
const autoSyncOnStartup = computed({
  get: () => config.historySync?.autoSyncOnStartup ?? true,
  set: (value: boolean) => {
    if (!config.historySync) {
      config.historySync = { enabled: false, autoSyncOnStartup: value };
    } else {
      config.historySync.autoSyncOnStartup = value;
    }
  }
});

// 历史同步目录的计算属性
const historySyncDir = computed({
  get: () => config.historySync?.syncDir ?? '',
  set: (value: string) => {
    if (!config.historySync) {
      config.historySync = { enabled: false, syncDir: value };
    } else {
      config.historySync.syncDir = value;
    }
  }
});

// 推断默认下载目录（基于操作系统）
const inferredDownloadDir = computed(() => {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('mac')) {
    return '~/Downloads';
  } else if (userAgent.includes('win')) {
    return 'C:\\Users\\<用户名>\\Downloads';
  } else if (userAgent.includes('linux')) {
    return '~/Downloads';
  } else {
    return '下载目录'; // 默认通用名称
  }
});

// 完整的保存路径预览
const fullSavePath = computed(() => {
  const baseDir = inferredDownloadDir.value;
  if (config.downloadDirectory === 'custom' && config.customDownloadPath.trim()) {
    const customPath = config.customDownloadPath.trim();
    const separator = baseDir.includes('\\') ? '\\' : '/';
    return `${baseDir}${separator}${customPath}`;
  }
  return baseDir;
});

onMounted(async () => {
  await loadConfig();
});

async function loadConfig() {
  isLoading.value = true;
  try {
    console.log('[Options] 开始加载配置...');
    const result = await browser.storage.local.get(['extensionConfig', '_envConfigInit']);

    console.log('[Options] Storage 读取结果:', {
      hasKey: 'extensionConfig' in result,
      valueType: typeof result.extensionConfig,
      envInitStatus: result._envConfigInit
    });

    // 读取环境变量初始化状态
    if (result._envConfigInit) {
      const initStatus = result._envConfigInit as EnvConfigInit;
      const statusEmojiMap: Record<EnvInitStatus, string> = {
        'success': '✅',
        'no-env': 'ℹ️',
        'has-config': '📋',
        'error': '❌'
      };
      const statusEmoji = statusEmojiMap[initStatus.status] || '❓';

      envConfigStatus.value = `${statusEmoji} ${initStatus.message}`;
      console.log('[Options] 环境变量初始化状态:', initStatus);
    }

    if (result.extensionConfig) {
      Object.assign(config, result.extensionConfig);

      // 配置迁移: 为已有配置添加默认的 authType
      if (!config.webdav.authType) {
        config.webdav.authType = 'basic';
      }

      console.log('[Options] ✓ 从 storage 加载配置成功');
      console.log('[Options] 配置摘要:', {
        hasWebDAV: !!config.webdav?.url,
        titleTemplate: config.titleTemplate,
        downloadDirectory: config.downloadDirectory
      });
    } else {
      console.log('[Options] ℹ️ Storage 为空，使用默认配置');
      console.log('[Options] 提示：如果配置了环境变量，应该在 background 初始化时已写入 storage');
    }
  } catch (error) {
    console.error('[Options] 加载配置失败:', error);
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
  toast.className = `fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg font-medium z-50 transition-all duration-300 transform -translate-y-20 opacity-0 shadow-lg ${
    type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
  }`;
  toast.textContent = text;

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity = '1';
  });

  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    toast.style.opacity = '0';
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

    // 生成时间戳: YYYYMMDDHHmmss (24小时制, 两位数补全)
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `md-save-config-${timestamp}.json`;
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
            <p class="text-sm text-gray-600">管理扩展的功能配置和选项</p>
            <!-- 环境变量初始化状态 -->
            <p v-if="envConfigStatus" class="text-xs text-gray-500 mt-1">
              {{ envConfigStatus }}
            </p>
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
              <span class="text-base">保存与同步</span>
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
              <span class="text-base">内容模板</span>
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
              <span class="text-base">备份</span>
            </button>
          </nav>
        </aside>

        <!-- 右侧内容区域 -->
        <main class="flex-1 min-w-0">
          <!-- Tab 1: 保存与同步 -->
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
                  <div class="border border-gray-200 rounded-lg" :class="config.downloadDirectory === 'default' ? 'border-blue-500' : ''">
                    <label class="flex items-center gap-2 cursor-pointer p-3" :class="config.downloadDirectory === 'default' ? 'bg-blue-50' : ''">
                      <input
                        type="radio"
                        value="default"
                        v-model="config.downloadDirectory"
                        class="w-4 h-4"
                      />
                      <span class="text-sm text-gray-700">使用浏览器默认下载目录</span>
                    </label>
                    <div v-if="config.downloadDirectory === 'default'" class="px-3 pb-3 pt-0">
                      <div class="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md">
                        <Folder class="w-3.5 h-3.5 text-green-600" />
                        <span class="text-xs text-green-700">保存位置：</span>
                        <code class="text-xs font-mono text-green-800 font-semibold">{{ inferredDownloadDir }}</code>
                      </div>
                    </div>
                  </div>

                  <div class="border border-gray-200 rounded-lg" :class="config.downloadDirectory === 'custom' ? 'border-blue-500' : ''">
                    <label class="flex items-center gap-2 cursor-pointer p-3" :class="config.downloadDirectory === 'custom' ? 'bg-blue-50' : ''">
                      <input
                        type="radio"
                        value="custom"
                        v-model="config.downloadDirectory"
                        class="w-4 h-4"
                      />
                      <span class="text-sm text-gray-700">自定义下载目录（相对路径）</span>
                    </label>

                    <div v-if="config.downloadDirectory === 'custom'" class="px-3 pb-3 space-y-2.5 pt-2">
                      <div>
                        <div class="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                          <Lightbulb class="w-3.5 h-3.5 text-amber-500" />
                          <span>输入相对于 <code class="px-1 py-0.5 bg-gray-100 rounded text-gray-800 font-mono">{{ inferredDownloadDir }}</code> 的子目录路径</span>
                        </div>
                        <input
                          type="text"
                          v-model="config.customDownloadPath"
                          class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                          placeholder="例如: markdown 或 markdown/notes"
                        />
                      </div>

                      <!-- 保存位置预览 -->
                      <div class="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
                        <Folder class="w-3.5 h-3.5 text-blue-600" />
                        <span class="text-xs text-blue-700">保存位置：</span>
                        <code class="text-xs font-mono text-blue-800 font-semibold">{{ fullSavePath }}</code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 图片下载配置 -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
                <Image class="w-5 h-5" />
                图片下载
              </h2>

              <p class="text-sm text-gray-600 mb-4">
                保存网页时自动下载图片到本地。启用后图片将保存到 assets/ 目录，Markdown 中的图片链接会被替换为本地路径。
              </p>

              <div class="space-y-4">
                <!-- 启用开关 -->
                <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div class="flex-1">
                    <div class="font-medium text-gray-900">启用图片下载</div>
                    <div class="text-sm text-gray-600 mt-1">
                      自动下载网页中的图片，避免图片失效
                    </div>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      v-model="imageDownloadEnabled"
                      class="sr-only peer"
                    />
                    <div class="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <!-- 说明和影响 -->
                <div class="space-y-3">
                  <div class="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p class="flex items-start gap-1.5 text-xs text-blue-800">
                      <Lightbulb class="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <span><strong>本地下载：</strong>图片和 Markdown 将打包为 ZIP 文件下载</span>
                    </p>
                  </div>
                  <div class="p-3 bg-purple-50 border border-purple-200 rounded-md">
                    <p class="flex items-start gap-1.5 text-xs text-purple-800">
                      <Cloud class="w-3.5 h-3.5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <span><strong>WebDAV 保存：</strong>图片将批量上传到 assets/ 目录，保持目录结构</span>
                    </p>
                  </div>
                  <div class="p-3 bg-gray-50 border border-gray-300 rounded-md">
                    <p class="flex items-start gap-1.5 text-xs text-gray-700">
                      <AlertTriangle class="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />
                      <span><strong>注意：</strong>某些网站可能阻止图片下载，这种情况下会保留原图片链接</span>
                    </p>
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
              </div>
            </div>

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
                <p class="flex items-start gap-1.5 text-xs text-yellow-800">
                  <AlertTriangle class="w-3.5 h-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <span><strong>提示：</strong>需要先配置上方的 WebDAV 服务器信息</span>
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
                  <p class="flex items-start gap-1.5 text-xs text-yellow-800">
                    <AlertTriangle class="w-3.5 h-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <span><strong>重要提示：</strong>覆盖操作不可撤销，建议操作前手动备份配置。配置将包含所有设置（包括 WebDAV 密码）。</span>
                  </p>
                </div>
              </div>
            </div>

            <!-- 历史记录同步 -->
            <div class="bg-white rounded-xl p-6 shadow-sm">
              <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-3">
                <FolderSync class="w-5 h-5" />
                历史记录同步
              </h2>

              <p class="text-sm text-gray-600 mb-4">
                自动同步保存历史记录到 WebDAV，实现多设备间的历史记录共享
              </p>

              <!-- 提示：需要先配置WebDAV -->
              <div v-if="!isWebDAVValid" class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p class="flex items-start gap-1.5 text-xs text-yellow-800">
                  <AlertTriangle class="w-3.5 h-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <span><strong>提示：</strong>需要先配置上方的 WebDAV 服务器信息</span>
                </p>
              </div>

              <div class="space-y-4">
                <!-- 启用开关 -->
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div class="flex-1">
                    <label class="block font-medium text-gray-700 mb-0.5">启用历史记录同步</label>
                    <p class="text-xs text-gray-500">保存文章时自动上传历史记录到 WebDAV</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      v-model="historySyncEnabled"
                      :disabled="!isWebDAVValid"
                      class="sr-only peer"
                    />
                    <div class="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-3 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                  </label>
                </div>

                <!-- 同步选项（仅在启用时显示） -->
                <div v-if="historySyncEnabled" class="ml-6 space-y-3">
                  <!-- 自动同步 -->
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      v-model="autoSyncOnStartup"
                      class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <span class="text-sm text-gray-700">扩展启动时自动同步历史记录</span>
                  </label>

                  <!-- 同步目录 -->
                  <div>
                    <label class="block font-medium text-gray-700 mb-1.5">历史同步目录（可选）</label>
                    <input
                      type="text"
                      v-model="historySyncDir"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                      placeholder="留空使用配置同步目录"
                    />
                    <div class="mt-1 text-xs text-gray-500">
                      历史记录将保存为 history.json。留空则使用：{{ config.configSyncDir || '/md-save-settings/' }}
                    </div>
                  </div>

                  <!-- 说明 -->
                  <div class="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p class="flex items-start gap-1.5 text-xs text-blue-800">
                      <Lightbulb class="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <span><strong>工作原理：</strong>每次保存文章时，历史记录会自动同步到 WebDAV。扩展启动时会自动下载并合并云端历史，保证所有设备看到相同的历史记录。</span>
                    </p>
                  </div>
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

                <!-- 目录支持说明 -->
                <div class="mt-3 p-3 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-md">
                  <div class="flex items-start gap-2 mb-2">
                    <Folder class="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <div class="flex-1">
                      <p class="text-xs font-semibold text-green-900 mb-1.5">✨ 目录支持（使用 / 创建嵌套目录）</p>
                      <div class="space-y-1.5 text-xs">
                        <div>
                          <span class="text-green-700 font-medium">✅ 本地下载：</span>
                          <code class="ml-1 px-1.5 py-0.5 bg-white/70 rounded text-green-800 font-mono text-xs">&#123;&#123;date&#125;&#125;/&#123;&#123;title&#125;&#125;</code>
                          <span class="ml-1 text-gray-600">→ </span>
                          <code class="px-1.5 py-0.5 bg-white/70 rounded text-gray-700 font-mono text-xs">~/Downloads/2025-11-05/文章标题.md</code>
                        </div>
                        <div>
                          <span class="text-blue-700 font-medium">✅ WebDAV：</span>
                          <code class="ml-1 px-1.5 py-0.5 bg-white/70 rounded text-blue-800 font-mono text-xs">&#123;&#123;date&#125;&#125;/&#123;&#123;title&#125;&#125;</code>
                          <span class="ml-1 text-gray-600">→ </span>
                          <code class="px-1.5 py-0.5 bg-white/70 rounded text-gray-700 font-mono text-xs">2025-11-05/文章标题.md</code>
                        </div>
                      </div>
                      <div class="mt-2 pt-2 border-t border-green-200/50">
                        <p class="text-xs text-blue-800"><strong>配合自定义下载路径：</strong></p>
                        <div class="mt-1 space-y-1 text-xs text-gray-700 bg-white/50 p-2 rounded">
                          <div><strong>配置：</strong> customDownloadPath = <code class="px-1 py-0.5 bg-white rounded font-mono">MyNotes/Web</code></div>
                          <div><strong>模板：</strong> <code class="px-1 py-0.5 bg-white rounded font-mono">&#123;&#123;date&#125;&#125;/&#123;&#123;title&#125;&#125;</code></div>
                          <div><strong>结果：</strong> <code class="px-1 py-0.5 bg-green-100 rounded font-mono text-green-800">~/Downloads/MyNotes/Web/2025-11-05/文章标题.md</code></div>
                        </div>
                        <div class="mt-2 space-y-0.5 text-xs text-gray-700">
                          <div><strong>更多示例：</strong></div>
                          <div>• <code class="px-1 py-0.5 bg-white/70 rounded font-mono text-xs">&#123;&#123;domain&#125;&#125;/&#123;&#123;date&#125;&#125;</code> → 按网站分类</div>
                          <div>• <code class="px-1 py-0.5 bg-white/70 rounded font-mono text-xs">2025/&#123;&#123;date&#125;&#125;/&#123;&#123;title&#125;&#125;</code> → 多层目录</div>
                        </div>
                        <div class="mt-1.5 text-xs text-purple-700">
                          <strong>限制：</strong>最多10层嵌套，自动过滤 <code class="px-1 py-0.5 bg-white/70 rounded font-mono">..</code> 等不安全字符
                        </div>
                      </div>
                    </div>
                  </div>
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

          <!-- Tab 3: 备份 -->
          <div v-show="activeTab === 'sync'" class="space-y-6">
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
                <p class="flex items-start gap-1.5 text-xs text-blue-800">
                  <Lightbulb class="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <span><strong>提示：</strong>导出的 JSON 文件包含所有配置（包括 WebDAV 密码），请妥善保管。导入配置将覆盖当前所有设置。</span>
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
                <p class="flex items-start gap-1.5 text-xs text-red-800">
                  <AlertTriangle class="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                  <span><strong>警告：</strong>重置操作会清空所有配置，包括 WebDAV 服务器信息和自定义模板，但不会影响已保存的内容。</span>
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
