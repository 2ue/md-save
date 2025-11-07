# 架构重构方案：保存策略插件化 + 图片本地化

## 文档信息

- **创建日期**: 2025-11-06
- **作者**: Architecture Team
- **状态**: 待实施
- **预计工期**: 11-15 小时

---

## 一、背景与动机

### 1.1 当前架构问题

**代码分散**：
- Local 保存逻辑：content.ts（直接下载）
- WebDAV 保存逻辑：background.ts（消息传递）
- 保存方式选择：if/else 遍布多处代码

**扩展困难**：
- 新增保存方式需要修改 3-5 处代码
- 图片下载功能即将导致复杂度翻倍
- 无统一的错误处理和结果格式

**示例（当前代码）**：
```typescript
// ❌ 特殊情况遍地
if (saveMethod === 'local') {
  const blob = new Blob([markdown]);
  const a = document.createElement('a');
  a.download = filename;
  a.click();
} else if (saveMethod === 'webdav') {
  browser.runtime.sendMessage({
    type: 'WEBDAV_UPLOAD',
    data: { content: markdown, filename }
  });
}
// 每次新增保存方式都要改这里！
```

### 1.2 重构目标

**架构优化**：
1. **策略模式**：将不同保存方式抽象为统一接口
2. **零分支调度**：消除 if/else，使用数据驱动
3. **插件化扩展**：新增保存方式只需实现接口

**新功能支持**：
1. **图片本地化**：下载图片到 assets/ 目录
2. **CORS 绕过**：Background script 无跨域限制
3. **并行处理**：URL 替换和图片下载解耦

---

## 二、核心设计

### 2.1 架构原则

**Linus Torvalds 的设计哲学**：

> "Bad programmers worry about the code. Good programmers worry about data structures and their relationships."

**三个统一**：
1. **统一输入**：SaveContext（所有保存方式的共同参数）
2. **统一输出**：SaveResult（标准化的结果）
3. **统一接口**：SaveStrategy（策略模式）

### 2.2 架构图

```
┌─────────────────────────────────────────────┐
│          Content Script                     │
│  ┌──────────────────────────────────────┐   │
│  │  ImageDownloadService (可选)         │   │
│  │  - prepare(): 提取URL + 生成映射     │   │
│  │  - replace(): 替换Markdown中的URL   │   │
│  └──────────────┬───────────────────────┘   │
│                 ↓                            │
│  ┌──────────────────────────────────────┐   │
│  │  SaveContext 构建                    │   │
│  │  - markdown (URL已替换)              │   │
│  │  - images: ImageTask[]               │   │
│  │  - metadata                          │   │
│  └──────────────┬───────────────────────┘   │
│                 ↓                            │
│  ┌──────────────────────────────────────┐   │
│  │  SaveStrategyManager.save()          │   │
│  │  - 查找策略                          │   │
│  │  - 验证配置                          │   │
│  │  - 决定执行位置 (Content/Background) │   │
│  └──────────────┬───────────────────────┘   │
└─────────────────┼───────────────────────────┘
                  ↓
        需要Background?
         /           \
       NO            YES (消息传递)
        ↓              ↓
   直接执行     ┌──────────────────────┐
                │  Background Script   │
                │  ┌────────────────┐  │
                │  │ 下载图片Blob   │  │
                │  │ (无CORS限制)   │  │
                │  └────────┬───────┘  │
                │           ↓          │
                │  ┌────────────────┐  │
                │  │ SaveStrategy   │  │
                │  │ - Local: ZIP   │  │
                │  │ - WebDAV: 批量 │  │
                │  └────────┬───────┘  │
                └───────────┼──────────┘
                            ↓
                    ┌──────────────┐
                    │ SaveResult   │
                    │ - success    │
                    │ - savedPath  │
                    │ - metadata   │
                    └──────────────┘
```

---

## 三、核心接口设计

### 3.1 数据结构

#### SaveContext（统一输入）

