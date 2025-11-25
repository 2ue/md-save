# 数据结构设计文档
## 核心数据模型与存储方案

**文档版本**：v1.0
**创建日期**：2025-01-25
**TypeScript 定义**：types/index.ts

---

## 一、核心数据结构

### 1.1 配置数据（ExtensionConfig）

```typescript
// types/config.ts

/**
 * 扩展配置 - 存储在 browser.storage.local
 */
export interface ExtensionConfig {
  // 配置版本（用于迁移）
  configVersion: string;              // 如 "2.0.0"

  // 基础设置
  basic: {
    locale: 'zh-CN' | 'en-US';        // 界面语言
    theme: 'light' | 'dark' | 'auto'; // 主题（未来）
  };

  // 保存配置
  save: {
    // 文件名模板
    titleTemplate: string;            // 如 "{{YYYY}}/{{MM}}/{{title}}"

    // 内容模板
    contentTemplate: string;          // Markdown 模板

    // 默认保存方式（记住上次选择）
    lastUsedStrategy: 'local' | 'webdav';

    // 默认保存目录（记住上次选择）
    lastUsedLocalPath?: string;       // 如 "C:/Users/xxx/notes"
    lastUsedWebDAVPath?: string;      // 如 "/notes/tech"
  };

  // 图片下载
  imageDownload: {
    enabled: boolean;                 // 是否启用
    autoDownload: boolean;            // 自动下载（不询问）
    maxSize: number;                  // 最大图片大小（MB），0=无限制
    saveDirectory: string;            // 子目录名，如 "assets"
  };

  // 元数据
  metadata: {
    // 预设标签库
    predefinedTags: string[];         // ["JavaScript", "Web API", ...]

    // 预设分类
    predefinedCategories: string[];   // ["技术文档", "博客文章", ...]

    // 启用标签自动建议
    autoSuggestTags: boolean;

    // 默认分类（可选）
    defaultCategory?: string;
  };

  // WebDAV 配置
  webdav: {
    url: string;                      // 如 "https://webdav.example.com"
    username: string;
    password: string;                 // 加密存储（AES-256）
    path: string;                     // 基础路径，如 "/notes"
    authType: 'basic' | 'digest';
    timeout: number;                  // 超时时间（秒），默认 30
  };

  // 模板预设
  templates: TemplatePreset[];        // 见下文

  // 自动同步配置
  autoSync: {
    enabled: boolean;                 // 总开关

    // 配置同步
    syncConfig: boolean;              // 是否同步配置
    configSyncDir: string;            // 配置文件存储目录

    // 历史同步
    syncHistory: boolean;             // 是否同步历史记录
    historySyncDir: string;           // 历史记录存储目录

    // 触发时机
    uploadOnSave: boolean;            // 保存内容时上传
    uploadOnConfigChange: boolean;    // 修改配置时上传
    downloadOnStartup: boolean;       // 启动时下载
    downloadInterval: number;         // 定时下载间隔（分钟），0=禁用
  };
}

/**
 * 模板预设
 */
export interface TemplatePreset {
  id: string;                         // 唯一 ID（nanoid）
  name: string;                       // 模板名称
  description?: string;               // 描述（可选）
  isBuiltin: boolean;                 // 是否内置模板
  titleTemplate: string;              // 文件名模板
  contentTemplate: string;            // 内容模板
  metadata: {
    defaultCategory?: string;         // 默认分类
    defaultTags?: string[];           // 默认标签
  };
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: ExtensionConfig = {
  configVersion: '2.0.0',
  basic: {
    locale: 'zh-CN',
    theme: 'auto'
  },
  save: {
    titleTemplate: '{{title}}',
    contentTemplate: `---
原文链接: {{url}}
保存时间: {{date}}
---

