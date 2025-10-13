// Configuration related types
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path: string;
  authType: 'basic' | 'digest';
}

export interface ExtensionConfig {
  downloadDirectory: 'default' | 'custom';
  customDownloadPath: string;
  titleTemplate: string;
  contentTemplate: string;
  webdav: WebDAVConfig;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
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