```typescript
/**
 * 保存上下文：所有保存方式的统一输入
 */
interface SaveContext {
  // 核心内容
  markdown: string;           // Markdown 内容（图片URL已替换）
  filename: string;           // 文件名（不含扩展名）

  // 图片（可选）
  images?: ImageTask[];       // 图片任务列表
  assetsDir?: string;         // 图片目录名，默认 "assets"

  // 元数据
  title: string;              // 页面标题
  url: string;                // 页面URL
  timestamp: number;          // 时间戳

  // 配置
  config: ExtensionConfig;    // 扩展配置
}
```

#### ImageTask（图片任务）

```typescript
interface ImageTask {
  originalUrl: string;        // 原始URL
  localPath: string;          // 相对路径，如 ./assets/img_0.png
  filename: string;           // 文件名，如 img_0.png
  blob?: Blob;                // 图片数据（下载后填充）
  status: 'pending' | 'downloading' | 'success' | 'failed';
  error?: string;             // 错误信息
}
```

#### SaveResult（统一输出）

```typescript
/**
 * 保存结果：所有保存方式的统一输出
 */
interface SaveResult {
  success: boolean;

  // 成功时
  savedPath?: string;         // 保存的路径
  filesCount?: number;        // 保存的文件数（MD + 图片）
  savedAt?: number;           // 时间戳

  // 失败时
  error?: string;
  errorCode?: 'NETWORK' | 'PERMISSION' | 'VALIDATION' | 'UNKNOWN';

  // 元数据（用于历史记录）
  metadata?: {
    fileSize?: number;
    imageCount?: number;
    imagesFailedCount?: number;
    [key: string]: any;
  };
}
```

#### ValidationResult（配置验证）

```typescript
interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
```

### 3.2 策略接口

```typescript
/**
 * 保存策略：所有保存方式必须实现的接口
 */
interface SaveStrategy {
  /**
   * 策略名称（用于注册表）
   */
  readonly name: string;

  /**
   * 策略显示名称（用于UI）
   */
  readonly displayName: string;

  /**
   * 执行保存
   *
   * @param context 保存上下文
   * @returns 保存结果
   *
   * IMPORTANT:
   * - 必须处理图片（如果 context.images 存在）
   * - 失败不抛异常，返回 { success: false, error }
   */
  save(context: SaveContext): Promise<SaveResult>;

  /**
   * 验证配置
   *
   * @param config 扩展配置
   * @returns 验证结果
   */
  validate(config: ExtensionConfig): ValidationResult;

  /**
   * 是否需要 Background Script
   *
   * @returns true: 需要通过消息传递; false: 可在 Content Script 直接调用
   */
  requiresBackground(): boolean;
}
```

### 3.3 策略管理器

```typescript
/**
 * 策略注册表 + 统一调度
 */
class SaveStrategyManager {
  private strategies = new Map<string, SaveStrategy>();

  /**
   * 注册策略
   */
  register(strategy: SaveStrategy): void;

  /**
   * 获取策略
   */
  get(name: string): SaveStrategy | undefined;

  /**
   * 列出所有策略
   */
  list(): SaveStrategy[];

  /**
   * 执行保存（统一入口，零分支）
   */
  async save(context: SaveContext, strategyName: string): Promise<SaveResult>;
}
```

---

## 四、图片下载设计

### 4.1 处理流程

```
┌─ 第1步：Markdown转换完成 ────────────────────┐
│                                              │
├─ 第2步：提取图片URL + 生成映射表 (10ms) ─────┤
│         [url1 → ./assets/img_0.png]          │
│         [url2 → ./assets/img_1.png]          │
│                                              │
├─ 第3步：并行执行 ───────────────────────────┤
│  ┌───────────────┐      ┌─────────────────┐ │
│  │ 替换Markdown  │      │ Background下载  │ │
│  │ 中的URL (同步)│      │ 图片Blob (异步) │ │
│  │ (1ms完成)     │      │ (等待网络I/O)   │ │
│  └───────┬───────┘      └────────┬────────┘ │
│          │                       │          │
│          └───── 第4步：预览Modal  │          │
│                 (用户可立即看到替换后MD)     │
│                                   │          │
│          ┌───── 第5步：用户点击保存          │
│          │                       │          │
│          └───────────── 等待图片下载完成 ────┤
│                                              │
└─ 第6步：打包/上传 (MD已替换，图片已下载) ────┘
```