{{content}}`,
    lastUsedStrategy: 'local'
  },
  imageDownload: {
    enabled: true,
    autoDownload: false,
    maxSize: 0,
    saveDirectory: 'assets'
  },
  metadata: {
    predefinedTags: ['技术文档', 'Web开发', 'JavaScript', 'Tutorial'],
    predefinedCategories: ['技术文档', '博客文章', '新闻', '资料'],
    autoSuggestTags: true
  },
  webdav: {
    url: '',
    username: '',
    password: '',
    path: '/notes',
    authType: 'basic',
    timeout: 30
  },
  templates: BUILTIN_TEMPLATES, // 见下文
  autoSync: {
    enabled: false,
    syncConfig: true,
    configSyncDir: '/.clipper-config/',
    syncHistory: true,
    historySyncDir: '/.clipper-history/',
    uploadOnSave: true,
    uploadOnConfigChange: true,
    downloadOnStartup: true,
    downloadInterval: 0
  }
};

/**
 * 内置模板
 */
export const BUILTIN_TEMPLATES: TemplatePreset[] = [
  {
    id: 'default',
    name: '默认模板',
    description: '简洁的默认格式',
    isBuiltin: true,
    titleTemplate: '{{title}}',
    contentTemplate: `---
原文: {{url}}
时间: {{date}}
---

{{content}}`,
    metadata: {}
  },
  {
    id: 'tech-doc',
    name: '技术文档',
    description: '适合保存技术文档和教程',
    isBuiltin: true,
    titleTemplate: '{{YYYY}}/{{MM}}/{{title}}',
    contentTemplate: `---
title: {{title}}
url: {{url}}
date: {{date}}
tags: []
category: 技术文档
---

# {{title}}

> 📖 原文: {{url}}
> 🕐 保存时间: {{date}}

## 正文

{{content}}`,
    metadata: {
      defaultCategory: '技术文档'
    }
  },
  {
    id: 'blog',
    name: '博客文章',
    description: '适合保存博客文章',
    isBuiltin: true,
    titleTemplate: 'blog/{{domain}}/{{title}}',
    contentTemplate: `---
title: {{title}}
source: {{domain}}
url: {{url}}
date: {{date}}
tags: []
---

{{content}}`,
    metadata: {
      defaultCategory: '博客文章'
    }
  },
  {
    id: 'news',
    name: '新闻摘要',
    description: '简洁的新闻格式',
    isBuiltin: true,
    titleTemplate: 'news/{{YYYY}}/{{MM}}/{{DD}}-{{title}}',
    contentTemplate: `**{{title}}**

来源: {{domain}} | 时间: {{date}}

{{content}}`,
    metadata: {
      defaultCategory: '新闻'
    }
  }
];
```

---

### 1.2 历史记录数据（HistoryRecord）

```typescript
// types/history.ts

/**
 * 历史记录
 * 存储：browser.storage.local（少量）+ IndexedDB（大量）
 */
export interface HistoryRecord {
  // 基础信息
  id: string;                         // nanoid 生成的唯一 ID
  url: string;                        // 原始页面 URL
  title: string;                      // 页面标题
  domain: string;                     // 域名（用于分组）
  timestamp: number;                  // 保存时间戳（毫秒）

  // 保存信息
  saveLocation: 'local' | 'webdav';   // 保存位置
  savePath: string;                   // 完整保存路径
  filename: string;                   // 文件名（含目录）

  // 元数据
  metadata: {
    tags: string[];                   // 标签数组
    category?: string;                // 分类
    notes?: string;                   // 用户备注
    priority?: 1 | 2 | 3;             // 优先级（可选）
    readingStatus?: 'unread' | 'reading' | 'read'; // 阅读状态（可选）
  };

  // 内容统计
  stats: {
    wordCount: number;                // 字数统计
    imageCount: number;               // 图片数量
    fileSize: number;                 // 文件大小（字节）
    readingTime: number;              // 预估阅读时间（分钟）
  };

  // 内容预览
  contentPreview: string;             // 前 200 字符

  // 模板信息
  templateId?: string;                // 使用的模板 ID

  // 同步信息（用于合并）
  syncInfo: {
    lastModified: number;             // 最后修改时间戳
    deviceId: string;                 // 设备 ID（用于冲突解决）
    version: number;                  // 版本号（每次修改 +1）
  };
}

/**
 * 历史记录统计
 */
export interface HistoryStats {
  total: number;
  byLocation: {
    local: number;
    webdav: number;
  };
  byCategory: Record<string, number>; // {"技术文档": 50, "博客": 30}
  byMonth: Record<string, number>;    // {"2025-01": 20, "2024-12": 15}
  topTags: Array<{ tag: string; count: number }>; // 最常用的标签
  topDomains: Array<{ domain: string; count: number }>; // 最常访问的网站
}
```

