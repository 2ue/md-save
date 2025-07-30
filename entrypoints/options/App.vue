<script lang="ts" setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { Save, TestTube, Settings, FileText, Cloud, HardDrive, Eye, EyeOff } from 'lucide-vue-next';
import type { ExtensionConfig } from '../../types';
import { DEFAULT_CONFIG } from '../../types/config';
import { WebDAVClient } from '../../utils/webdav-client';

const config = reactive<ExtensionConfig>({ ...DEFAULT_CONFIG });
const isLoading = ref(false);
const isSaving = ref(false);
const isTestingWebDAV = ref(false);
const showPassword = ref(false);
const webdavTestResult = ref<{ success?: boolean; message?: string } | null>(null);
const saveMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const isWebDAVValid = computed(() => {
  return config.webdav.url.trim() && 
         config.webdav.username.trim() && 
         config.webdav.password.trim();
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

  // Validate WebDAV configuration if WebDAV is selected
  if (config.saveMethod === 'webdav') {
    if (!config.webdav.url.trim()) {
      errors.push('WebDAV 服务器地址不能为空');
    } else {
      try {
        new URL(config.webdav.url);
      } catch {
        errors.push('WebDAV 服务器地址格式不正确');
      }
    }

    if (!config.webdav.username.trim()) {
      errors.push('WebDAV 用户名不能为空');
    }

    if (!config.webdav.password.trim()) {
      errors.push('WebDAV 密码不能为空');
    }

    // Validate path format if provided
    if (config.webdav.path && !config.webdav.path.startsWith('/')) {
      errors.push('WebDAV 保存路径必须以 / 开头');
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
    const client = new WebDAVClient(config.webdav);
    const result = await client.testConnection();
    webdavTestResult.value = {
      success: result,
      message: result ? '连接成功' : '连接失败'
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
      <!-- Save Method Section -->
      <div class="bg-white rounded-xl p-6 shadow-sm">
        <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-200">
          <FileText class="w-5 h-5" />
          保存方式
        </h2>
        
        <div class="space-y-4">
          <!-- Local Save Option -->
          <div class="border border-gray-200 rounded-lg" :class="config.saveMethod === 'local' ? 'border-blue-500' : ''">
            <label class="flex items-start p-4 cursor-pointer hover:bg-blue-50 transition-all" :class="config.saveMethod === 'local' ? 'bg-blue-50' : ''" @click="config.saveMethod = 'local'">
              <input 
                type="radio" 
                value="local" 
                v-model="config.saveMethod"
                class="mt-1 mr-3"
              />
              <div class="flex items-center gap-3 flex-1">
                <HardDrive class="w-5 h-5 text-gray-600" />
                <div class="flex-1">
                  <div class="font-medium">本地下载</div>
                  <div class="text-sm text-gray-500 mt-1">保存到浏览器下载目录，文件直接下载到本地</div>
                </div>
              </div>
            </label>
            
            <!-- Local Download Configuration (shown when Local is selected) -->
            <div v-if="config.saveMethod === 'local'" class="border-t border-gray-200 p-4 bg-gray-50">
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
          </div>

          <!-- WebDAV Save Option -->
          <div class="border border-gray-200 rounded-lg" :class="config.saveMethod === 'webdav' ? 'border-blue-500' : ''">
            <label class="flex items-start p-4 cursor-pointer hover:bg-blue-50 transition-all" :class="config.saveMethod === 'webdav' ? 'bg-blue-50' : ''" @click="config.saveMethod = 'webdav'">
              <input 
                type="radio" 
                value="webdav" 
                v-model="config.saveMethod"
                class="mt-1 mr-3"
              />
              <div class="flex items-center gap-3 flex-1">
                <Cloud class="w-5 h-5 text-gray-600" />
                <div class="flex-1">
                  <div class="font-medium">WebDAV 服务器</div>
                  <div class="text-sm text-gray-500 mt-1">保存到远程 WebDAV 服务器（如坚果云、NextCloud等）</div>
                </div>
              </div>
            </label>
            
            <!-- WebDAV Configuration (shown when WebDAV is selected) -->
            <div v-if="config.saveMethod === 'webdav'" class="border-t border-gray-200 p-4 bg-gray-50">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="md:col-span-2">
                  <label class="block font-medium text-gray-700 mb-1.5">服务器地址 *</label>
                  <input 
                    type="url" 
                    v-model="config.webdav.url"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                    placeholder="https://example.com/webdav"
                    @input="webdavTestResult = null"
                  />
                </div>

                <div>
                  <label class="block font-medium text-gray-700 mb-1.5">用户名 *</label>
                  <input 
                    type="text" 
                    v-model="config.webdav.username"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
                    placeholder="用户名"
                    @input="webdavTestResult = null"
                  />
                </div>

                <div>
                  <label class="block font-medium text-gray-700 mb-1.5">密码 *</label>
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

                <div class="md:col-span-2">
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

                <!-- WebDAV Test Button -->
                <div class="md:col-span-2">
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
          </div>
        </div>
      </div>

      <!-- Template Configuration -->
      <div class="bg-white rounded-xl p-6 shadow-sm">
        <h2 class="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-200">
          <FileText class="w-5 h-5" />
          模板配置
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