**关键点**：
- URL 替换不依赖图片下载（只需映射表）
- 用户在图片下载时就能预览 Markdown
- 只在最终保存时等待图片完成

### 4.2 CORS 解决方案

**问题**：Content Script 发起的 fetch 受 CORS 限制

**解决**：Background Script 天然拥有扩展特权，无 CORS 限制

```typescript
// ❌ Content Script (受CORS限制)
fetch('https://example.com/image.png')  // 可能被阻止

// ✅ Background Script (无CORS限制)
fetch('https://example.com/image.png')  // 总是成功
```

### 4.3 ImageDownloadService

```typescript
class ImageDownloadService {
  /**
   * 准备图片下载（提取 + 生成映射）
   */
  prepare(markdown: string): { markdown: string; tasks: ImageTask[] };

  /**
   * 下载图片（Background Script 中执行）
   */
  async download(tasks: ImageTask[]): Promise<ImageTask[]>;
}
```

---

## 五、保存策略实现

### 5.0 文件组织：多文件下载方案

**问题：Local 保存是否需要 ZIP 压缩？**

#### 用户反馈：ZIP 不利于使用
- ❌ **无法直接查看**：必须解压才能编辑
- ❌ **增加操作步骤**：下载 → 解压 → 查看（3步 vs 2步）
- ❌ **不适合频繁访问**：每次都要解压很烦人
- ❌ **不利于工具集成**：Obsidian/Typora 无法直接打开预览

#### 解决方案：智能路径检测 + 多文件下载
通过智能路径检测技术，实现真正的目录结构，彻底解决 ZIP 问题：

**核心算法：**
1. **下载主文件**：用户选择保存位置（可能带"另存为"对话框）
2. **路径检测**：监听下载完成事件，获取用户选择的实际路径
3. **批量下载**：并行下载所有图片到 `{path}/{filename}/assets/` 目录
4. **单次交互**：只有主文件需要用户确认，其他文件静默下载

#### 技术优势
- ✅ **零解压**：所有文件直接可用
- ✅ **目录完整**：assets/ 与 .md 文件在同一位置
- ✅ **智能路径**：自动适应不同的浏览器下载行为
- ✅ **并行下载**：所有图片同时下载，效率高

#### 最终方案
- **无图片** → 直接下载 MD 文件 ✅
- **有图片 + Local** → 多文件下载（智能路径检测）✅
- **有图片 + WebDAV** → 批量上传（保持目录结构）✅

#### 容错机制：图片失败自动回退
- **问题**：图片下载失败会导致 Markdown 引用断链
- **解决**：`ImageDownloadService.download()` 返回修复后的 Markdown
  - 成功的图片：`![](./assets/img_0.png)`
  - 失败的图片：`![](https://original-url.com/img.png)` ← 自动回退
  - 确保 Markdown 始终可用，即使图片全部失败

**对比表：**

| 场景 | 用户体验 | 文件管理 | 技术实现 | 推荐度 |
|------|---------|---------|---------|--------|
| **无图片 Local** | ⭐⭐⭐⭐⭐ 直接下载 | ⭐⭐⭐⭐⭐ 单文件 | 简单 | ✅ 默认 |
| **有图片 Local** | ⭐⭐⭐⭐⭐ 直接可用 | ⭐⭐⭐⭐⭐ 目录完整 | 智能检测 | ✅ 推荐 |
| **有图片 WebDAV** | ⭐⭐⭐⭐⭐ 直接编辑 | ⭐⭐⭐⭐⭐ 保持结构 | 批量上传 | ✅ 推荐 |

