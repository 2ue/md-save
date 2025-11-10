/**
 * Local 保存策略
 *
 * 特点：
 * - 有图片：多文件下载（智能路径检测）
 * - 无图片：直接下载 Markdown
 */

import { BaseSaveStrategy } from './base';
import type { SaveContext, SaveResult, ValidationResult, ExtensionConfig } from '../types';

export class LocalSaveStrategy extends BaseSaveStrategy {
  readonly name = 'local';
  readonly displayName = 'Local Download';

  requiresBackground(): boolean {
    // Local 保存需要使用 background script 的 downloads API
    return true;
  }

  validate(config: ExtensionConfig): ValidationResult {
    // Local 保存无需特殊配置验证
    return { valid: true };
  }

  async save(context: SaveContext): Promise<SaveResult> {
    // LocalSaveStrategy 在 Content Script 中作为代理
    // 实际执行会通过 SaveStrategyManager 转发到 Background Script
    throw new Error('LocalSaveStrategy must run in background script');
  }
}


/**
 * Local 保存策略实现（Background Script 专用）
 *
 * 使用 browser.downloads API 下载文件
 */
export class LocalSaveStrategyImpl extends LocalSaveStrategy {
  async save(context: SaveContext): Promise<SaveResult> {
    try {
      // 有图片：下载多个文件（Markdown + 所有图片）
      if (context.images && context.images.length > 0) {
        return await this.saveAsMultipleFiles(context);
      }

      // 无图片：直接下载 Markdown
      return await this.saveAsMarkdown(context);
    } catch (error) {
      console.error('[LocalSaveStrategyImpl] Save failed:', error);
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred',
        'UNKNOWN'
      );
    }
  }

  /**
   * 保存为 Markdown 文件
   */
  private async saveAsMarkdown(context: SaveContext): Promise<SaveResult> {
    try {
      // 获取自定义下载路径
      const downloadPath = this.getDownloadPath(context.config);

      // 构建安全的文件路径
      const safePath = downloadPath
        ? `${downloadPath}/${context.filename}.md`
        : `${context.filename}.md`;

      // 使用 browser.downloads API 下载
      const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(context.markdown)}`;

      const downloadOptions: any = {
        url: dataUrl,
        filename: safePath
      };

      // 如果没有自定义路径，显示另存为对话框
      if (!downloadPath) {
        downloadOptions.saveAs = true;
      }

      const downloadId = await browser.downloads.download(downloadOptions);

      const fileSize = new Blob([context.markdown]).size;

      return this.createSuccessResult(
        safePath,
        1,
        {
          fileSize,
          downloadId
        }
      );
    } catch (error) {
      console.error('[LocalSaveStrategyImpl] Markdown save failed:', error);
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Download failed',
        'PERMISSION'
      );
    }
  }

  /**
   * 保存为多个文件（Markdown + 图片）
   */
  private async saveAsMultipleFiles(context: SaveContext): Promise<SaveResult> {
    try {
      console.log('[LocalSaveStrategyImpl] Starting multi-file download...');

      // 获取自定义下载路径
      const downloadPath = this.getDownloadPath(context.config);

      // 1. 下载 Markdown 文件
      const mdDataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(context.markdown)}`;
      const mdSafePath = downloadPath
        ? `${downloadPath}/${context.filename}.md`
        : `${context.filename}.md`;

      const mdDownloadOptions: any = {
        url: mdDataUrl,
        filename: mdSafePath
      };

      // 如果没有自定义路径，显示另存为对话框（只对主文件）
      if (!downloadPath) {
        mdDownloadOptions.saveAs = true;
      }

      const mdDownloadId = await browser.downloads.download(mdDownloadOptions);
      console.log('[LocalSaveStrategyImpl] Markdown download started, ID:', mdDownloadId);

      // 2. 计算图片下载的基础路径
      let imageBasePath = '';
      if (!downloadPath) {
        // 等待主文件下载完成，获取用户选择的路径
        imageBasePath = await this.waitForDownloadPath(mdDownloadId, context.filename);
      } else {
        // 使用配置的路径
        imageBasePath = downloadPath;
      }

      // 3. 提取 filename 中的目录部分（与 Markdown 文件同级）
      const filenameDir = context.filename.includes('/')
        ? context.filename.substring(0, context.filename.lastIndexOf('/') + 1)
        : '';

      // 4. 并行下载所有图片到 assets/ 子目录
      const { successCount, failedCount } = this.getImageStats(context);
      const imageDownloadIds: number[] = [];

      if (successCount > 0) {
        console.log('[LocalSaveStrategyImpl] Downloading', successCount, 'images...');

        const imagePromises = context.images!
          .filter(task => task.status === 'success' && task.blob)
          .map(async (task) => {
            // 图片保存到与 Markdown 同级的 assets/ 目录
            const imagePath = `${imageBasePath}/${filenameDir}assets/${task.filename}`;
            const imageUrl = URL.createObjectURL(task.blob!); // 已通过 filter 检查

            return browser.downloads.download({
              url: imageUrl,
              filename: imagePath,
              saveAs: false  // 不显示另存为对话框
            });
          });

        const results = await Promise.allSettled(imagePromises);

        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            imageDownloadIds.push(result.value);
            console.log('[LocalSaveStrategyImpl] Image download started, ID:', result.value);
          } else {
            console.error('[LocalSaveStrategyImpl] Image download failed:', result.reason);
          }
        });
      }

      console.log('[LocalSaveStrategyImpl] Multi-file download complete:', {
        markdown: mdSafePath,
        images: successCount,
        failed: failedCount
      });

      const fileSize = new Blob([context.markdown]).size;

      return this.createSuccessResult(
        mdSafePath,
        1 + successCount,
        {
          fileSize,
          imageCount: successCount,
          imagesFailedCount: failedCount,
          downloadId: mdDownloadId,
          imageDownloadIds
        }
      );
    } catch (error) {
      console.error('[LocalSaveStrategyImpl] Multi-file save failed:', error);
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Multi-file download failed',
        'UNKNOWN'
      );
    }
  }

  /**
   * 等待下载完成并获取实际路径
   */
  private async waitForDownloadPath(downloadId: number, filename: string): Promise<string> {
    return new Promise((resolve) => {
      const checkDownload = async () => {
        try {
          const downloads = await browser.downloads.search({
            id: downloadId,
            limit: 1
          });

          if (downloads.length > 0) {
            const download = downloads[0];

            if (download.state === 'complete') {
              // 获取下载完成的实际路径
              if (download.filename) {
                const fullPath = download.filename;
                // 移除文件名，返回目录路径
                const dirPath = fullPath.replace(`/${filename}.md`, '');
                console.log('[LocalSaveStrategyImpl] Download directory detected:', dirPath);
                resolve(dirPath);
                return;
              }
            } else if (download.state === 'interrupted') {
              console.warn('[LocalSaveStrategyImpl] Download interrupted, using default path');
              resolve(''); // 使用默认路径
              return;
            }
          }
        } catch (error) {
          console.error('[LocalSaveStrategyImpl] Error checking download:', error);
        }

        // 继续等待
        setTimeout(checkDownload, 100);
      };

      checkDownload();
    });
  }

  /**
   * 获取自定义下载路径
   */
  private getDownloadPath(config: ExtensionConfig): string {
    if (config.downloadDirectory === 'custom' && config.customDownloadPath) {
      return config.customDownloadPath.trim();
    }
    return '';
  }
}
