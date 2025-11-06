import { ContentExtractor } from '@/utils/content-extractor';
import { MarkdownConverter } from '@/utils/markdown-converter';
import { WebDAVClient, type WebDAVConfig } from '@/utils/webdav-client';
import { contentService } from '@/utils/content-service';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
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

    // 存储已处理的内容，避免重复处理
    let cachedProcessedContent: any = null;

    // 创建预览弹窗
    async function createPreviewModal(content: any) {
      // Process content using templates for preview (只处理一次)
      cachedProcessedContent = await contentService.processContent({
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
        padding: 24px;
        max-width: 800px;
        width: 90vw;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.05);
      `;

      modalContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
          <h3 style="margin: 0; color: #111827; font-size: 18px; font-weight: 600;">内容预览</h3>
          <button id="close-preview" style="
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #9ca3af;
            line-height: 1;
            padding: 0;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s;
          " onmouseover="this.style.background='#f3f4f6'; this.style.color='#374151'" onmouseout="this.style.background='none'; this.style.color='#9ca3af'">&times;</button>
        </div>

        <!-- 文件名输入框 -->
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500; color: #374151;">文件名</label>
          <input type="text" id="filename-input" value="${cachedProcessedContent.filename}" style="
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            box-sizing: border-box;
            transition: all 0.2s;
            outline: none;
          " onfocus="this.style.borderColor='#2563eb'; this.style.boxShadow='0 0 0 3px rgba(37, 99, 235, 0.1)'" onblur="this.style.borderColor='#d1d5db'; this.style.boxShadow='none'">
          <div id="filename-error" style="
            margin-top: 6px;
            font-size: 12px;
            color: #dc2626;
            display: none;
          "></div>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500; color: #374151;">内容</label>
          <textarea readonly style="
            width: 100%;
            height: 300px;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 12px;
            font-family: 'Courier New', 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.6;
            resize: vertical;
            box-sizing: border-box;
            background: #f9fafb;
            color: #374151;
          ">${cachedProcessedContent.content}</textarea>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="save-local" style="
            background: #16a34a;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
          " onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'">下载到本地</button>

          <button id="save-webdav" style="
            background: #2563eb;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
          " onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">保存到WebDAV</button>

          <button id="cancel-save" style="
            background: #ffffff;
            color: #4b5563;
            border: 1px solid #d1d5db;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
          " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#ffffff'">取消</button>
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
        filenameInput.style.borderColor = '#d1d5db';
        filenameInput.style.backgroundColor = 'white';
        filenameError.style.display = 'none';
      };

      // 显示文件名错误的函数
      const showFilenameError = (message: string) => {
        filenameInput.style.borderColor = '#dc2626';
        filenameInput.style.backgroundColor = '#fef2f2';
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
        // 保留路径中的 / 符号，让 Downloads API 自动创建目录
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
      // Clear cached content to prevent memory leak
      cachedProcessedContent = null;
    }

    // 保存到本地
    async function saveToLocal(content: any, filename: string) {
      try {
        // 使用缓存的已处理内容，避免重复处理
        if (!cachedProcessedContent) {
          showMessage('内容处理失败，请重试', 'error');
          return;
        }

        // 读取配置获取下载路径
        const storageResult = await browser.storage.local.get('extensionConfig');
        const config = storageResult.extensionConfig;

        // 构建完整下载路径
        let downloadPath = '';
        if (config?.downloadDirectory === 'custom' && config?.customDownloadPath) {
          downloadPath = config.customDownloadPath.trim();
        }

        // 准备页面信息
        const pageInfo = {
          url: content.url,
          title: content.title,
          domain: new URL(content.url).hostname,
          contentPreview: content.markdown.substring(0, 100)
        };

        // 使用 background script 的 DOWNLOAD_FILE 消息
        // 注意：filename 已经包含了 titleTemplate 生成的路径（如 2025-11-05/文章.md）
        // downloadPath 是用户配置的自定义路径（如 MyNotes/Web）
        // 最终路径会是：~/Downloads/MyNotes/Web/2025-11-05/文章.md
        const response = await browser.runtime.sendMessage({
          type: 'DOWNLOAD_FILE',
          data: {
            filename,  // 保留 / 的完整路径
            content: cachedProcessedContent.content,
            downloadPath,  // 自定义下载路径
            pageInfo
          }
        });

        if (response?.success) {
          showMessage('文件下载成功', 'success');
          closePreviewModal();
        } else {
          throw new Error(response?.error || '下载失败');
        }
      } catch (error: any) {
        showMessage(`下载失败: ${error?.message}`, 'error');
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

        // 使用缓存的已处理内容，避免重复处理
        if (!cachedProcessedContent) {
          showMessage('内容处理失败，请重试', 'error');
          return;
        }

        // 准备页面信息用于历史记录
        const pageInfo = {
          url: content.url,
          title: content.title,
          domain: new URL(content.url).hostname,
          contentPreview: content.markdown.substring(0, 100)
        };

        // 动态导入 WebDAV 服务
        const { uploadToWebDAV } = await import('@/utils/webdav-service');

        await uploadToWebDAV(
          cachedProcessedContent,
          filename,
          webdavConfig,
          {
            onSuccess: () => {
              showMessage('保存到WebDAV成功', 'success');
              closePreviewModal();
            },
            onFileExists: () => {
              showFilenameError('文件已存在，请修改文件名');
            },
            onError: (error) => {
              showMessage(`保存到WebDAV失败: ${error}`, 'error');
            }
          },
          pageInfo
        );
      } catch (error) {
        showMessage('保存到WebDAV失败', 'error');
      }
    }

    // 显示消息提示
    function showMessage(msg: string, type: 'success' | 'error' = 'success') {
      const messageEl = document.createElement('div');
      messageEl.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        padding: 12px 16px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        transform: translateX(100%);
        transition: transform 0.3s ease-in-out;
        ${type === 'success' ? 'background: #16a34a;' : 'background: #dc2626;'}
      `;
      messageEl.textContent = msg;

      document.body.appendChild(messageEl);

      // Animate in
      requestAnimationFrame(() => {
        messageEl.style.transform = 'translateX(0)';
      });

      // Auto remove after 3 seconds
      setTimeout(() => {
        messageEl.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (document.body.contains(messageEl)) {
            messageEl.remove();
          }
        }, 300);
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

        case 'SHOW_PREVIEW':
          // 显示预览弹窗（用于保存整个页面）
          (async () => {
            const extractedContent = {
              ...message.data,
              markdown: message.data.markdown
            };
            previewModal = await createPreviewModal(extractedContent);
            document.body.appendChild(previewModal);
            sendResponse({ success: true });
          })();
          return true; // 异步响应
      }
    });
  },
});
