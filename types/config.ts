// Configuration related types
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  path: string;
}

export interface ExtensionConfig {
  saveMethod: 'local' | 'webdav';
  downloadDirectory: 'default' | 'custom';
  customDownloadPath: string;
  titleTemplate: string;
  contentTemplate: string;
  webdav: WebDAVConfig;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  saveMethod: 'local',
  downloadDirectory: 'default',
  customDownloadPath: '',
  titleTemplate: '<%= title %>_<%= date %>',
  contentTemplate: `# <%= title %>

**原文链接**: <%= url %>
**保存时间**: <%= date %>
**网站**: <%= domain %>

---

<%= content %>`,
  webdav: {
    url: '',
    username: '',
    password: '',
    path: '/'
  }
};

export type SaveMethod = ExtensionConfig['saveMethod'];