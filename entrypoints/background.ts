import { WebDAVClient, type WebDAVConfig } from '@/utils/webdav-client';

export default defineBackground(() => {
  console.log('MD Save Extension loaded!', { id: browser.runtime.id });

  // 处理下载请求和WebDAV上传
  browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'DOWNLOAD_FILE') {
      const { filename, content, downloadPath } = message.data;

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
        sendResponse({ success: true, downloadId });
      } catch (error: any) {
        sendResponse({ success: false, error: error?.message });
      }

      return true; // 保持消息通道开放
    }

    if (message.type === 'WEBDAV_UPLOAD') {
      const { filename, content, webdavConfig, overwrite } = message.data;

      try {
        const client = new WebDAVClient(webdavConfig);
        const result = await client.uploadFile(filename, content, overwrite);
        sendResponse(result);
      } catch (error: any) {
        sendResponse({ 
          success: false, 
          error: error?.message || 'WebDAV upload failed' 
        });
      }

      return true; // 保持消息通道开放
    }

    if (message.type === 'WEBDAV_CHECK_FILE') {
      const { filename, webdavConfig } = message.data;

      try {
        const client = new WebDAVClient(webdavConfig);
        const exists = await client.checkFileExists(filename);
        sendResponse({ success: true, exists });
      } catch (error: any) {
        sendResponse({ 
          success: false, 
          error: error?.message || 'WebDAV check failed' 
        });
      }

      return true; // 保持消息通道开放
    }
  });
});