---

### 1.3 保存上下文（SaveContext）

```typescript
// types/save.ts

/**
 * 保存上下文 - 传递给保存策略
 */
export interface SaveContext {
  // 内容数据
  content: {
    markdown: string;                 // Markdown 内容
    html?: string;                    // 原始 HTML（可选，用于重新转换）
    title: string;                    // 页面标题
    url: string;                      // 页面 URL
  };

  // 元数据
  metadata: {
    filename: string;                 // 文件名（用户编辑后的）
    tags: string[];
    category?: string;
    notes?: string;
  };

  // 保存配置
  saveConfig: {
    strategy: 'local' | 'webdav';     // 保存策略
    location: string;                 // 保存位置（目录）
    overwrite: boolean;               // 是否覆盖同名文件
  };

  // 图片信息
  images?: ImageTask[];               // 图片下载任务（见下文）

  // 模板信息
  template?: {
    id: string;
    titleTemplate: string;
    contentTemplate: string;
  };
}

/**
 * 图片下载任务
 */
export interface ImageTask {
  originalUrl: string;                // 原始 URL
  localPath: string;                  // 本地路径（./assets/img_001.jpg）
  filename: string;                   // 文件名（img_001.jpg）
  status: 'pending' | 'downloading' | 'success' | 'failed';
  blob?: Blob;                        // 下载后的 Blob（Background Script）
  error?: string;                     // 错误信息
}

/**
 * 保存结果
 */
export interface SaveResult {
  success: boolean;
  error?: string;
  errorCode?: 'VALIDATION' | 'NETWORK' | 'PERMISSION' | 'CONFLICT' | 'UNKNOWN';

  // 保存路径
  savePath?: string;                  // 完整路径

  // 图片统计
  imageStats?: {
    total: number;
    success: number;
    failed: number;
  };

  // 警告信息
  warnings?: string[];                // 如 "2 张图片下载失败"
}
```

---

### 1.4 提取内容数据（ExtractedContent）

```typescript
// types/content.ts

/**
 * 提取的内容 - Content Extractor 输出
 */
export interface ExtractedContent {
  // 基础信息
  title: string;
  url: string;
  domain: string;

  // 内容
  html: string;                       // 提取的 HTML
  markdown: string;                   // 转换后的 Markdown
  text: string;                       // 纯文本（用于搜索）

  // 元数据
  metadata: {
    author?: string;                  // 作者（如果有）
    publishDate?: string;             // 发布时间（如果有）
    description?: string;             // 摘要（meta description）
    keywords?: string[];              // 关键词（meta keywords）
  };

  // 统计
  stats: {
    wordCount: number;
    imageCount: number;
    readingTime: number;
  };

  // 图片列表
  images: Array<{
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;

  // 提取时间
  extractedAt: number;                // 时间戳
}

/**
 * 多段选择内容
 */
export interface MultiSelectionContent {
  selections: Array<{
    order: number;                    // 选择顺序
    element: HTMLElement;             // 选中的元素
    html: string;                     // HTML
    markdown: string;                 // Markdown
    rect: DOMRect;                    // 位置信息（用于高亮）
  }>;

  // 合并后的内容
  merged: ExtractedContent;
}
```

