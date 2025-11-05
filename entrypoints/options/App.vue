<script lang="ts" setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { Save, TestTube, Settings, FileText, Cloud, HardDrive, Eye, EyeOff, Upload, Download } from 'lucide-vue-next';
import type { ExtensionConfig } from '../../types';
import { DEFAULT_CONFIG } from '../../types/config';

const config = reactive<ExtensionConfig>({ ...DEFAULT_CONFIG });
const isLoading = ref(false);
const isSaving = ref(false);
const isTestingWebDAV = ref(false);
const isUploadingConfig = ref(false);
const isDownloadingConfig = ref(false);
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
</script>

<template>
  <div class="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
    <!-- Header -->
    <div class="bg-white rounded-xl p-6 mb-6 shadow-sm">
      <div class="flex items-center gap-3">
        <Settings class="w-8 h-8 text-blue-600" />
        <div>
          <h1 class="text-3xl font-bold text-gray-900">MD Save 设置</h1>
          <p class="text-gray-600">配置内容保存和模板选项</p>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="bg-white rounded-xl p-12 shadow-sm flex items-center justify-center gap-3">
      <div class="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
      <span class="text-gray-600">加载配置中...</span>
    </div>

    <!-- Settings form -->
    <div v-else class="space-y-6">
      <!-- Local Download Configuration -->
      <div class="bg-white rounded-xl p-6 shadow-sm">
        <div class="flex items-center justify-between mb-5 pb-3 border-b border-gray-200">
          <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <HardDrive class="w-5 h-5" />
            本地下载配置
          </h2>
          <button
            @click="saveConfig"
            :disabled="isSaving"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save class="w-3.5 h-3.5" />
            <span v-if="isSaving">保存中...</span>
            <span v-else>保存</span>
          </button>
        </div>

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

      <!-- WebDAV Configuration -->
      <div class="bg-white rounded-xl p-6 shadow-sm">
        <div class="flex items-center justify-between mb-5 pb-3 border-b border-gray-200">
          <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <Cloud class="w-5 h-5" />
            WebDAV 服务器配置
          </h2>
          <button
            @click="saveConfig"
            :disabled="isSaving"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save class="w-3.5 h-3.5" />
            <span v-if="isSaving">保存中...</span>
            <span v-else>保存</span>
          </button>
        </div>

        <p class="text-sm text-gray-600 mb-4">
          配置 WebDAV 服务器信息后，保存时可以选择将内容上传到远程服务器（如坚果云、NextCloud 等）
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

          <!-- 配置同步区域 -->
          <div class="mt-6 pt-6 border-t border-gray-200">
            <h3 class="font-semibold text-gray-900 mb-3">配置同步</h3>
            <p class="text-xs text-gray-600 mb-4">
              将扩展的所有配置保存到 WebDAV，实现多设备配置同步
            </p>

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
        </div>
      </div>

      <!-- Template Configuration -->
      <div class="bg-white rounded-xl p-6 shadow-sm">
        <div class="flex items-center justify-between mb-5 pb-3 border-b border-gray-200">
          <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <FileText class="w-5 h-5" />
            模板配置
          </h2>
          <button
            @click="saveConfig"
            :disabled="isSaving"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save class="w-3.5 h-3.5" />
            <span v-if="isSaving">保存中...</span>
            <span v-else>保存</span>
          </button>
        </div>
        
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
              rows="8"
              placeholder="---&#10;**原文链接**: &#123;&#123;url&#125;&#125;&#10;**保存时间**: &#123;&#123;date&#125;&#125;&#10;**网站**: &#123;&#123;domain&#125;&#125;&#10;---&#10;&#10;&#123;&#123;content&#125;&#125;"
            ></textarea>
            <div class="mt-1 text-xs text-gray-500">
              支持变量: &#123;&#123;title&#125;&#125; (页面标题), &#123;&#123;url&#125;&#125; (页面链接), &#123;&#123;domain&#125;&#125; (网站域名), &#123;&#123;date&#125;&#125; (YYYY-MM-DD), &#123;&#123;time&#125;&#125; (HH:MM:SS), &#123;&#123;content&#125;&#125; (页面内容)
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="bg-white rounded-xl p-6 shadow-sm">
        <div class="flex gap-3">
          <button 
            @click="saveConfig"
            :disabled="isSaving"
            class="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save class="w-4 h-4" />
            <span v-if="isSaving">保存中...</span>
            <span v-else>保存设置</span>
          </button>

          <button 
            @click="resetToDefaults"
            class="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            重置为默认值
          </button>
        </div>
      </div>
    </div>
  </div>
</template>