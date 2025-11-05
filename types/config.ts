// Configuration related types
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path: string;
  authType: 'basic' | 'digest';
}

export interface ExtensionConfig {
  configVersion?: string;           // 配置版本号，用于未来兼容性
  configSyncDir?: string;            // WebDAV配置同步目录路径
  downloadDirectory: 'default' | 'custom';
  customDownloadPath: string;
  titleTemplate: string;
  contentTemplate: string;
  webdav: WebDAVConfig;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  configVersion: '1.0.0',
  configSyncDir: '',
  downloadDirectory: 'default',
  customDownloadPath: '',
  titleTemplate: '{{title}}',
  contentTemplate: `---
原文链接: {{url}}
保存时间: {{date}}
---

{{content}}`,
  webdav: {
    url: '',
    username: '',
    password: '',
    path: '/',
    authType: 'basic'
  }
};