---

## 二、存储方案

### 2.1 存储分层

| 数据类型 | 存储位置 | 容量 | 用途 |
|---------|---------|------|------|
| **配置数据** | browser.storage.local | < 5MB | 用户设置、模板 |
| **历史记录（最近）** | browser.storage.local | < 5MB | 最近 100 条记录 |
| **历史记录（全部）** | IndexedDB | 无限 | 所有历史记录 |
| **临时数据** | sessionStorage | < 10MB | 当前会话的临时状态 |

### 2.2 browser.storage.local 数据结构

```typescript
// 存储键值对
interface BrowserStorageData {
  // 配置
  'extensionConfig': ExtensionConfig;

  // 最近历史记录（用于快速访问）
  'recentHistory': HistoryRecord[]; // 最多 100 条

  // 设备 ID（用于同步）
  'deviceId': string; // nanoid 生成

  // 环境配置初始化标记
  '_envConfigInit': boolean;

  // 同步状态
  'syncStatus': {
    lastSyncTime: number;
    configSynced: boolean;
    historySynced: boolean;
  };
}
```

### 2.3 IndexedDB 数据结构

```typescript
// 数据库名称：clipper-history
// 版本：1

// Object Store: history
// Key Path: id
// Indexes:
//   - timestamp (降序)
//   - domain
//   - category
//   - tags (multiEntry: true)

interface IndexedDBSchema {
  history: {
    key: string; // id
    value: HistoryRecord;
    indexes: {
      timestamp: number;
      domain: string;
      category: string;
      tags: string[]; // multiEntry
    };
  };
}
```

**IndexedDB 操作示例**：

```typescript
// utils/db.ts

export class HistoryDB {
  private db: IDBDatabase;

  async init() {
    this.db = await openDB('clipper-history', 1, {
      upgrade(db) {
        const store = db.createObjectStore('history', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('domain', 'domain');
        store.createIndex('category', 'metadata.category');
        store.createIndex('tags', 'metadata.tags', { multiEntry: true });
      }
    });
  }

  async addRecord(record: HistoryRecord) {
    const tx = this.db.transaction('history', 'readwrite');
    await tx.objectStore('history').add(record);
  }

  async getAllRecords(): Promise<HistoryRecord[]> {
    const tx = this.db.transaction('history', 'readonly');
    return await tx.objectStore('history').getAll();
  }

  async searchByTag(tag: string): Promise<HistoryRecord[]> {
    const tx = this.db.transaction('history', 'readonly');
    const index = tx.objectStore('history').index('tags');
    return await index.getAll(tag);
  }

  async getStatistics(): Promise<HistoryStats> {
    const records = await this.getAllRecords();
    // 计算统计数据
    return {
      total: records.length,
      byLocation: { /* ... */ },
      byCategory: { /* ... */ },
      // ...
    };
  }
}
```

---

## 三、同步数据格式

### 3.1 配置同步文件

**文件路径**：`/.clipper-config/config.json`
**格式**：JSON
**加密**：WebDAV 密码使用 AES-256 加密

```json
{
  "version": "2.0.0",
  "deviceId": "abc123",
  "lastModified": 1706195400000,
  "config": {
    "basic": { /* ... */ },
    "save": { /* ... */ },
    "imageDownload": { /* ... */ },
    "metadata": { /* ... */ },
    "webdav": {
      "url": "https://webdav.example.com",
      "username": "user",
      "password": "encrypted_base64_string",
      "path": "/notes",
      "authType": "basic",
      "timeout": 30
    },
    "templates": [ /* ... */ ],
    "autoSync": { /* ... */ }
  }
}
```

### 3.2 历史记录同步文件

**文件路径**：`/.clipper-history/history.jsonl`
**格式**：JSONL（每行一个 JSON 对象）
**压缩**：gzip（可选）

