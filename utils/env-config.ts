/**
 * 环境变量配置预加载
 * 从环境变量读取默认配置，仅当用户未配置时自动应用
 * 用户可以通过设置页面随时修改覆盖这些配置
 */

import type { ExtensionConfig } from '@/types';

/**
 * 从环境变量读取配置
 * @returns 基于环境变量的配置对象
 */
export function getEnvConfig(): Partial<ExtensionConfig> {
  const config: Partial<ExtensionConfig> = {};

  // WebDAV 配置
  if (import.meta.env.VITE_WEBDAV_URL) {
    config.webdav = {
      url: import.meta.env.VITE_WEBDAV_URL,
      username: import.meta.env.VITE_WEBDAV_USERNAME || '',
      password: import.meta.env.VITE_WEBDAV_PASSWORD || '',
      path: import.meta.env.VITE_WEBDAV_PATH || '/',
      authType: (import.meta.env.VITE_WEBDAV_AUTH_TYPE as 'basic' | 'digest') || 'basic'
    };
  }

  // 文件名模板
  if (import.meta.env.VITE_TITLE_TEMPLATE) {
    config.titleTemplate = import.meta.env.VITE_TITLE_TEMPLATE;
  }

  // 内容模板 (处理换行符)
  if (import.meta.env.VITE_CONTENT_TEMPLATE) {
    config.contentTemplate = import.meta.env.VITE_CONTENT_TEMPLATE.replace(/\\n/g, '\n');
  }

  // 下载目录配置
  if (import.meta.env.VITE_DOWNLOAD_DIRECTORY) {
    config.downloadDirectory = import.meta.env.VITE_DOWNLOAD_DIRECTORY as 'default' | 'custom';
  }

  if (import.meta.env.VITE_CUSTOM_DOWNLOAD_PATH) {
    config.customDownloadPath = import.meta.env.VITE_CUSTOM_DOWNLOAD_PATH;
  }

  // 配置同步目录
  if (import.meta.env.VITE_CONFIG_SYNC_DIR) {
    config.configSyncDir = import.meta.env.VITE_CONFIG_SYNC_DIR;
  }

  return config;
}

/**
 * 检查是否为开发模式
 */
export function isDevelopmentMode(): boolean {
  return import.meta.env.VITE_DEV_MODE === 'true' || import.meta.env.MODE === 'development';
}

/**
 * 应用环境变量配置
 * @param baseConfig 基础配置
 * @returns 合并后的配置
 */
export function applyEnvConfig(baseConfig: ExtensionConfig): ExtensionConfig {
  const envConfig = getEnvConfig();
  return { ...baseConfig, ...envConfig };
}

/**
 * 生成环境配置说明文本
 */
export function getEnvConfigInfo(): string {
  const envConfig = getEnvConfig();
  const lines = ['🚀 环境变量配置已自动加载：'];

  if (envConfig.webdav?.url) {
    lines.push(`WebDAV 服务器: ${envConfig.webdav.url}`);
    if (envConfig.webdav.username) {
      lines.push(`用户名: ${envConfig.webdav.username}`);
    }
    if (envConfig.webdav.path) {
      lines.push(`保存路径: ${envConfig.webdav.path}`);
    }
  }

  if (envConfig.titleTemplate) {
    lines.push(`文件名模板: ${envConfig.titleTemplate}`);
  }

  if (envConfig.downloadDirectory) {
    lines.push(`下载目录: ${envConfig.downloadDirectory}`);
    if (envConfig.customDownloadPath) {
      lines.push(`自定义路径: ${envConfig.customDownloadPath}`);
    }
  }

  if (envConfig.configSyncDir) {
    lines.push(`配置同步目录: ${envConfig.configSyncDir}`);
  }

  lines.push('');
  lines.push('💡 提示：这些是环境变量提供的默认配置');
  lines.push('   您可以在设置页面随时修改这些配置');

  return lines.join('\n');
}

/**
 * 检查环境变量配置是否有效
 */
export function hasValidEnvConfig(): boolean {
  const config = getEnvConfig();
  return Object.keys(config).length > 0;
}