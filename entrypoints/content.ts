import { ContentExtractor } from '@/utils/content-extractor';
import { MarkdownConverter } from '@/utils/markdown-converter';
import { contentService } from '@/utils/content-service';
import {
  contentStrategyManager,
  LocalSaveStrategy,
  WebDAVSaveStrategy,
  ImageDownloadService,
  type SaveContext,
  type SaveResult
} from './utils/save';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    // 初始化保存策略管理器
    contentStrategyManager.register(new LocalSaveStrategy());
    contentStrategyManager.register(new WebDAVSaveStrategy());
    console.log('[ContentScript] Registered save strategies:', contentStrategyManager.list().map(s => s.name));

    // 初始化图片下载服务
    const imageDownloadService = new ImageDownloadService();

    // 图片下载队列弹窗元素
    let imageQueueModal: HTMLElement | null = null;
    let imageQueueHeader: HTMLElement | null = null;
    let imageQueueList: HTMLElement | null = null;

    // 创建或获取图片下载队列弹窗
    function ensureImageQueueModal(): void {
      if (imageQueueModal && document.body.contains(imageQueueModal)) {
        return;
      }

      const modal = document.createElement('div');
      modal.id = 'md-save-image-queue';
      modal.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 360px;
        max-height: 50vh;
        background: #111827;
        color: #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 20px 25px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 1000000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      `;

      const header = document.createElement('div');
      header.style.cssText = `
        padding: 10px 12px;
        border-bottom: 1px solid rgba(55, 65, 81, 0.9);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 13px;
      `;

      const title = document.createElement('div');
      title.textContent = '图片下载队列';
      title.style.fontWeight = '600';

      const summary = document.createElement('div');
      summary.style.cssText = `
        flex: 1;
        text-align: right;
        font-size: 12px;
        color: #9ca3af;
        margin-right: 8px;
      `;

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = `
        background: transparent;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        width: 20px;
        height: 20px;
        border-radius: 4px;
      `;
      closeBtn.onmouseover = () => {
        closeBtn.style.backgroundColor = '#374151';
        closeBtn.style.color = '#e5e7eb';
      };
      closeBtn.onmouseout = () => {
        closeBtn.style.backgroundColor = 'transparent';
        closeBtn.style.color = '#9ca3af';
      };
      closeBtn.onclick = () => {
        modal.remove();
        imageQueueModal = null;
        imageQueueHeader = null;
        imageQueueList = null;
      };

      header.appendChild(title);
      header.appendChild(summary);
      header.appendChild(closeBtn);

      const list = document.createElement('div');
      list.style.cssText = `
        padding: 8px 12px 10px;
        overflow-y: auto;
        font-size: 12px;
      `;

      modal.appendChild(header);
      modal.appendChild(list);
      document.body.appendChild(modal);

      imageQueueModal = modal;
      imageQueueHeader = summary;
      imageQueueList = list;
    }

    type ImageQueueItem = {
      originalUrl: string;
      localPath: string;
      status: 'pending' | 'downloading' | 'success' | 'failed';
      error?: string;
    };

    function renderImageQueue(data: {
      tasks: ImageQueueItem[];
      total: number;
      completed: number;
      phase: 'start' | 'end';
    }): void {
      if (!data || !data.tasks || data.tasks.length === 0) return;

      ensureImageQueueModal();
      const modal = imageQueueModal;
      const header = imageQueueHeader;
      const listEl = imageQueueList;
      if (!modal || !header || !listEl) return;

      const { tasks, total, completed, phase } = data;

      const successCount = tasks.filter(t => t.status === 'success').length;
      const failedCount = tasks.filter(t => t.status === 'failed').length;

      // 更新头部 summary
      if (phase === 'start') {
        header.textContent = `准备下载图片 ${total} 张`;
      } else {
        header.textContent = `下载完成：成功 ${successCount} 张，失败 ${failedCount} 张`;
      }

      // 渲染列表（最多显示前 50 条）
      listEl.innerHTML = '';
      const maxItems = 50;
      const displayTasks = tasks.slice(0, maxItems);

      displayTasks.forEach((task) => {
        const row = document.createElement('div');
        row.style.cssText = `
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 0;
        `;

        const statusBadge = document.createElement('span');
        statusBadge.style.cssText = `
          flex-shrink: 0;
          min-width: 46px;
          padding: 2px 6px;
          border-radius: 999px;
          font-size: 11px;
          text-align: center;
        `;

        let statusText = '';
        switch (task.status) {
          case 'pending':
            statusText = '等待';
            statusBadge.style.backgroundColor = '#374151';
            statusBadge.style.color = '#e5e7eb';
            break;
          case 'downloading':
            statusText = '下载中';
            statusBadge.style.backgroundColor = '#1d4ed8';
            statusBadge.style.color = '#e5e7eb';
            break;
          case 'success':
            statusText = '成功';
            statusBadge.style.backgroundColor = '#16a34a';
            statusBadge.style.color = '#ecfdf3';
            break;
          case 'failed':
            statusText = '失败';
            statusBadge.style.backgroundColor = '#b91c1c';
            statusBadge.style.color = '#fee2e2';
            break;
        }
        statusBadge.textContent = statusText;

        const urlText = document.createElement('div');
        urlText.style.cssText = `
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #d1d5db;
        `;
        urlText.title = task.originalUrl;
        urlText.textContent = task.originalUrl;

        row.appendChild(statusBadge);
        row.appendChild(urlText);

        // 如果失败，显示一行简短错误
        if (task.status === 'failed' && task.error) {
          const errorRow = document.createElement('div');
          errorRow.style.cssText = `
            margin-left: 52px;
            font-size: 11px;
            color: #fca5a5;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          `;
          errorRow.textContent = task.error;
          row.appendChild(errorRow);
        }

        listEl.appendChild(row);
      });

      if (tasks.length > maxItems) {
        const more = document.createElement('div');
        more.style.cssText = `
          margin-top: 4px;
          font-size: 11px;
          color: #9ca3af;
        `;
        more.textContent = `其余 ${tasks.length - maxItems} 条已省略`;
        listEl.appendChild(more);
      }
    }

    // 监听图片下载进度（Background Script 通过 storage 传递进度，仅做清理）
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.imageDownloadProgress) {
        const progress = changes.imageDownloadProgress.newValue;
        if (progress && progress.current === progress.total) {
          setTimeout(() => {
            browser.storage.local.remove('imageDownloadProgress');
          }, 500);
        }
      }
    });

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

      // 🔧 分离目录和文件名
      const fullFilename = cachedProcessedContent.filename;
      const parts = fullFilename.split('/');
      const basename = parts[parts.length - 1];  // 提取最后一部分作为文件名
      const directory = parts.slice(0, -1).join('/');  // 保留目录部分

      // 存储目录部分（用于保存时重新组合）
      let filenameDirectory = directory;

      const modal = document.createElement('div');
      modal.id = 'web-save-preview-modal';
      modal.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: auto;
        height: auto;
        background: none;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 24px;
        width: 600px;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.1);
      `;

      modalContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px;">
          <h3 style="margin: 0; color: #111827; font-size: 18px; font-weight: 600;">内容保存确认</h3>
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
          <input type="text" id="filename-input" value="${basename}" style="
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            box-sizing: border-box;
            transition: all 0.2s;
            outline: none;
          " onfocus="this.style.borderColor='#2563eb'; this.style.boxShadow='0 0 0 3px rgba(37, 99, 235, 0.1)'" onblur="this.style.borderColor='#d1d5db'; this.style.boxShadow='none'">
          <!-- 完整保存路径预览 -->
          <div id="full-path-preview" style="
            margin-top: 6px;
            font-size: 12px;
            color: #6b7280;
            font-family: 'Courier New', 'Consolas', monospace;
            word-break: break-all;
          "></div>
          <div id="filename-error" style="
            margin-top: 6px;
            font-size: 12px;
            color: #dc2626;
            display: none;
          "></div>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500; color: #374151;">内容</label>
          <textarea id="content-textarea" style="
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
            background: white;
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
      const fullPathPreview = modalContent.querySelector('#full-path-preview') as HTMLDivElement;

      // 更新完整文件名预览的函数
      const updateFullPathPreview = () => {
        const currentBasename = filenameInput.value.trim() || basename;
        const fullPath = filenameDirectory
          ? `${filenameDirectory}/${currentBasename}.md`
          : `${currentBasename}.md`;
        fullPathPreview.textContent = `完整文件名: ${fullPath}`;
      };

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

      // 初始化完整路径预览
      updateFullPathPreview();

      // 输入时更新完整路径预览并清除错误
      filenameInput.addEventListener('input', () => {
        updateFullPathPreview();
        clearFilenameError();
      });

      closeBtn?.addEventListener('click', () => closePreviewModal());
      cancelBtn?.addEventListener('click', () => closePreviewModal());

      // 保存到本地按钮（带loading状态）
      saveLocalBtn?.addEventListener('click', async () => {
        const editedBasename = filenameInput.value.trim();
        if (!editedBasename) {
          showFilenameError('请输入文件名');
          return;
        }
        clearFilenameError();

        // 组合完整文件名：目录 + 编辑后的basename
        const fullFilename = filenameDirectory
          ? `${filenameDirectory}/${editedBasename}`
          : editedBasename;

        // 🔧 禁用所有按钮，显示loading
        const buttons = [saveLocalBtn, saveWebdavBtn, cancelBtn, closeBtn];
        const originalText = saveLocalBtn.textContent;

        buttons.forEach(btn => {
          (btn as HTMLButtonElement).disabled = true;
          (btn as HTMLButtonElement).style.opacity = '0.5';
          (btn as HTMLButtonElement).style.cursor = 'not-allowed';
        });
        saveLocalBtn.textContent = '保存中...';

        try {
          await saveContent(content, fullFilename, 'local', filenameInput, showFilenameError);
        } finally {
          // 恢复按钮状态
          buttons.forEach(btn => {
            (btn as HTMLButtonElement).disabled = false;
            (btn as HTMLButtonElement).style.opacity = '1';
            (btn as HTMLButtonElement).style.cursor = 'pointer';
          });
          saveLocalBtn.textContent = originalText;
        }
      });

      // 保存到WebDAV按钮（带loading状态）
      saveWebdavBtn?.addEventListener('click', async () => {
        const editedBasename = filenameInput.value.trim();
        if (!editedBasename) {
          showFilenameError('请输入文件名');
          return;
        }
        clearFilenameError();

        // 组合完整文件名：目录 + 编辑后的basename
        const fullFilename = filenameDirectory
          ? `${filenameDirectory}/${editedBasename}`
          : editedBasename;

        // 🔧 禁用所有按钮，显示loading
        const buttons = [saveLocalBtn, saveWebdavBtn, cancelBtn, closeBtn];
        const originalText = saveWebdavBtn.textContent;

        buttons.forEach(btn => {
          (btn as HTMLButtonElement).disabled = true;
          (btn as HTMLButtonElement).style.opacity = '0.5';
          (btn as HTMLButtonElement).style.cursor = 'not-allowed';
        });
        saveWebdavBtn.textContent = '保存中...';

        try {
          await saveContent(content, fullFilename, 'webdav', filenameInput, showFilenameError);
        } finally {
          // 恢复按钮状态
          buttons.forEach(btn => {
            (btn as HTMLButtonElement).disabled = false;
            (btn as HTMLButtonElement).style.opacity = '1';
            (btn as HTMLButtonElement).style.cursor = 'pointer';
          });
          saveWebdavBtn.textContent = originalText;
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

    // 统一的保存函数（使用策略模式）
    async function saveContent(
      content: any,
      filename: string,
      saveMethod: 'local' | 'webdav',
      _filenameInput?: HTMLInputElement,
      showFilenameError?: (message: string) => void
    ) {
      try {
        // 使用缓存的已处理内容，避免重复处理
        if (!cachedProcessedContent) {
          showMessage('内容处理失败，请重试', 'error');
          return;
        }

        // 读取配置
        const storageResult = await browser.storage.local.get('extensionConfig');
        const config = storageResult.extensionConfig;

        // 🔍 调试日志：查看配置状态
        console.log('[ContentScript] ========== 保存配置检查 ==========');
        console.log('[ContentScript] 保存方式:', saveMethod);
        console.log('[ContentScript] 完整配置:', config);
        console.log('[ContentScript] imageDownload 字段:', config?.imageDownload);
        console.log('[ContentScript] enabled 值:', config?.imageDownload?.enabled);
        console.log('[ContentScript] ==========================================');

        // 🔧 读取用户编辑后的内容
        const contentTextarea = document.querySelector('#content-textarea') as HTMLTextAreaElement;
        let markdown = contentTextarea ? contentTextarea.value : cachedProcessedContent.content;
        let imageTasks = undefined;

        // 如果启用了图片下载，提取并准备图片任务
        if (config?.imageDownload?.enabled) {
          console.log('[ContentScript] ✅ 图片下载已启用，开始准备图片...');
          const prepared = imageDownloadService.prepare(markdown, filename);
          markdown = prepared.markdown;  // URL已替换为本地路径
          imageTasks = prepared.tasks;
          console.log('[ContentScript] 找到图片数量:', imageTasks.length);
          console.log('[ContentScript] Markdown URL 已替换:', markdown.includes('./assets/'));
          if (imageTasks.length > 0) {
            console.log('[ContentScript][Debug] 第一张图片任务:', {
              originalUrl: imageTasks[0].originalUrl,
              localPath: imageTasks[0].localPath,
              filename: imageTasks[0].filename
            });
          } else {
            console.log('[ContentScript][Debug] 已启用图片下载，但未提取到任何图片任务');
          }
        } else {
          console.log('[ContentScript] ❌ 图片下载未启用，跳过图片处理');
          console.log('[ContentScript] 原因: config?.imageDownload?.enabled =', config?.imageDownload?.enabled);
        }

        // 构建保存上下文
        const context: SaveContext = {
          markdown,
          filename,
          images: imageTasks,
          assetsDir: 'assets',
          title: content.title,
          url: content.url,
          timestamp: Date.now(),
          config
        };

        console.log('[ContentScript] Saving with strategy:', saveMethod, {
          hasImages: !!context.images,
          imageCount: context.images?.length || 0,
          filename: context.filename
        });

        // 零分支！使用策略管理器
        const result: SaveResult = await contentStrategyManager.save(context, saveMethod);

        console.log('[ContentScript] Save result:', result);

        // 处理结果
        if (result.success) {
          showMessage('保存成功', 'success');
          closePreviewModal();
        } else {
          // 特殊处理 WebDAV 文件已存在的情况
          if (result.errorCode === 'VALIDATION' && result.error?.includes('already exists')) {
            if (showFilenameError) {
              showFilenameError('文件已存在，请修改文件名');
            } else {
              showMessage('文件已存在，请修改文件名', 'error');
            }
          } else {
            showMessage(`保存失败: ${result.error || '未知错误'}`, 'error');
          }
        }
      } catch (error) {
        console.error('[ContentScript] Save error:', error);
        showMessage(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
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

    // 监听来自 popup 和 background 的消息
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

        case 'IMAGE_DOWNLOAD_UPDATE':
          // 来自 Background 的图片下载队列更新
          renderImageQueue(message.data);
          break;
      }
    });
  },
});
