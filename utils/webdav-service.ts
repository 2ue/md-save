/**
 * WebDAV 保存服务
 * 提取 popup 和 content script 中的公共 WebDAV 保存逻辑
 */

import type { WebDAVConfig } from '@/types/config';
import type { WebDAVUploadMessage, WebDAVUploadResponse } from '@/types/messages';
import type { ProcessedContent } from './content-service';
import { validateWebDAVConfig, isWebDAVConfigComplete } from './config-validator';
import { normalizeError, ErrorCode, createError } from './error-handler';
import { webdavLogger } from './logger';

/**
 * WebDAV 上传选项
 */
export interface WebDAVUploadOptions {
  /** 处理后的内容 */
  content: ProcessedContent;
  /** 文件名（用户可能修改过） */
  filename: string;
  /** WebDAV 配置 */
  webdavConfig: WebDAVConfig;
  /** 是否覆盖已存在的文件 */
  overwrite?: boolean;
  /** 页面信息（用于历史记录） */
  pageInfo?: {
    url: string;
    title: string;
    domain: string;
    contentPreview: string;
  };
}

/**
 * WebDAV 上传回调
 */
export interface WebDAVUploadCallbacks {
  /** 上传成功回调 */
  onSuccess?: (finalPath?: string) => void;
  /** 文件已存在回调 */
  onFileExists?: (filename: string) => void;
  /** 上传失败回调 */
  onError?: (error: string) => void;
}

/**
 * WebDAV 服务类
 */
export class WebDAVService {
  /**
   * 上传文件到 WebDAV
   *
   * @param options 上传选项
   * @param callbacks 回调函数
   * @returns Promise<boolean> 是否成功
   */
  static async uploadFile(
    options: WebDAVUploadOptions,
    callbacks: WebDAVUploadCallbacks = {}
  ): Promise<boolean> {
    const { content, filename, webdavConfig, overwrite = false, pageInfo } = options;
    const { onSuccess, onFileExists, onError } = callbacks;

    try {
      // 1. 验证配置
      webdavLogger.debug('Validating WebDAV config');
      const validation = validateWebDAVConfig(webdavConfig);
      if (!validation.valid) {
        const error = createError(
          ErrorCode.INVALID_CONFIG,
          validation.errors.join('；')
        );
        webdavLogger.warn('WebDAV config validation failed', { errors: validation.errors });
        onError?.(error.toUserMessage());
        return false;
      }

      // 2. 发送上传消息到 background script
      webdavLogger.debug('Sending upload request', {
        filename,
        contentLength: content.content.length,
        overwrite
      });

      const uploadResult = await browser.runtime.sendMessage({
        type: 'WEBDAV_UPLOAD',
        data: {
          filename,
          content: content.content,
          webdavConfig,
          overwrite,
          pageInfo
        }
      } as WebDAVUploadMessage) as WebDAVUploadResponse;

      // 3. 检查响应
      if (!uploadResult) {
        const error = createError(
          ErrorCode.UNKNOWN,
          '未收到来自 background script 的响应'
        );
        webdavLogger.error('No response from background script');
        onError?.(error.toUserMessage());
        return false;
      }

      // 4. 处理结果
      if (uploadResult.success) {
        webdavLogger.info('Upload successful', { finalPath: uploadResult.finalPath });
        onSuccess?.(uploadResult.finalPath);
        return true;
      } else if (uploadResult.fileExists) {
        webdavLogger.info('File already exists', { filename });
        onFileExists?.(filename);
        return false;
      } else {
        const error = normalizeError(uploadResult.error || '未知错误');
        webdavLogger.error('Upload failed', { error: uploadResult.error });
        onError?.(error.toUserMessage());
        return false;
      }
    } catch (error) {
      const appError = normalizeError(error);
      webdavLogger.error('Upload exception', appError.toJSON());
      onError?.(appError.toUserMessage());
      return false;
    }
  }

  /**
   * 快速检查 WebDAV 配置是否可用
   *
   * @param config WebDAV 配置
   * @returns 配置是否完整
   */
  static isConfigReady(config: WebDAVConfig | undefined): boolean {
    return isWebDAVConfigComplete(config);
  }

  /**
   * 获取配置验证结果（用于显示详细错误）
   *
   * @param config WebDAV 配置
   * @returns 验证结果
   */
  static validateConfig(config: WebDAVConfig | undefined) {
    return validateWebDAVConfig(config);
  }
}

/**
 * 便捷函数：上传到 WebDAV
 *
 * @param content 处理后的内容
 * @param filename 文件名
 * @param webdavConfig WebDAV 配置
 * @param callbacks 回调函数
 * @param pageInfo 页面信息（用于历史记录）
 * @returns Promise<boolean> 是否成功
 */
export async function uploadToWebDAV(
  content: ProcessedContent,
  filename: string,
  webdavConfig: WebDAVConfig,
  callbacks: WebDAVUploadCallbacks = {},
  pageInfo?: {
    url: string;
    title: string;
    domain: string;
    contentPreview: string;
  }
): Promise<boolean> {
  return WebDAVService.uploadFile(
    { content, filename, webdavConfig, overwrite: false, pageInfo },
    callbacks
  );
}
