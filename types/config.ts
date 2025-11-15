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

  // 图片下载配置（可选，向后兼容）
  imageDownload?: {
    enabled: boolean;              // 是否启用图片下载，默认 false
  };

  // 历史记录同步配置（可选，向后兼容）
  historySync?: {
    enabled: boolean;              // 是否启用历史记录同步，默认 false
    autoSyncOnStartup?: boolean;   // 启动时自动同步，默认 true
    syncDir?: string;              // 同步目录，默认使用 configSyncDir
  };
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  configVersion: '1.0.0',
  configSyncDir: '',
  downloadDirectory: 'default',
  customDownloadPath: '',

  // 文件名模板
  // 支持的变量：
  // - 基础: {{title}}, {{url}}, {{domain}}
  // - 时间（基于 dayjs）:
  //   年月日: {{YYYY}}, {{YY}}, {{MM}}, {{M}}, {{DD}}, {{D}}
  //   时分秒: {{HH}}, {{H}}, {{hh}}, {{h}}, {{mm}}, {{m}}, {{ss}}, {{s}}
  //   星期: {{d}}, {{dd}}, {{ddd}}
  //   组合（向后兼容）: {{date}} (YYYY-MM-DD), {{time}} (HH:mm:ss)
  // 示例:
  // - "{{title}}" -> article
  // - "{{YYYY}}/{{MM}}/{{title}}" -> 2025/01/article
  // - "{{title}}_{{YYYY}}{{MM}}{{DD}}" -> article_20250110
  titleTemplate: '{{title}}',

  // 内容模板
  // 支持所有文件名模板变量 + {{content}}
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
  },
  imageDownload: {
    enabled: false  // 默认禁用，保持向后兼容
  },
  historySync: {
    enabled: false,          // 默认禁用，保持向后兼容
    autoSyncOnStartup: true  // 启用后默认自动同步
  }
};