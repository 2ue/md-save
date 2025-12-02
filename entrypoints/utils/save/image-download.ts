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

    // 3. 生成文档标识符（使用filename的简单哈希）
    const docId = this.simpleHash(filename);

    // 4. 生成映射表（使用 docId_index 避免多文档共享assets时文件名冲突）
    const tasks: ImageTask[] = urls.map((url, index) => {
      const ext = this.getExtension(url) || 'png';
      const imgFilename = `img_${docId}_${index}.${ext}`;

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
   * @param onProgress 可选的进度回调 (当前完成数, 总数)
   * @returns { tasks: 更新后的任务, markdown: 修复后的 Markdown }
   */
  async download(
    tasks: ImageTask[],
    markdown: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ tasks: ImageTask[]; markdown: string }> {
    console.log('[ImageDownloadService] Starting download for', tasks.length, 'images');

    // 并行下载所有图片
    let completedCount = 0;
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
        } finally {
          // 每完成一张图片，更新进度
          completedCount++;
          onProgress?.(completedCount, tasks.length);
        }
        return task;
      })
    );

    // 回退失败的图片引用到原始 URL
    let fixedMarkdown = markdown;
    const failedTasks = downloadedTasks.filter(task => task.status === 'failed');

    if (failedTasks.length > 0) {
      console.log('[ImageDownloadService] Reverting', failedTasks.length, 'failed images to original URLs');

      fixedMarkdown = this.revertFailedTasks(fixedMarkdown, failedTasks);
    }

    return { tasks: downloadedTasks, markdown: fixedMarkdown };
  }

  /**
   * 提取 Markdown 中的图片 URL
   */
  private extractImageUrls(markdown: string): string[] {
    // 匹配 ![alt](url) 格式，url 可为任意 scheme（http/https/blob/data 等）
    const regex = /!\[.*?\]\(([^)]+)\)/g;
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

  /**
   * 将给定任务对应的本地路径在 Markdown 中回退为原始 URL
   *
   * 用于两种场景：
   * - 图片下载失败（download 阶段）
   * - 图片上传/保存失败（各保存策略内部）
   */
  revertFailedTasks(markdown: string, tasks: ImageTask[]): string {
    let fixed = markdown;

    tasks.forEach(task => {
      const escapedLocalPath = this.escapeRegex(task.localPath);
      const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedLocalPath}\\)`, 'g');
      fixed = fixed.replace(regex, `![$1](${task.originalUrl})`);
    });

    return fixed;
  }

  /**
   * 生成字符串的简单哈希值（用于文档标识）
   *
   * 使用djb2算法生成32位哈希，返回8位十六进制字符串
   * 这是一个快速、确定性的哈希函数，适合文件名去重场景
   *
   * @param str 输入字符串
   * @returns 8位十六进制哈希字符串
   */
  private simpleHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
      hash = hash & hash; // Convert to 32bit integer
    }
    // Convert to unsigned 32bit integer and then to hex
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