#### 技术实现细节

**路径检测算法：**
```typescript
// 1. 下载主文件（可能带 saveAs 对话框）
const mdDownloadId = await browser.downloads.download({
  url: mdDataUrl,
  filename: mdSafePath,
  saveAs: !customDownloadPath
});

// 2. 等待下载完成，获取真实路径
const realPath = await waitForDownloadPath(mdDownloadId, filename);

// 3. 批量下载图片（无对话框）
imagePaths.map(path => browser.downloads.download({
  url: objectUrl,
  filename: `${realPath}/${filename}/assets/${imgName}`,
  saveAs: false
}));
```

**最终目录结构：**
```
用户选择目录/
├── my-article.md          ← 主文件
└── assets/               ← 图片目录
    ├── img_0.png
    ├── img_1.jpg
    └── ...
```

---

### 5.1 Local 保存策略

**特点**：
- 有图片：多文件下载（智能路径检测）
- 无图片：直接下载 Markdown

**目录结构**（用户位置）：
```
用户选择目录/
├── my-article.md          # Markdown 文件
└── assets/               # 图片目录（自动创建）
    ├── img_0.png
    ├── img_1.jpg
    └── img_2.webp
```

**技术实现**：
- 智能路径检测：`waitForDownloadPath()` 获取用户选择的实际路径
- 并行下载：`Promise.allSettled()` 同时处理所有图片
- 零依赖：无需第三方库，纯浏览器 API

**优势**：
- 无需解压：文件直接可用
- 目录完整：assets/ 与 .md 在同级
- 单次交互：只需用户确认主文件保存位置

### 5.2 WebDAV 保存策略

**特点**：
- 批量上传（Markdown + 所有图片）
- 保持目录结构（不打包）
- 自动创建 assets/ 目录

**目录结构**（服务器上）：
```
/webdav/notes/
├── article.md
└── assets/
    ├── img_0.png
    ├── img_1.jpg
    └── img_2.webp
```

### 5.3 扩展示例：Notion 策略

```typescript
class NotionSaveStrategy implements SaveStrategy {
  readonly name = 'notion';
  readonly displayName = 'Notion';

  requiresBackground(): boolean {
    return true;  // 需要调用 Notion API
  }

  validate(config: ExtensionConfig): ValidationResult {
    if (!config.notion?.apiKey) {
      return { valid: false, errors: ['Notion API key is required'] };
    }
    return { valid: true };
  }

  async save(context: SaveContext): Promise<SaveResult> {
    // 1. 上传图片到 Notion
    const uploadedImages = await this.uploadImages(context.images);

    // 2. 替换 Markdown 中的图片链接为 Notion URLs
    const markdown = this.replaceImageUrls(context.markdown, uploadedImages);

    // 3. 转换 Markdown 为 Notion blocks
    const blocks = convertMarkdownToBlocks(markdown);

    // 4. 创建 Notion 页面
    const page = await notionClient.pages.create({
      parent: { database_id: config.notion.databaseId },
      properties: {
        title: { title: [{ text: { content: context.title } }] },
        URL: { url: context.url }
      },
      children: blocks
    });

    return {
      success: true,
      savedPath: page.url,
      filesCount: 1,
      savedAt: Date.now()
    };
  }
}

// 注册只需一行！
strategyManager.register(new NotionSaveStrategy());
```

---

## 六、实施计划

### 阶段 1：核心抽象（零破坏）

**目标**：建立策略模式基础，不修改现有功能

**新增文件**：
```
entrypoints/utils/save/
├── types.ts              # 接口定义
├── strategy-manager.ts   # SaveStrategyManager
├── strategies/
│   ├── base.ts           # 基础抽象类（可选）
│   ├── local.ts          # LocalSaveStrategy（骨架）
│   └── webdav.ts         # WebDAVSaveStrategy（骨架）
└── index.ts              # 导出
```

