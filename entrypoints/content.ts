import { ContentExtractor } from '@/utils/content-extractor';
import { MarkdownConverter } from '@/utils/markdown-converter';
import { WebDAVClient, type WebDAVConfig } from '@/utils/webdav-client';
import { contentService } from '@/utils/content-service';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let isSelectionMode = false;
    let currentHighlight: HTMLElement | null = null;
    let originalOutline: string = '';
    let originalCursor: string = '';
    let tipElement: HTMLElement | null = null;
    let previewModal: HTMLElement | null = null;
    let eventListeners: {
      handleMouseMove: (e: MouseEvent) => void;
      handleClick: (e: MouseEvent) => void;
      handleKeyDown: (e: KeyboardEvent) => void;
    } | null = null;

    // 创建提示元素
    function createTipElement() {
      const tip = document.createElement('div');
      tip.id = 'web-save-tip';
      tip.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 13px;
        z-index: 999999;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      tip.textContent = '鼠标悬停高亮元素，点击选择保存区域，按ESC取消';
      return tip;
    }

    // 高亮元素
    function highlightElement(element: HTMLElement) {
      // 清除之前的高亮
      clearHighlight();

      // 保存原始样式
      originalOutline = element.style.outline;

      // 应用高亮样式
      element.style.outline = '2px solid #007bff';
      element.style.outlineOffset = '1px';

      currentHighlight = element;
    }

    // 清除高亮
    function clearHighlight() {
      if (currentHighlight) {
        currentHighlight.style.outline = originalOutline;
        currentHighlight.style.outlineOffset = '';
        currentHighlight = null;
        originalOutline = '';
      }
    }

    // 进入选择模式
    function enterSelectionMode() {
      if (isSelectionMode) return;

      isSelectionMode = true;

      // 创建并显示提示
      tipElement = createTipElement();
      document.body.appendChild(tipElement);

      // 改变鼠标样式
      originalCursor = document.body.style.cursor;
      document.body.style.cursor = 'crosshair';

      // 鼠标移动事件
      function handleMouseMove(e: MouseEvent) {
        if (!isSelectionMode) return;

        const element = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
        if (element && element !== tipElement && !tipElement?.contains(element)) {
          // 避免高亮一些不合适的元素
          if (element.tagName !== 'HTML' && element.tagName !== 'BODY') {
            highlightElement(element);
          }
        }
      }

      // 点击选择元素
      async function handleClick(e: MouseEvent) {
        if (!isSelectionMode) return;

        e.preventDefault();
        e.stopPropagation();

        const element = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
        if (element && element !== tipElement && !tipElement?.contains(element)) {
          // 确保选中的是有效元素
          if (element.tagName !== 'HTML' && element.tagName !== 'BODY') {
            exitSelectionMode();

            // 提取选中元素内容
            const content = ContentExtractor.extractElement(element);
            const converter = new MarkdownConverter();
            const markdown = converter.convert(content.html);

            const extractedContent = {
              ...content,
              markdown
            };

            // 显示预览弹窗
            previewModal = await createPreviewModal(extractedContent);
            document.body.appendChild(previewModal);
          }
        }
      }

      // ESC键取消
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          exitSelectionMode();
        }
      }

      // 添加事件监听器
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('click', handleClick, true);
      document.addEventListener('keydown', handleKeyDown);

      // 存储事件监听器引用
      eventListeners = {
        handleMouseMove,
        handleClick,
        handleKeyDown
      };
    }

    // 创建预览弹窗
    async function createPreviewModal(content: any) {
      // Process content using templates for preview
      const processedContent = await contentService.processContent({
        title: content.title,
        url: content.url,
        markdown: content.markdown,
        timestamp: content.timestamp
      });
      
      const modal = document.createElement('div');
      modal.id = 'web-save-preview-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        max-width: 800px;
        width: 90vw;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      `;

      modalContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0; color: #333; font-size: 18px;">内容预览</h3>
          <button id="close-preview" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">&times;</button>
        </div>

        <!-- 文件名输入框 -->
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; color: #333;">文件名</label>
          <input type="text" id="filename-input" value="${processedContent.filename}" style="
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
          ">
          <div id="filename-error" style="
            margin-top: 4px;
            font-size: 12px;
            color: #dc3545;
            display: none;
          "></div>
        </div>

        <div style="margin-bottom: 16px;">
          <textarea readonly style="
            width: 100%;
            height: 300px;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 12px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            resize: vertical;
            box-sizing: border-box;
            background: #f8f9fa;
          ">${processedContent.content}</textarea>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="save-local" style="
            background: #28a745;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">下载到本地</button>
          
          <button id="save-webdav" style="
            background: #17a2b8;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">保存到WebDAV</button>
          
          <button id="cancel-save" style="
            background: #6c757d;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">取消</button>
        </div>
      `;

      modal.appendChild(modalContent);

      // 添加事件监听器
      const closeBtn = modalContent.querySelector('#close-preview');
      const saveLocalBtn = modalContent.querySelector('#save-local');
      const saveWebdavBtn = modalContent.querySelector('#save-webdav');
      const cancelBtn = modalContent.querySelector('#cancel-save');
      const filenameInput = modalContent.querySelector('#filename-input') as HTMLInputElement;
      const filenameError = modalContent.querySelector('#filename-error') as HTMLDivElement;

      // 清除文件名错误的函数
      const clearFilenameError = () => {
        filenameInput.style.borderColor = '#ddd';
        filenameInput.style.backgroundColor = 'white';
        filenameError.style.display = 'none';
      };

      // 显示文件名错误的函数
      const showFilenameError = (message: string) => {
        filenameInput.style.borderColor = '#dc3545';
        filenameInput.style.backgroundColor = '#fff5f5';
        filenameError.textContent = message;
        filenameError.style.display = 'block';
      };

      // 输入时清除错误
      filenameInput.addEventListener('input', clearFilenameError);

      closeBtn?.addEventListener('click', () => closePreviewModal());
      cancelBtn?.addEventListener('click', () => closePreviewModal());

      saveLocalBtn?.addEventListener('click', () => {
        const filename = filenameInput.value.trim();
        if (!filename) {
          showFilenameError('请输入文件名');
          return;
        }
        clearFilenameError();
        saveToLocal(content, filename);
      });

      saveWebdavBtn?.addEventListener('click', () => {
        const filename = filenameInput.value.trim();
        if (!filename) {
          showFilenameError('请输入文件名');
          return;
        }
        clearFilenameError();
        saveToWebDAV(content, filename, filenameInput, showFilenameError);
      });

      // 点击背景关闭
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closePreviewModal();
        }
      });

      return modal;
    }

    // 关闭预览弹窗
    function closePreviewModal() {
      if (previewModal) {
        previewModal.remove();
        previewModal = null;
      }
    }

    // 保存到本地
    async function saveToLocal(content: any, filename: string) {
      try {
        // Process content using ContentService and templates
        const processedContent = await contentService.processContent({
          title: content.title,
          url: content.url,
          markdown: content.markdown,
          timestamp: content.timestamp
        });

        // Create download link using user-provided filename
        const blob = new Blob([processedContent.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename; // 使用用户输入的文件名
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage('文件下载成功', 'success');
        closePreviewModal();
      } catch (error) {
        showMessage('下载失败', 'error');
      }
    }

    // 保存到WebDAV
    async function saveToWebDAV(
      content: any, 
      filename: string, 
      filenameInput: HTMLInputElement, 
      showFilenameError: (message: string) => void
    ) {
      try {
        const storageResult = await browser.storage.local.get('extensionConfig');
        const webdavConfig: WebDAVConfig = storageResult.extensionConfig?.webdav;

        if (!webdavConfig || !webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
          showMessage('请先在插件中配置WebDAV', 'error');
          return;
        }

        // Process content using ContentService and templates
        const processedContent = await contentService.processContent({
          title: content.title,
          url: content.url,
          markdown: content.markdown,
          timestamp: content.timestamp
        });

        try {
          // 通过后台脚本上传，不覆盖已存在文件
          const uploadResult = await browser.runtime.sendMessage({
            type: 'WEBDAV_UPLOAD',
            data: {
              filename: filename, // 使用用户输入的文件名
              content: processedContent.content,
              webdavConfig,
              overwrite: false  // 总是不覆盖，让webdav包检测冲突
            }
          });
          
          // 检查响应是否有效
          if (!uploadResult) {
            throw new Error('未收到来自background script的响应');
          }
          
          if (uploadResult.success) {
            showMessage('保存到WebDAV成功', 'success');
            closePreviewModal();
          } else if (uploadResult.fileExists) {
            // 文件已存在，显示内联错误提示
            showFilenameError('文件已存在，请修改文件名');
          } else {
            showMessage(`保存到WebDAV失败: ${uploadResult.error || '未知错误'}`, 'error');
          }
        } catch (error) {
          showMessage(`保存到WebDAV失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
        }
      } catch (error) {
        showMessage('保存到WebDAV失败', 'error');
      }
    }

    // 显示消息提示
    function showMessage(msg: string, type: 'success' | 'error' = 'success') {
      const messageEl = document.createElement('div');
      messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 4px;
        color: white;
        font-size: 14px;
        z-index: 1000000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ${type === 'success' ? 'background: #28a745;' : 'background: #dc3545;'}
      `;
      messageEl.textContent = msg;

      document.body.appendChild(messageEl);

      setTimeout(() => {
        messageEl.remove();
      }, 3000);
    }

    // 退出选择模式
    function exitSelectionMode() {
      if (!isSelectionMode) return;

      isSelectionMode = false;

      // 清除高亮
      clearHighlight();

      // 恢复鼠标样式
      document.body.style.cursor = originalCursor;

      // 移除提示元素
      if (tipElement) {
        tipElement.remove();
        tipElement = null;
      }

      // 移除事件监听器
      if (eventListeners) {
        document.removeEventListener('mousemove', eventListeners.handleMouseMove);
        document.removeEventListener('click', eventListeners.handleClick, true);
        document.removeEventListener('keydown', eventListeners.handleKeyDown);
        eventListeners = null;
      }
    }

    // 监听来自popup的消息
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      switch (message.type) {
        case 'START_SELECTION':
          enterSelectionMode();
          sendResponse({ success: true });
          break;

        case 'EXTRACT_SELECTION':
          const selectionContent = ContentExtractor.extractSelection();
          if (selectionContent) {
            const converter = new MarkdownConverter();
            const markdown = converter.convert(selectionContent.html);
            sendResponse({
              success: true,
              data: { ...selectionContent, markdown }
            });
          } else {
            sendResponse({ success: false, error: '没有选中内容' });
          }
          break;

        case 'EXTRACT_FULL_PAGE':
          const fullPageContent = ContentExtractor.extractFullPage();
          const converter = new MarkdownConverter();
          const markdown = converter.convert(fullPageContent.html);
          sendResponse({
            success: true,
            data: { ...fullPageContent, markdown }
          });
          break;
      }
    });
  },
});
