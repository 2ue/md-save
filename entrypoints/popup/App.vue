<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { WebDAVClient, type WebDAVConfig } from '@/utils/webdav-client';

interface ExtractedContent {
  html: string;
  markdown: string;
  title: string;
  url: string;
  timestamp: string;
}

const extractedContent = ref<ExtractedContent | null>(null);
const isLoading = ref(false);
const message = ref('');
const showWebDAVConfig = ref(false);

// WebDAV配置
const webdavConfig = ref<WebDAVConfig>({
  url: '',
  username: '',
  password: '',
  path: ''
});

// 从存储中加载WebDAV配置
onMounted(async () => {
  const result = await browser.storage.sync.get('webdavConfig');
  if (result.webdavConfig) {
    webdavConfig.value = result.webdavConfig;
  }
});

// 保存WebDAV配置
async function saveWebDAVConfig() {
  await browser.storage.sync.set({ webdavConfig: webdavConfig.value });
  showWebDAVConfig.value = false;
  showMessage('WebDAV配置已保存', 'success');
}

// 测试WebDAV连接
async function testWebDAVConnection() {
  if (!webdavConfig.value.url || !webdavConfig.value.username) {
    showMessage('请填写完整的WebDAV配置', 'error');
    return;
  }

  isLoading.value = true;
  const client = new WebDAVClient(webdavConfig.value);
  const success = await client.testConnection();
  isLoading.value = false;

  if (success) {
    showMessage('WebDAV连接测试成功', 'success');
  } else {
    showMessage('WebDAV连接测试失败', 'error');
  }
}

// 显示消息
function showMessage(msg: string, type: 'success' | 'error' = 'success') {
  message.value = msg;
  setTimeout(() => {
    message.value = '';
  }, 3000);
}

// 获取当前标签页
async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// 选择区域保存
async function selectAreaToSave() {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  try {
    await browser.tabs.sendMessage(tab.id, { type: 'START_SELECTION' });
    // 关闭popup弹层
    window.close();
  } catch (error) {
    showMessage('无法在此页面使用选择功能', 'error');
  }
}

// 保存选中文本
async function saveSelection() {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  isLoading.value = true;
  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_SELECTION' });
    if (response.success) {
      extractedContent.value = response.data;
      showMessage('选中内容已提取');
    } else {
      showMessage(response.error || '提取失败', 'error');
    }
  } catch (error) {
    showMessage('无法提取选中内容', 'error');
  }
  isLoading.value = false;
}

// 保存整个页面
async function saveFullPage() {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  isLoading.value = true;
  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: 'EXTRACT_FULL_PAGE' });
    if (response.success) {
      extractedContent.value = response.data;
      showMessage('页面内容已提取');
    } else {
      showMessage('提取失败', 'error');
    }
  } catch (error) {
    showMessage('无法提取页面内容', 'error');
  }
  isLoading.value = false;
}

// 下载到本地
async function downloadLocal() {
  if (!extractedContent.value) return;

  const filename = `${extractedContent.value.title.replace(/[^\w\s-]/g, '')}_${new Date().toISOString().split('T')[0]}.md`;

  try {
    await browser.runtime.sendMessage({
      type: 'DOWNLOAD_FILE',
      data: {
        filename,
        content: extractedContent.value.markdown
      }
    });
    showMessage('文件下载成功');
  } catch (error) {
    showMessage('下载失败', 'error');
  }
}

// 保存到WebDAV
async function saveToWebDAV() {
  if (!extractedContent.value) return;

  if (!webdavConfig.value.url || !webdavConfig.value.username) {
    showMessage('请先配置WebDAV', 'error');
    showWebDAVConfig.value = true;
    return;
  }

  isLoading.value = true;
  const client = new WebDAVClient(webdavConfig.value);
  const filename = `${extractedContent.value.title.replace(/[^\w\s-]/g, '')}_${new Date().toISOString().split('T')[0]}.md`;

  const success = await client.uploadFile(filename, extractedContent.value.markdown);
  isLoading.value = false;

  if (success) {
    showMessage('保存到WebDAV成功');
  } else {
    showMessage('保存到WebDAV失败', 'error');
  }
}