```jsonl
{"id":"abc123","url":"https://example.com/article1","title":"Article 1","timestamp":1706195400000,"saveLocation":"local","savePath":"/path/to/file.md","metadata":{"tags":["JavaScript"],"category":"技术文档"},"stats":{"wordCount":1200,"imageCount":5,"fileSize":2048,"readingTime":3},"contentPreview":"Lorem ipsum...","syncInfo":{"lastModified":1706195400000,"deviceId":"device1","version":1}}
{"id":"def456","url":"https://example.com/article2","title":"Article 2","timestamp":1706195500000,"saveLocation":"webdav","savePath":"/notes/article2.md","metadata":{"tags":["Design"],"category":"博客文章"},"stats":{"wordCount":800,"imageCount":2,"fileSize":1536,"readingTime":2},"contentPreview":"Dolor sit amet...","syncInfo":{"lastModified":1706195500000,"deviceId":"device1","version":1}}
```

---

## 四、数据迁移

### 4.1 配置迁移函数

```typescript
// utils/config-migration.ts

export async function migrateConfig(config: any): Promise<ExtensionConfig> {
  const currentVersion = config.configVersion || '0.0.0';

  // 版本 1.0.0 → 2.0.0
  if (compareVersions(currentVersion, '2.0.0') < 0) {
    // 1. 添加新字段
    if (!config.basic) {
      config.basic = { locale: 'zh-CN', theme: 'auto' };
    }

    // 2. 重命名字段
    if (config.downloadDirectory) {
      config.save = config.save || {};
      config.save.lastUsedStrategy = config.downloadDirectory === 'default' ? 'local' : 'webdav';
      delete config.downloadDirectory;
    }

    // 3. 转换数据结构
    if (config.titleTemplate && !config.save) {
      config.save = {
        titleTemplate: config.titleTemplate,
        contentTemplate: config.contentTemplate,
        lastUsedStrategy: 'local'
      };
      delete config.titleTemplate;
      delete config.contentTemplate;
    }

    // 4. 添加默认模板
    if (!config.templates) {
      config.templates = BUILTIN_TEMPLATES;
    }

    // 5. 更新版本号
    config.configVersion = '2.0.0';
  }

  return config as ExtensionConfig;
}
```

### 4.2 历史记录迁移

```typescript
export async function migrateHistoryRecord(record: any): Promise<HistoryRecord> {
  // 如果缺少元数据，添加默认值
  if (!record.metadata) {
    record.metadata = {
      tags: [],
      category: undefined,
      notes: undefined
    };
  }

  // 如果缺少统计信息，尝试计算
  if (!record.stats) {
    record.stats = {
      wordCount: record.contentPreview?.length || 0,
      imageCount: 0,
      fileSize: record.contentPreview?.length || 0,
      readingTime: Math.ceil((record.contentPreview?.length || 0) / 200)
    };
  }

  // 添加同步信息
  if (!record.syncInfo) {
    record.syncInfo = {
      lastModified: record.timestamp,
      deviceId: await getDeviceId(),
      version: 1
    };
  }

  return record as HistoryRecord;
}
```

---

## 五、数据验证

### 5.1 配置验证

