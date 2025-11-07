/**
 * 图片下载服务
 *
 * Linus 原则：简单直接，不做多余的事
 */

import type { ImageTask } from './types';

export class ImageDownloadService {
  /**
   * 准备图片下载（提取 + 生成映射）
   *
   * @param markdown 原始 Markdown
   * @param filename Markdown 文件名（用于提取目录结构）
   * @returns 替换后的 Markdown + 图片任务列表
   */
  prepare(markdown: string, filename: string): { markdown: string; tasks: ImageTask[] } {
    // 1. 提取图片 URL
    const urls = this.extractImageUrls(markdown);

    console.log('[ImageDownloadService] Extracted image URLs:', urls);

    // 2. 提取 Markdown 文件的目录部分（统一在这里处理）
    const filenameDir = filename.includes('/')
      ? filename.substring(0, filename.lastIndexOf('/') + 1)
      : '';

    console.log('[ImageDownloadService] Filename directory:', filenameDir || '(root)');

    // 3. 生成映射表（包含 WebDAV 完整路径）
    const tasks: ImageTask[] = urls.map((url, index) => {
      const ext = this.getExtension(url) || 'png';
      const imgFilename = `img_${index}.${ext}`;

      return {
        originalUrl: url,
        localPath: `./assets/${imgFilename}`,          // Markdown 引用路径
        filename: imgFilename,                         // 纯文件名（Local 用）
        webdavPath: `${filenameDir}assets/${imgFilename}`,  // WebDAV 完整路径
        status: 'pending'
      };
    });

    // 4. 替换 Markdown 中的 URL（立即执行，不等待下载）
    const replacedMarkdown = this.replaceUrls(markdown, tasks);

    console.log('[ImageDownloadService] Generated tasks:', tasks.length);

    return { markdown: replacedMarkdown, tasks };
  }

  /**
   * 下载图片（Background Script 中执行）
   *
   * @param tasks 图片任务列表
   * @param markdown 原始已替换的 Markdown
   * @returns { tasks: 更新后的任务, markdown: 修复后的 Markdown }
   */
  async download(
    tasks: ImageTask[],
    markdown: string
  ): Promise<{ tasks: ImageTask[]; markdown: string }> {
    console.log('[ImageDownloadService] Starting download for', tasks.length, 'images');

    // 并行下载所有图片
    const downloadedTasks = await Promise.all(
      tasks.map(async (task) => {
        try {
          task.status = 'downloading';
          console.log('[ImageDownloadService] Downloading:', task.originalUrl);

          const response = await fetch(task.originalUrl);  // 无 CORS 限制（Background Script）

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          task.blob = await response.blob();
          task.status = 'success';
          console.log('[ImageDownloadService] Downloaded:', task.filename, `(${task.blob.size} bytes)`);
        } catch (error) {
          task.status = 'failed';
          task.error = error instanceof Error ? error.message : String(error);
          console.warn('[ImageDownloadService] Failed to download:', task.originalUrl, error);
        }
        return task;
      })
    );

    // 回退失败的图片引用到原始 URL
    let fixedMarkdown = markdown;
    const failedTasks = downloadedTasks.filter(task => task.status === 'failed');

    if (failedTasks.length > 0) {
      console.log('[ImageDownloadService] Reverting', failedTasks.length, 'failed images to original URLs');

      failedTasks.forEach(task => {
        // 将本地路径替换回原始 URL
        const escapedLocalPath = this.escapeRegex(task.localPath);
        const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedLocalPath}\\)`, 'g');
        fixedMarkdown = fixedMarkdown.replace(regex, `![$1](${task.originalUrl})`);
      });
    }

    return { tasks: downloadedTasks, markdown: fixedMarkdown };
  }

  /**
   * 提取 Markdown 中的图片 URL
   */
  private extractImageUrls(markdown: string): string[] {
    // 匹配 ![alt](url) 格式
    const regex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g;
    const urls: string[] = [];
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      urls.push(match[1]);
    }

    // 去重
    return Array.from(new Set(urls));
  }

  /**
   * 替换 Markdown 中的图片 URL 为本地路径
   */
  private replaceUrls(markdown: string, tasks: ImageTask[]): string {
    let result = markdown;

    tasks.forEach(task => {
      // 创建精确匹配的正则（转义特殊字符）
      const escapedUrl = this.escapeRegex(task.originalUrl);
      const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedUrl}\\)`, 'g');

      result = result.replace(regex, `![$1](${task.localPath})`);
    });

    return result;
  }

  /**
   * 从 URL 中提取文件扩展名
   */
  private getExtension(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.([a-z0-9]+)$/i);
      return match ? match[1].toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