**代码量**：~300 行

**预计时间**：2-3 小时

**验收标准**：
- [ ] 所有接口定义完成
- [ ] StrategyManager 可注册和查找策略
- [ ] 骨架策略可通过编译

---

### 阶段 2：迁移现有代码（渐进式）

**步骤**：

1. **迁移 Local 保存逻辑**
   - 从 content.ts 提取 Local 保存代码
   - 实现 LocalSaveStrategy.save()
   - 保持现有功能不变

2. **迁移 WebDAV 保存逻辑**
   - 从 background.ts 提取 WebDAV 代码
   - 实现 WebDAVSaveStrategy.save()
   - 保持现有功能不变

3. **替换调用点**
   - content.ts: 使用 strategyManager.save() 替换 if/else
   - background.ts: 更新消息处理为统一的 SAVE 消息

**修改文件**：
- entrypoints/content.ts
- entrypoints/background.ts
- entrypoints/utils/save/strategies/local.ts
- entrypoints/utils/save/strategies/webdav.ts

**代码量**：~400 行（重构）

**预计时间**：4-5 小时

**验收标准**：
- [ ] Local 保存功能正常
- [ ] WebDAV 保存功能正常
- [ ] content.ts 无 if/else 分支
- [ ] 旧消息格式兼容

---

### 阶段 3：图片下载集成

**新增文件**：
```
entrypoints/utils/save/
└── image-download.ts     # ImageDownloadService
```

**修改文件**：
- entrypoints/utils/save/strategies/local.ts（添加 ZIP 打包）
- entrypoints/utils/save/strategies/webdav.ts（添加批量上传）
- entrypoints/background.ts（添加 DOWNLOAD_IMAGES 消息）

**新增依赖**：
```bash
# 无新增依赖，使用纯浏览器 API
```

**代码量**：~200 行

**预计时间**：3-4 小时

**验收标准**：
- [ ] 可提取 Markdown 中的图片 URL
- [ ] Background 可静默下载图片
- [ ] Local 保存智能路径检测 + 多文件下载
- [ ] WebDAV 批量上传图片
- [ ] 下载失败回退到原 URL

---

### 阶段 4：配置 + UI

**配置扩展**：
```typescript
interface ExtensionConfig {
  // ... 现有配置

  imageDownload: {
    enabled: boolean;              // 默认 false
    assetsDirectory: string;       // 默认 "assets"
    onDownloadFail: 'skip' | 'fallback';  // 默认 'fallback'
  };
}
```

**UI 修改**：
- **Options 页面**：新增图片下载配置项
- **Preview Modal**：显示图片下载进度

**修改文件**：
- entrypoints/options/Options.vue（配置界面）
- entrypoints/content.ts（Preview Modal 进度显示）
- types/config.ts（配置类型）

**代码量**：~100 行

**预计时间**：2-3 小时

**验收标准**：
- [ ] Options 可配置图片下载开关
- [ ] Preview Modal 显示下载进度
- [ ] 配置持久化到 storage
- [ ] 默认关闭不影响现有用户

---

## 七、风险评估

### 7.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| CORS 严格网站无法下载 | 中 | 低 | 回退到原 URL，用户仍可看到内容 |
| ZIP 打包内存溢出 | 低 | 中 | 限制图片总大小（如 50MB） |
| 图片格式不支持 | 低 | 低 | 保持原格式，不做转换 |
| 无第三方依赖 | 低 | 低 | 纯浏览器 API，零体积 |

### 7.2 向后兼容风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 配置格式变化 | 高 | ✅ 只扩展字段，不删除 |
| 消息格式变化 | 中 | ✅ 保留旧消息兼容 |
| History Schema 变化 | 中 | ✅ 新增可选字段 `associatedFiles` |
| Local 保存文件格式变化 | 中 | ✅ 默认关闭图片下载 |