```typescript
// utils/validators.ts

export function validateConfig(config: ExtensionConfig): ValidationResult {
  const errors: string[] = [];

  // 1. 必需字段检查
  if (!config.configVersion) {
    errors.push('缺少配置版本号');
  }

  // 2. WebDAV 配置验证
  if (config.webdav.url) {
    try {
      new URL(config.webdav.url);
    } catch {
      errors.push('WebDAV URL 格式不正确');
    }

    if (!config.webdav.username) {
      errors.push('WebDAV 用户名不能为空');
    }
  }

  // 3. 模板验证
  if (config.save.titleTemplate.includes('/')) {
    // 允许目录结构
  }

  if (config.save.contentTemplate && !config.save.contentTemplate.includes('{{content}}')) {
    errors.push('内容模板必须包含 {{content}} 变量');
  }

  // 4. 图片下载配置
  if (config.imageDownload.maxSize < 0) {
    errors.push('图片最大大小不能为负数');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

### 5.2 历史记录验证

```typescript
export function validateHistoryRecord(record: HistoryRecord): ValidationResult {
  const errors: string[] = [];

  if (!record.id) {
    errors.push('记录 ID 不能为空');
  }

  if (!record.url) {
    errors.push('URL 不能为空');
  }

  if (!record.title) {
    errors.push('标题不能为空');
  }

  if (!record.timestamp || record.timestamp <= 0) {
    errors.push('时间戳无效');
  }

  if (!['local', 'webdav'].includes(record.saveLocation)) {
    errors.push('保存位置必须是 local 或 webdav');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

## 六、数据备份与恢复

### 6.1 导出数据

```typescript
// utils/export.ts

export async function exportAllData(): Promise<ExportData> {
  const config = await storage.getItem('local:extensionConfig');
  const history = await historyDB.getAllRecords();

  return {
    version: '2.0.0',
    exportedAt: Date.now(),
    config: config,
    history: history
  };
}

export async function downloadAsJSON(data: ExportData) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  await browser.downloads.download({
    url: url,
    filename: `clipper-backup-${Date.now()}.json`,
    saveAs: true
  });

  URL.revokeObjectURL(url);
}
```

### 6.2 导入数据

```typescript
export async function importData(file: File): Promise<ImportResult> {
  const text = await file.text();
  const data: ExportData = JSON.parse(text);

  // 1. 验证版本
  if (!data.version) {
    throw new Error('无效的备份文件');
  }

  // 2. 迁移配置（如果版本不同）
  const migratedConfig = await migrateConfig(data.config);

  // 3. 合并历史记录
  const existingHistory = await historyDB.getAllRecords();
  const merged = mergeHistories(existingHistory, data.history);

  // 4. 保存
  await storage.setItem('local:extensionConfig', migratedConfig);
  await historyDB.clear();
  for (const record of merged) {
    await historyDB.addRecord(record);
  }

  return {
    success: true,
    imported: {
      config: 1,
      history: merged.length
    }
  };
}
```

---

## 七、数据隐私与安全

### 7.1 敏感数据加密

**WebDAV 密码加密**：

```typescript
// utils/crypto.ts

const ENCRYPTION_KEY = 'user-device-specific-key'; // 从设备指纹生成

export async function encryptPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY),
    'AES-GCM',
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // 返回 base64 编码的 iv + encrypted
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
}

export async function decryptPassword(encrypted: string): Promise<string> {
  // 解密逻辑
}
```

### 7.2 数据清理

```typescript
// utils/cleanup.ts

export async function cleanupOldHistory(days: number = 90) {
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const allRecords = await historyDB.getAllRecords();

  const toDelete = allRecords.filter(r => r.timestamp < cutoffTime);

  for (const record of toDelete) {
    await historyDB.deleteRecord(record.id);
  }

  return { deleted: toDelete.length };
}
```

---

## 附录

### A. 数据大小估算

| 数据类型 | 单条大小 | 1000 条 | 10000 条 |
|---------|---------|---------|----------|
| 配置 | ~5KB | - | - |
| 历史记录（无预览） | ~0.5KB | 500KB | 5MB |
| 历史记录（含预览） | ~1KB | 1MB | 10MB |
| 图片 Blob（临时） | ~100KB | 100MB | 1GB |

### B. 数据库性能

| 操作 | IndexedDB | browser.storage.local |
|------|-----------|----------------------|
| 写入 1 条 | < 10ms | < 5ms |
| 读取 1 条 | < 5ms | < 2ms |
| 读取全部（1000 条） | < 50ms | < 20ms |
| 搜索（索引） | < 20ms | 需遍历（慢） |

---

**文档状态**：完成
**最后更新**：2025-01-25
**技术审核**：待审核
