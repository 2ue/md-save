import { WebDAVClient, type WebDAVConfig } from '@/utils/webdav-client';
import type { HistoryRecord } from '@/types/history';
import { nanoid } from 'nanoid';

const HISTORY_STORAGE_KEY = 'saveHistory';
const MAX_HISTORY_RECORDS = 1000;

export default defineBackground(() => {
  console.log('MD Save Extension loaded!', { id: browser.runtime.id });

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

      (async () => {
        try {
          // 创建Blob并下载
          const blob = new Blob([content], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);

          const downloadOptions: any = {
            url: url,
            filename: downloadPath ? `${downloadPath}/${filename}` : filename
          };

          // 如果没有自定义路径，显示另存为对话框
          if (!downloadPath) {
            downloadOptions.saveAs = true;
          }

          const downloadId = await browser.downloads.download(downloadOptions);

          URL.revokeObjectURL(url);

          // 仅记录成功的历史
          if (pageInfo) {
            await addHistoryRecord({
              url: pageInfo.url,
              title: pageInfo.title,
              domain: pageInfo.domain || new URL(pageInfo.url).hostname,
              filename,
              savePath: downloadPath ? `${downloadPath}/${filename}` : filename,
              saveLocation: 'local',
              contentPreview: pageInfo.contentPreview || '',
              fileSize: new Blob([content]).size
            });
          }

          sendResponse({ success: true, downloadId });
        } catch (error: any) {
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