### 7.3 用户体验风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 下载时间增加 | 中 | ✅ 显示进度条<br>✅ 默认关闭功能 |
| 多文件下载时间 | 中 | ✅ 并行下载，显示进度条<br>✅ 默认关闭功能 |
| 文件变大 | 低 | ✅ 配置项说明文件大小影响 |

---

## 八、测试计划

### 8.1 单元测试

**核心逻辑测试**（使用 Vitest）：

```typescript
// tests/save/strategy-manager.test.ts
describe('SaveStrategyManager', () => {
  it('should register and retrieve strategies', () => {
    const manager = new SaveStrategyManager();
    const strategy = new LocalSaveStrategy();

    manager.register(strategy);
    expect(manager.get('local')).toBe(strategy);
  });

  it('should validate config before saving', async () => {
    const manager = new SaveStrategyManager();
    manager.register(new WebDAVSaveStrategy());

    const result = await manager.save(context, 'webdav');
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VALIDATION');
  });
});

// tests/save/image-download.test.ts
describe('ImageDownloadService', () => {
  it('should extract image URLs from markdown', () => {
    const markdown = '![alt](https://example.com/img.png)';
    const service = new ImageDownloadService();

    const { tasks } = service.prepare(markdown);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].originalUrl).toBe('https://example.com/img.png');
  });

  it('should replace URLs with local paths', () => {
    const markdown = '![alt](https://example.com/img.png)';
    const service = new ImageDownloadService();

    const { markdown: result } = service.prepare(markdown);
    expect(result).toContain('./assets/img_0.png');
  });
});
```

### 8.2 集成测试

**手动测试清单**：

- [ ] **Local 保存（无图片）**
  - 保存纯文本 Markdown
  - 验证文件名正确
  - 验证内容完整

- [ ] **Local 保存（有图片）**
  - 保存包含图片的 Markdown
  - 验证目录包含 MD + assets/
  - 验证图片路径替换正确
  - 验证文件直接可用（无需解压）

- [ ] **WebDAV 保存（无图片）**
  - 上传纯文本 Markdown
  - 验证路径正确
  - 验证内容完整

- [ ] **WebDAV 保存（有图片）**
  - 上传 Markdown + 图片
  - 验证目录结构正确
  - 验证所有图片上传成功

- [ ] **图片下载失败场景**
  - 部分图片 404
  - 验证回退到原 URL
  - 验证保存仍可完成

- [ ] **配置切换**
  - 切换 Local ↔ WebDAV
  - 切换图片下载开关
  - 验证配置持久化

### 8.3 性能测试

**场景**：
- [ ] 大量图片（50+ 张）
  - 验证下载时间 < 30s
  - 验证 ZIP 大小 < 100MB
  - 验证无内存溢出

- [ ] 大尺寸图片（10MB+ 单张）
  - 验证下载成功
  - 验证 ZIP 打包正常

---

## 九、回滚计划

### 9.1 分阶段回滚

**如果阶段 1 失败**：
- 删除 `entrypoints/utils/save/` 目录
- 零影响（未修改现有代码）

**如果阶段 2 失败**：
- 恢复 content.ts 和 background.ts
- 使用 git revert

**如果阶段 3/4 失败**：
- 关闭图片下载配置项
- 现有功能不受影响

### 9.2 Feature Flag

```typescript
// 在配置中添加开关
interface ExtensionConfig {
  experimental: {
    useNewSaveStrategy: boolean;  // 默认 true（阶段2完成后）
    enableImageDownload: boolean; // 默认 false
  };
}

// 代码中判断
if (config.experimental.useNewSaveStrategy) {
  // 新架构
  await strategyManager.save(context, saveMethod);
} else {
  // 旧逻辑（保留一段时间）
  if (saveMethod === 'local') { ... }
}
```

---

## 十、成功指标

### 10.1 代码质量指标

