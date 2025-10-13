import type { WebDAVConfig } from './config';

/**
 * 扩展消息类型定义
 * 用于 popup、content script 和 background script 之间的通信
 */

// ============= 消息类型 =============

export type ExtensionMessage =
  | StartSelectionMessage
  | ExtractSelectionMessage
  | ExtractFullPageMessage
  | DownloadFileMessage
  | WebDAVUploadMessage;

// ============= 请求消息 =============

/**
 * 启动选择模式
 */
export interface StartSelectionMessage {
  type: 'START_SELECTION';
}

/**
 * 提取当前选中的内容
 */
export interface ExtractSelectionMessage {
  type: 'EXTRACT_SELECTION';
}

/**
 * 提取整个页面内容
 */
export interface ExtractFullPageMessage {
  type: 'EXTRACT_FULL_PAGE';
}

/**
 * 页面信息（用于历史记录）
 */
export interface PageInfo {
  url: string;
  title: string;
  domain: string;
  contentPreview: string;
}

/**
 * 下载文件到本地
 */
export interface DownloadFileMessage {
  type: 'DOWNLOAD_FILE';
  data: {
    filename: string;
    content: string;
    downloadPath?: string;
    pageInfo?: PageInfo;
  };
}

/**
 * 上传文件到 WebDAV
 */
export interface WebDAVUploadMessage {
  type: 'WEBDAV_UPLOAD';
  data: {
    filename: string;
    content: string;
    webdavConfig: WebDAVConfig;
    overwrite: boolean;
    pageInfo?: PageInfo;
  };
}

// ============= 响应类型 =============

/**
 * 基础响应接口
 */
export interface BaseResponse {
  success: boolean;
  error?: string;
}

/**
 * 提取内容响应
 */
export interface ExtractContentResponse extends BaseResponse {
  data?: {
    html: string;
    markdown: string;
    title: string;
    url: string;
    timestamp: string;
  };
}

/**
 * 下载文件响应
 */
export interface DownloadFileResponse extends BaseResponse {
  downloadId?: number;
}

/**
 * WebDAV 上传响应
 */
export interface WebDAVUploadResponse extends BaseResponse {
  finalPath?: string;
  fileExists?: boolean;  // 文件是否已存在
}

// ============= 类型守卫 =============

export function isStartSelectionMessage(msg: any): msg is StartSelectionMessage {
  return msg?.type === 'START_SELECTION';
}

export function isExtractSelectionMessage(msg: any): msg is ExtractSelectionMessage {
  return msg?.type === 'EXTRACT_SELECTION';
}

export function isExtractFullPageMessage(msg: any): msg is ExtractFullPageMessage {
  return msg?.type === 'EXTRACT_FULL_PAGE';
}

export function isDownloadFileMessage(msg: any): msg is DownloadFileMessage {
  return msg?.type === 'DOWNLOAD_FILE';
}

export function isWebDAVUploadMessage(msg: any): msg is WebDAVUploadMessage {
  return msg?.type === 'WEBDAV_UPLOAD';
}
