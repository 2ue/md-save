export default defineBackground(() => {
  console.log('Web Save Extension loaded!', { id: browser.runtime.id });

  // 处理下载请求
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DOWNLOAD_FILE') {
      const { filename, content } = message.data;

      // 创建Blob并下载
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);

      browser.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      }).then(() => {
        URL.revokeObjectURL(url);
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

      return true; // 保持消息通道开放
    }
  });
});