// 注意：选择区域保存现在直接在页面中显示预览弹窗，不再通过popup处理
</script>

<template>
  <div class="popup-container">
    <div class="header">
      <h2>网页保存工具</h2>
    </div>

    <div v-if="message" :class="['message', message.includes('失败') || message.includes('错误') ? 'error' : 'success']">
      {{ message }}
    </div>

    <div class="actions">
      <button @click="selectAreaToSave" :disabled="isLoading" class="btn btn-primary">
        选择区域保存
      </button>

      <button @click="saveSelection" :disabled="isLoading" class="btn btn-secondary">
        保存选中文本
      </button>

      <button @click="saveFullPage" :disabled="isLoading" class="btn btn-secondary">
        保存整个页面
      </button>
    </div>

    <div v-if="extractedContent" class="content-preview">
      <h3>提取的内容预览</h3>
      <div class="preview-info">
        <p><strong>标题:</strong> {{ extractedContent.title }}</p>
        <p><strong>URL:</strong> {{ extractedContent.url }}</p>
        <p><strong>时间:</strong> {{ new Date(extractedContent.timestamp).toLocaleString() }}</p>
      </div>

      <div class="markdown-preview">
        <textarea v-model="extractedContent.markdown" readonly rows="8"></textarea>
      </div>

      <div class="save-actions">
        <button @click="downloadLocal" :disabled="isLoading" class="btn btn-success">
          下载到本地
        </button>

        <button @click="saveToWebDAV" :disabled="isLoading" class="btn btn-info">
          保存到WebDAV
        </button>

        <button @click="showWebDAVConfig = true" class="btn btn-outline">
          WebDAV设置
        </button>
      </div>
    </div>

    <!-- WebDAV配置弹窗 -->
    <div v-if="showWebDAVConfig" class="modal-overlay">
      <div class="modal">
        <h3>WebDAV配置</h3>

        <div class="form-group">
          <label>服务器地址:</label>
          <input v-model="webdavConfig.url" type="url" placeholder="https://your-webdav-server.com" />
        </div>

        <div class="form-group">
          <label>用户名:</label>
          <input v-model="webdavConfig.username" type="text" />
        </div>

        <div class="form-group">
          <label>密码:</label>
          <input v-model="webdavConfig.password" type="password" />
        </div>

        <div class="form-group">
          <label>保存路径 (可选):</label>
          <input v-model="webdavConfig.path" type="text" placeholder="/documents" />
        </div>

        <div class="modal-actions">
          <button @click="testWebDAVConnection" :disabled="isLoading" class="btn btn-secondary">
            测试连接
          </button>
          <button @click="saveWebDAVConfig" class="btn btn-primary">
            保存配置
          </button>
          <button @click="showWebDAVConfig = false" class="btn btn-outline">
            取消
          </button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading">
      处理中...
    </div>
  </div>
</template>

<style scoped>
.popup-container {
  width: 400px;
  min-height: 500px;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  color: #333;
  font-size: 18px;
}

.message {
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 14px;
}

.message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #545b62;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #1e7e34;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: #117a8b;
}

.btn-outline {
  background: transparent;
  color: #007bff;
  border: 1px solid #007bff;
}

.btn-outline:hover:not(:disabled) {
  background: #007bff;
  color: white;
}

.content-preview {
  border-top: 1px solid #eee;
  padding-top: 16px;
}

.content-preview h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #333;
}

.preview-info p {
  margin: 4px 0;
  font-size: 12px;
  color: #666;
}

.markdown-preview {
  margin: 12px 0;
}

.markdown-preview textarea {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  resize: vertical;
}

.save-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 20px;
  border-radius: 8px;
  width: 350px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal h3 {
  margin: 0 0 16px 0;
  color: #333;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: #333;
}

.form-group input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #666;
}
</style>
