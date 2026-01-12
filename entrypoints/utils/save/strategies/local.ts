/**
 * Local 保存策略
 *
 * 特点：
 * - 有图片：多文件下载（智能路径检测）
 * - 无图片：直接下载 Markdown
 */

import { BaseSaveStrategy } from './base';
import { BrowserDownload } from '../browser-download';
import type { DownloadResult } from '../browser-download';
import type { SaveContext, SaveResult, ValidationResult, ExtensionConfig, ImageTask } from '../types';

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
      const downloader = new BrowserDownload({
        url: dataUrl,
        filename: safePath,
        saveAs: false
      });

      const { id: downloadId, filename: realPath } = await downloader.download();
      const resolvedPath = realPath || safePath;

      const fileSize = new Blob([context.markdown]).size;

      return this.createSuccessResult(
        resolvedPath,
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
      const basePath = downloadPath ? `${downloadPath}/` : '';
      const mdSafePath = `${basePath}${context.filename}.md`;

      console.log('[LocalSaveStrategyImpl][Debug] Markdown save path:', {
        downloadPath,
        basePath,
        contextFilename: context.filename,
        mdSafePath
      });

      const mdDownloader = new BrowserDownload({
        url: mdDataUrl,
        filename: mdSafePath,
        saveAs: false
      });

      const { id: mdDownloadId, filename: mdRealPath } = await mdDownloader.download();
      const resolvedMarkdownPath = mdRealPath || mdSafePath;
      console.log('[LocalSaveStrategyImpl] Markdown saved to:', resolvedMarkdownPath);

      // 2. 计算图片保存路径前缀（与 Markdown 同级目录下的 assets/）
      const filenameDir = context.filename.includes('/')
        ? context.filename.substring(0, context.filename.lastIndexOf('/') + 1)
        : '';
      const assetsDir = this.getAssetsDir(context);
      const imageBasePrefix = `${basePath}${filenameDir}${assetsDir}/`;

      console.log('[LocalSaveStrategyImpl][Debug] Image base prefix:', {
        filenameDir,
        assetsDir,
        imageBasePrefix
      });

      // 3. 并行下载所有图片到 assets/ 子目录
      const allImages = context.images || [];
      const blobTasks = allImages.filter(task => task.status === 'success' && task.blob);
      const initialFailedCount = allImages.filter(task => task.status === 'failed').length;

      const imageResults = await Promise.allSettled(
        blobTasks.map((task) => this.downloadImageTask(task, imageBasePrefix))
      );

      const imageDownloadIds: number[] = [];
      let browserDownloadFailures = 0;

      imageResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { task, downloadResult } = result.value;
          imageDownloadIds.push(downloadResult.id);
          console.log('[LocalSaveStrategyImpl] Image saved:', {
            filename: task.filename,
            realPath: downloadResult.filename
          });
        } else {
          browserDownloadFailures += 1;
          const failure = result.reason as { task?: ImageTask; error?: unknown };
          console.error('[LocalSaveStrategyImpl] Image download failed:', {
            filename: failure?.task?.filename,
            error: failure?.error ?? result.reason
          });
        }
      });

      const savedImagesCount = imageDownloadIds.length;
      const totalFailedImages = initialFailedCount + browserDownloadFailures;

      console.log('[LocalSaveStrategyImpl] Multi-file download complete:', {
        markdown: resolvedMarkdownPath,
        imagesSaved: savedImagesCount,
        failed: totalFailedImages
      });

      const fileSize = new Blob([context.markdown]).size;

      return this.createSuccessResult(
        resolvedMarkdownPath,
        1 + savedImagesCount,
        {
          fileSize,
          imageCount: savedImagesCount,
          imagesFailedCount: totalFailedImages,
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
   * 获取自定义下载路径
   */
  private getDownloadPath(config: ExtensionConfig): string {
    if (config.downloadDirectory === 'custom' && config.customDownloadPath) {
      return config.customDownloadPath.trim();
    }
    return '';
  }

  private async downloadImageTask(
    task: ImageTask,
    imageBasePrefix: string
  ): Promise<{ task: ImageTask; downloadResult: DownloadResult }> {
    if (!task.blob) {
      throw { task, error: new Error('Image blob is missing') };
    }

    const imagePath = `${imageBasePrefix}${task.filename}`;
    const imageUrl = URL.createObjectURL(task.blob);

    const downloader = new BrowserDownload(
      {
        url: imageUrl,
        filename: imagePath,
        saveAs: false
      },
      () => {
        URL.revokeObjectURL(imageUrl);
        task.blob = undefined;
      }
    );

    try {
      const downloadResult = await downloader.download();
      return { task, downloadResult };
    } catch (error) {
      throw { task, error };
    }
  }
}
