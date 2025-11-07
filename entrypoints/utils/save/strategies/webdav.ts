/**
 * WebDAV 保存策略
 *
 * 特点：
 * - 批量上传（Markdown + 所有图片）
 * - 保持目录结构（不打包）
 * - 必须在 Background Script 执行（CORS）
 */

import { BaseSaveStrategy } from './base';
import type { SaveContext, SaveResult, ValidationResult, ExtensionConfig } from '../types';

export class WebDAVSaveStrategy extends BaseSaveStrategy {
  readonly name = 'webdav';
  readonly displayName = 'WebDAV Upload';

  requiresBackground(): boolean {
    // WebDAV 必须在 Background Script 执行（CORS）
    return true;
  }

  validate(config: ExtensionConfig): ValidationResult {
    const errors: string[] = [];

    if (!config.webdav?.url) {
      errors.push('WebDAV URL is required');
    }

    if (!config.webdav?.username || !config.webdav?.password) {
      errors.push('WebDAV credentials are required');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  async save(context: SaveContext): Promise<SaveResult> {
    // WebDAV 逻辑必须在 Background Script 执行
    // 这里只是接口实现，实际调用会通过消息传递
    throw new Error('WebDAVSaveStrategy must run in background script');
  }
}

/**
 * WebDAV 保存策略实现（Background Script 专用）
 *
 * 这个类在 background.ts 中使用，有权访问 WebDAVClient
 */
export class WebDAVSaveStrategyImpl extends WebDAVSaveStrategy {
  async save(context: SaveContext): Promise<SaveResult> {
    try {
      // 动态导入 WebDAVClient（避免循环依赖）
      const { WebDAVClient } = await import('@/utils/webdav-client');

      // 创建 WebDAV 客户端
      const client = new WebDAVClient(context.config.webdav);

      // 上传 Markdown 文件
      const mdPath = `${context.filename}.md`;
      const mdResult = await client.uploadFile(mdPath, context.markdown, false);

      if (!mdResult.success) {
        // 文件已存在
        if (mdResult.fileExists) {
          return this.createErrorResult(
            'File already exists',
            'VALIDATION'
          );
        }
        // 其他错误
        return this.createErrorResult(
          mdResult.error || 'WebDAV upload failed',
          'NETWORK'
        );
      }

      const finalPath = mdResult.finalPath || mdPath;
      const fileSize = new Blob([context.markdown]).size;

      // 如果有图片，批量上传
      let imageCount = 0;
      let imagesFailedCount = 0;

      if (context.images && context.images.length > 0) {
        const result = await this.uploadImages(client, context);
        imageCount = result.successCount;
        imagesFailedCount = result.failedCount;
      }

      return this.createSuccessResult(
        finalPath,
        1 + imageCount,
        {
          fileSize,
          imageCount,
          imagesFailedCount
        }
      );
    } catch (error) {
      console.error('[WebDAVSaveStrategyImpl] Save failed:', error);
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error occurred',
        'NETWORK'
      );
    }
  }

  /**
   * 批量上传图片到 WebDAV
   *
   * Linus原则：简单直接，失败不影响整体
   */
  private async uploadImages(
    client: any,
    context: SaveContext
  ): Promise<{ successCount: number; failedCount: number }> {
    console.log('[WebDAVSaveStrategyImpl] Starting image upload...');

    // 1. 过滤出成功下载的图片
    const successfulImages = context.images!.filter(
      task => task.status === 'success' && task.blob
    );

    if (successfulImages.length === 0) {
      console.log('[WebDAVSaveStrategyImpl] No images to upload');
      return { successCount: 0, failedCount: context.images!.length };
    }

    console.log('[WebDAVSaveStrategyImpl] Uploading', successfulImages.length, 'images');

    // 2. 并行上传所有图片（使用 allSettled 来容忍部分失败）
    // 路径已在 ImageDownloadService 中预计算好
    const uploadPromises = successfulImages.map(async (task) => {
      try {
        // 直接使用预计算的 WebDAV 路径（包含完整目录结构）
        const webdavPath = task.webdavPath;

        // Blob → ArrayBuffer（WebDAV client 支持）
        const arrayBuffer = await task.blob!.arrayBuffer();

        // 上传图片（覆盖模式，因为已经通过 Markdown 文件名去重了）
        const result = await client.uploadFile(webdavPath, arrayBuffer, true);

        if (result.success) {
          console.log('[WebDAVSaveStrategyImpl] Uploaded:', task.filename);
          return { success: true };
        } else {
          console.warn('[WebDAVSaveStrategyImpl] Upload failed:', task.filename, result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('[WebDAVSaveStrategyImpl] Upload error:', task.filename, error);
        return { success: false, error: String(error) };
      }
    });

    const results = await Promise.allSettled(uploadPromises);

    // 3. 统计结果
    let successCount = 0;
    let failedCount = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
      } else {
        failedCount++;
        if (result.status === 'rejected') {
          console.error('[WebDAVSaveStrategyImpl] Promise rejected:', result.reason);
        }
      }
    });

    // 加上原本就失败的图片数量
    failedCount += context.images!.length - successfulImages.length;

    console.log('[WebDAVSaveStrategyImpl] Upload complete:', {
      total: context.images!.length,
      success: successCount,
      failed: failedCount
    });

    return { successCount, failedCount };
  }
}
