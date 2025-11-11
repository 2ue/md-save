import { WebDAVClient, type WebDAVConfig } from '@/utils/webdav-client';
import type { HistoryRecord } from '@/types/history';
import { nanoid } from 'nanoid';
import { buildSafePath, isPathSafe, sanitizeTemplateFilename } from '@/utils/path-security';
import { hasValidEnvConfig, applyEnvConfig, getEnvConfigInfo } from '@/utils/env-config';
import { DEFAULT_CONFIG } from '@/types/config';
import {
  SaveStrategyManager,
  LocalSaveStrategyImpl,
  WebDAVSaveStrategyImpl,
  ImageDownloadService,
  type SaveContext,
  type SaveResult,
  type SaveStrategy
} from './utils/save';

const HISTORY_STORAGE_KEY = 'saveHistory';
const MAX_HISTORY_RECORDS = 1000;

export default defineBackground(() => {
  console.log('MD Save Extension loaded!', { id: browser.runtime.id });

  // 初始化策略管理器（Background Script）
  const backgroundStrategyManager = new SaveStrategyManager();
  backgroundStrategyManager.register(new LocalSaveStrategyImpl());
  backgroundStrategyManager.register(new WebDAVSaveStrategyImpl());
  console.log('[SaveStrategy] Registered strategies:', backgroundStrategyManager.list().map((s: SaveStrategy) => s.name));

  // 初始化图片下载服务
  const imageDownloadService = new ImageDownloadService();

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      await browser.storage.local.set({
        _envConfigInit: {
          status: 'error',
          message: `初始化失败: ${errorMessage}`,
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
    // ========================================
    // 新的统一保存消息（策略模式）
    // ========================================
    if (message.type === 'SAVE') {
      (async () => {
        try {
          const { context, strategy } = message.data as { context: SaveContext; strategy: string };

          // 🔧 获取发送消息的 tab ID（不依赖 sender.tab，更可靠）
          let tabId = sender.tab?.id;

          // 如果 sender.tab 不可用，查询当前活动的 tab
          if (!tabId) {
            const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
            tabId = currentTab?.id;
            console.log('[SaveStrategy] sender.tab 不可用，使用当前活动 tab:', tabId);
          }

          console.log('[SaveStrategy] Received SAVE message:', {
            strategy,
            filename: context.filename,
            hasImages: !!context.images,
            imageCount: context.images?.length || 0,
            tabId,
            hasSenderTab: !!sender.tab
          });

          // 如果有图片任务，先在 Background Script 中下载
          // （Background Script 无 CORS 限制）
          if (context.images && context.images.length > 0) {
            console.log('[Background] ✅ 检测到图片任务，数量:', context.images.length);
            console.log('[Background] 开始下载图片...');

            // 下载图片，失败的自动回退到原 URL
            const downloadResult = await imageDownloadService.download(
              context.images,
              context.markdown,
              // 进度回调：写入 storage 供 Content Script 监听
              (current, total) => {
                browser.storage.local.set({
                  imageDownloadProgress: { current, total }
                }).catch(err => {
                  console.error('[Background] Failed to update progress:', err);
                });
              }
            );

            console.log('[Background] 图片下载完成');
            context.images = downloadResult.tasks;
            context.markdown = downloadResult.markdown;  // 更新 Markdown（失败图片已回退）

            const stats = context.images.reduce(
              (acc, task) => {
                acc[task.status]++;
                return acc;
              },
              { pending: 0, downloading: 0, success: 0, failed: 0 }
            );

            console.log('[SaveStrategy] Image download complete:', stats);
          }

          // 直接执行保存策略（避免循环消息传递）
          const strategyImpl = backgroundStrategyManager.get(strategy);
          if (!strategyImpl) {
            throw new Error(`Unknown strategy: ${strategy}`);
          }

          const result = await strategyImpl.save(context);

          console.log('[SaveStrategy] Save result:', result);

          // 如果成功，记录历史
          if (result.success && result.savedPath) {
            await addHistoryRecord({
              url: context.url,
              title: context.title,
              domain: new URL(context.url).hostname,
              filename: context.filename,
              savePath: result.savedPath,
              saveLocation: strategy === 'local' ? 'local' : 'webdav',
              contentPreview: context.markdown.substring(0, 100),
              fileSize: result.metadata?.fileSize || new Blob([context.markdown]).size
            });
          }

          sendResponse(result);
        } catch (error) {
          console.error('[SaveStrategy] Save error:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode: 'UNKNOWN'
          } as SaveResult);
        }
      })();
      return true; // 保持消息通道开放
    }

    // ========================================
    // 旧的消息处理（保持向后兼容）
    // ========================================

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
