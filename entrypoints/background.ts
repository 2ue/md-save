import { WebDAVClient, type WebDAVConfig } from '@/utils/webdav-client';
import type { HistoryRecord } from '@/types/history';
import { nanoid } from 'nanoid';
import { buildSafePath, isPathSafe, sanitizeTemplateFilename } from '@/utils/path-security';
import { hasValidEnvConfig, applyEnvConfig, getEnvConfigInfo } from '@/utils/env-config';
import { DEFAULT_CONFIG } from '@/types/config';

const HISTORY_STORAGE_KEY = 'saveHistory';
const MAX_HISTORY_RECORDS = 1000;

export default defineBackground(() => {
  console.log('MD Save Extension loaded!', { id: browser.runtime.id });

  // 初始化：检查并应用环境变量配置到 storage（仅在 storage 为空时）
  (async () => {
    try {
      console.log('[Background] 开始检查配置初始化...');
      const result = await browser.storage.local.get(['extensionConfig', '_envConfigInit']);

      console.log('[Background] Storage 读取结果:', {
        hasKey: 'extensionConfig' in result,
        valueType: typeof result.extensionConfig,
        value: result.extensionConfig,
        envInitStatus: result._envConfigInit
      });

      const hasEnvConfig = hasValidEnvConfig();
      console.log('[Background] 环境变量配置检查:', {
        hasValidEnvConfig: hasEnvConfig
      });

      if (!result.extensionConfig) {
        console.log('[Background] ✓ Storage 为空（未找到 extensionConfig）');

        if (hasEnvConfig) {
          console.log('[Background] ✓ 检测到有效的环境变量配置');
          const config = applyEnvConfig(DEFAULT_CONFIG);
          console.log('[Background] 应用后的配置:', config);

          await browser.storage.local.set({
            extensionConfig: config,
            _envConfigInit: {
              status: 'success',
              message: '环境变量配置已自动加载',
              timestamp: Date.now()
            }
          });
          console.log('[Background] ✓ 环境变量配置已成功写入 storage');
          console.log(getEnvConfigInfo());
        } else {
          console.log('[Background] ℹ️ 未检测到环境变量配置，使用默认配置');
          await browser.storage.local.set({
            _envConfigInit: {
              status: 'no-env',
              message: '未检测到环境变量配置',
              timestamp: Date.now()
            }
          });
        }
      } else {
        console.log('[Background] ℹ️ Storage 中已有配置，跳过环境变量初始化');
        console.log('[Background] 现有配置摘要:', {
          hasWebDAV: !!result.extensionConfig.webdav?.url,
          titleTemplate: result.extensionConfig.titleTemplate,
          downloadDirectory: result.extensionConfig.downloadDirectory
        });

        // 更新初始化状态（表示已有用户配置）
        if (!result._envConfigInit) {
          await browser.storage.local.set({
            _envConfigInit: {
              status: 'has-config',
              message: 'Storage 中已有用户配置，未使用环境变量',
              timestamp: Date.now()
            }
          });
        }
      }
    } catch (error) {
      console.error('[Background] 配置初始化失败:', error);
      await browser.storage.local.set({
        _envConfigInit: {
          status: 'error',
          message: `初始化失败: ${error.message}`,
          timestamp: Date.now()
        }
      });
    }
  })();

  // 历史记录管理函数
  async function getHistory(): Promise<HistoryRecord[]> {
    try {
      const result = await browser.storage.local.get(HISTORY_STORAGE_KEY);
      return result[HISTORY_STORAGE_KEY] || [];
    } catch (error) {
      console.error('Failed to get history:', error);
      return [];
    }
  }

  async function addHistoryRecord(record: Omit<HistoryRecord, 'id' | 'timestamp'>): Promise<void> {
    try {
      const history = await getHistory();

      const newRecord: HistoryRecord = {
        ...record,
        id: nanoid(),
        timestamp: Date.now()
      };

      // 添加到历史记录开头
      history.unshift(newRecord);

      // 限制历史记录数量
      if (history.length > MAX_HISTORY_RECORDS) {
        history.splice(MAX_HISTORY_RECORDS);
      }

      await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: history });
      console.log('History record added:', newRecord);
    } catch (error) {
      console.error('Failed to add history record:', error);
    }
  }

  async function deleteHistoryRecords(ids: string[]): Promise<void> {
    try {
      const history = await getHistory();
      const filtered = history.filter(record => !ids.includes(record.id));
      await browser.storage.local.set({ [HISTORY_STORAGE_KEY]: filtered });
      console.log('History records deleted:', ids.length);
    } catch (error) {
      console.error('Failed to delete history records:', error);
      throw error;
    }
  }

  // 处理下载请求和WebDAV上传
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 获取历史记录
    if (message.type === 'GET_HISTORY') {
      (async () => {
        const history = await getHistory();
        sendResponse(history);
      })();
      return true;
    }

    // 删除历史记录
    if (message.type === 'DELETE_HISTORY') {
      (async () => {
        try {
          await deleteHistoryRecords(message.data);
          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ success: false, error: error?.message });
        }
      })();
      return true;
    }

    // 记录历史（不需要响应，仅记录成功）
    if (message.type === 'RECORD_HISTORY') {
      (async () => {
        const { pageInfo, filename, savePath, saveLocation, fileSize } = message.data;
        await addHistoryRecord({
          url: pageInfo.url,
          title: pageInfo.title,
          domain: pageInfo.domain,
          filename,
          savePath,
          saveLocation,
          contentPreview: pageInfo.contentPreview,
          fileSize
        });
      })();
      return false; // 不需要响应
    }

    if (message.type === 'DOWNLOAD_FILE') {
      const { filename, content, downloadPath, pageInfo } = message.data;

      console.log('[Background] DOWNLOAD_FILE received:', {
        filename,
        downloadPath,
        contentLength: content?.length,
        hasPageInfo: !!pageInfo
      });

      (async () => {
        try {
          // Validate path safety
          console.log('[Background] Validating download path:', downloadPath);
          if (downloadPath && !isPathSafe(downloadPath)) {
            console.error('[Background] Unsafe download path detected:', downloadPath);
            sendResponse({
              success: false,
              error: '下载路径包含不安全字符'
            });
            return;
          }

          // Sanitize template-generated filename (preserves directory structures)
          console.log('[Background] Original filename:', filename);
          const sanitizedFilename = sanitizeTemplateFilename(filename);
          console.log('[Background] Sanitized filename:', sanitizedFilename);

          if (!isPathSafe(sanitizedFilename)) {
            console.error('[Background] Unsafe filename detected:', sanitizedFilename);
            sendResponse({
              success: false,
              error: '文件名包含不安全字符'
            });
            return;
          }

          // Build safe path using security utility
          const safePath = downloadPath ? buildSafePath(downloadPath, sanitizedFilename) : sanitizedFilename;
          console.log('[Background] Final safe path:', safePath);

          // Convert content to data URL (avoid URL.createObjectURL in background script)
          console.log('[Background] Creating data URL...');
          const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`;

          const downloadOptions: any = {
            url: dataUrl,
            filename: safePath
          };

          // 如果没有自定义路径，显示另存为对话框
          if (!downloadPath) {
            downloadOptions.saveAs = true;
          }

          console.log('[Background] Download options:', downloadOptions);

          const downloadId = await browser.downloads.download(downloadOptions);
          console.log('[Background] Download started, ID:', downloadId);

          // 仅记录成功的历史
          if (pageInfo) {
            const historyRecord = {
              url: pageInfo.url,
              title: pageInfo.title,
              domain: pageInfo.domain || new URL(pageInfo.url).hostname,
              filename,
              savePath: safePath,
              saveLocation: 'local' as const,
              contentPreview: pageInfo.contentPreview || '',
              fileSize: new Blob([content]).size
            };
            console.log('[Background] Adding history record:', historyRecord);
            await addHistoryRecord(historyRecord);
          }

          console.log('[Background] Download completed successfully');
          sendResponse({ success: true, downloadId });
        } catch (error: any) {
          console.error('[Background] Download error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          });
          sendResponse({ success: false, error: error?.message });
        }
      })();

      return true; // 保持消息通道开放
    }

    if (message.type === 'WEBDAV_UPLOAD') {
      const { filename, content, webdavConfig, overwrite, pageInfo } = message.data;
      console.log('Background: WEBDAV_UPLOAD received:', {
        filename,
        overwrite,
        hasContent: !!content,
        contentLength: content?.length,
        webdavUrl: webdavConfig?.url
      });

      (async () => {
        try {
          console.log('Background: Creating WebDAV client...');
          const client = new WebDAVClient(webdavConfig);

          console.log('Background: Calling uploadFile...');
          const result = await client.uploadFile(filename, content, overwrite);

          console.log('Background: Upload result:', result);

          // 仅记录成功的历史
          if (pageInfo && result.success) {
            const fullPath = result.finalPath || `${webdavConfig.path || '/'}${filename}`;
            await addHistoryRecord({
              url: pageInfo.url,
              title: pageInfo.title,
              domain: pageInfo.domain || new URL(pageInfo.url).hostname,
              filename,
              savePath: fullPath,
              saveLocation: 'webdav',
              contentPreview: pageInfo.contentPreview || '',
              fileSize: new Blob([content]).size
            });
          }

          sendResponse(result);
        } catch (error: any) {
          console.error('Background: Upload error:', error);
          const errorResult = {
            success: false,
            error: error?.message || 'WebDAV upload failed'
          };
          console.log('Background: Sending error response:', errorResult);
          sendResponse(errorResult);
        }
      })();

      return true; // 保持消息通道开放
    }
  });
});