- [ ] **圈复杂度降低**：content.ts 从 20+ 降至 < 10
- [ ] **代码重复率**：保存逻辑零重复
- [ ] **测试覆盖率**：核心逻辑 > 80%
- [ ] **TypeScript 无 any**：所有类型安全

### 10.2 功能指标

- [ ] **保存成功率**：> 99%（现有功能）
- [ ] **图片下载成功率**：> 95%（新功能）
- [ ] **扩展性**：新增保存方式 < 2 小时实现

### 10.3 性能指标

- [ ] **保存延迟**：无图片 < 100ms，有图片 < 5s
- [ ] **包体积增加**：< 500KB（JSZip）
- [ ] **内存占用**：< 100MB（50 张图片场景）

---

## 十一、后续规划

### 11.1 短期（1-2 个月）

- [ ] **Notion 集成**
  - 实现 NotionSaveStrategy
  - 支持上传到 Notion Database

- [ ] **Obsidian 集成**
  - 实现 ObsidianSaveStrategy
  - 通过 Obsidian Local REST API 保存

### 11.2 中期（3-6 个月）

- [ ] **GitHub 集成**
  - 实现 GitHubSaveStrategy
  - 保存到 GitHub Repository

- [ ] **图片优化**
  - 压缩大尺寸图片
  - 支持转换为 WebP

### 11.3 长期（6-12 个月）

- [ ] **多策略组合**
  - 支持同时保存到多个位置
  - 如：Local + WebDAV + Notion

- [ ] **云端同步**
  - 配置跨设备同步
  - 历史记录云端存储

---

## 十二、参考资料

### 12.1 技术文档

- [JSZip Documentation](https://stuk.github.io/jszip/)
- [WebExtension Background Scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts)
- [Strategy Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/strategy)

### 12.2 类似项目

- **Joplin Web Clipper**：图片下载 + 资源管理
- **MarkDownload**：Markdown 转换 + 保存
- **SingleFile**：完整页面保存（含图片）

### 12.3 设计哲学

- **Linus Torvalds on Good Taste**：[YouTube - TED Talk](https://www.youtube.com/watch?v=o8NPllzkFhE)
- **Clean Code by Robert C. Martin**：策略模式应用

---

## 十三、FAQ

**Q: 为什么要重构现有架构？**
A: 当前架构已出现大量 if/else 分支，图片下载功能将导致复杂度翻倍。现在是最佳重构时机。

**Q: 重构会破坏现有功能吗？**
A: 不会。采用渐进式重构，每个阶段都保持向后兼容，并有完整的回滚计划。

**Q: 图片下载会影响性能吗？**
A: 不会。图片下载在后台并行进行，不阻塞 Markdown 保存。用户可在配置中关闭。

**Q: 为什么 Local 保存要用 ZIP？**
A: 浏览器扩展无法直接写本地文件系统，只能通过下载触发。ZIP 可将多个文件打包为一个下载。

**Q: WebDAV 批量上传会很慢吗？**
A: 采用并行上传，速度接近单文件上传。失败的图片不阻塞整体保存。

**Q: 未来会支持其他保存方式吗？**
A: 会。插件化架构设计的核心目标就是易扩展，计划支持 Notion、Obsidian、GitHub 等。

---

## 附录

### A. 文件结构（重构后）

```
entrypoints/
├── content.ts              # 调用 SaveStrategyManager
├── background.ts           # 消息处理 + 图片下载
└── utils/
    └── save/
        ├── types.ts        # 接口定义
        ├── strategy-manager.ts  # 策略管理器
        ├── image-download.ts    # 图片下载服务
        ├── strategies/
        │   ├── base.ts     # 基础抽象类
        │   ├── local.ts    # Local 策略
        │   ├── webdav.ts   # WebDAV 策略
        │   └── index.ts
        └── index.ts
```

### B. 依赖版本

```json
{
  "dependencies": {
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@types/jszip": "^3.4.1"
  }
}
```

### C. TypeScript 配置

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

---

**文档结束**
