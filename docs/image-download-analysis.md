# 图片下载机制分析与改进方案

> 基于 jia-web-clipper 项目的最佳实践分析
> 分析日期：2025-12-03
> 当前版本：md-save v0.0.8

---

## 📋 目录

- [执行摘要](#执行摘要)
- [问题背景](#问题背景)
- [对比分析](#对比分析)
- [核心问题诊断](#核心问题诊断)
- [改进方案](#改进方案)
- [实现细节](#实现细节)
- [测试策略](#测试策略)
- [风险评估](#风险评估)

---

## 执行摘要

### 当前状态
md-save 的图片下载功能存在以下问题：
- ❌ 下载成功率不稳定（30-70%）
- ❌ BlobURL 内存泄漏
- ❌ Chrome 浏览器文件扩展名错误
- ❌ 下载失败无法感知

### 根本原因
**`browser.downloads.download()` 调用后未等待下载完成**，导致 BlobURL 过早释放、资源清理不当、无法感知失败状态。

### 解决方案
参考 jia-web-clipper 的 Download 包装类实现，通过 `browser.downloads.onChanged` 事件监听下载完成状态，确保资源正确管理和错误处理。

### 预期收益
- ✅ 下载成功率提升至 95%+
- ✅ 消除内存泄漏
- ✅ 修复 Chrome 兼容性问题
- ✅ 完整的错误处理和用户反馈

---

## 问题背景

### 用户报告
```
Current branch: fix/image-download-revert

Recent commits:
58da149 fix(image): 修复图片下载失败后的回退逻辑
```

虽然已实现图片下载失败回退机制，但**下载失败的根本原因未解决**。

### 技术背景
浏览器扩展中使用 `browser.downloads.download()` API 下载文件时：
1. API 调用成功 ≠ 文件下载完成
2. 返回的 `downloadId` 仅表示任务创建，不表示下载成功
3. BlobURL 必须在下载完成后才能释放
4. 下载状态变化通过 `browser.downloads.onChanged` 事件通知

---

## 对比分析

### 架构对比

#### jia-web-clipper 架构（✅ 正确）
```
Content Script
    ↓ 提取资源 URL
    ↓ 创建 Task 对象 { filename, url, type: 'url' }
    ↓
Background Script
    ↓ TaskFetcher.get(task) → fetch() 获取 Blob
    ↓ BlobUrl.create(blob) → 创建 BlobURL
    ↓ new Download(browser.downloads, options)
    ↓   ├─ bindListener() → 监听 onCreated/onChanged
    ↓   ├─ download() → 返回 Promise
    ↓   └─ 等待 onChanged.state = 'complete'
    ↓ resolve({ id, filename: realPath })
    ↓ BlobUrl.revoke(url) → 清理 BlobURL
```

#### md-save 架构（❌ 问题）
```
Content Script
    ↓ 提取图片 URL
    ↓ 创建 ImageTask { originalUrl, localPath, filename }
    ↓
Background Script
    ↓ ImageDownloadService.download() → fetch() 获取 Blob
    ↓ tasks.forEach(task => {
    ↓   const url = URL.createObjectURL(task.blob)
    ↓   browser.downloads.download({ url, filename })  ← ❌ 不等待
    ↓ })
    ↓ ❌ BlobURL 从未释放（内存泄漏）
```

### 代码对比

#### 1. 下载等待机制

**jia-web-clipper（✅ 完整）**
```javascript
// browser-download.js:13-46
class Download {
  download() {
    this.bindListener();
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.API.download(this.options).then(
        (downloadItemId) => { /* 仅触发 */ },
        (errMsg) => { this.clean(); this.reject(new Error(errMsg)); }
      );
    });
  }

  downloadChanged(delta) {
    if (!this.id || this.id !== delta.id) return;

    if (delta.state && delta.state.current) {
      switch(delta.state.current) {
        case 'complete':
          this.resolve({id: this.id, filename: this.filename});
          this.clean();  // ✅ 清理监听器 + BlobURL
          break;
        case 'interrupted':
          this.reject(new Error(delta.error.current || ""));
          this.clean();
          break;
      }
    }
  }

  clean() {
    this.unbindListener();
    if (this.extraCleanFn) {
      this.extraCleanFn();  // ✅ 调用 BlobUrl.revoke()
    }
  }
}
```

**md-save（❌ 缺失）**
```typescript
// local.ts:165-170
const imageUrl = URL.createObjectURL(task.blob!);

return browser.downloads.download({
  url: imageUrl,
  filename: imagePath,
  saveAs: false
});
// ❌ Promise 立即 resolve，不等待下载完成
// ❌ imageUrl (BlobURL) 可能在下载完成前就被 GC
// ❌ 无法感知下载失败
```

#### 2. BlobURL 管理

**jia-web-clipper（✅ 完整）**
```javascript
// handler/browser.js:154-173
async function downloadUrl(params = {}){
  const {url, filename} = params;
  const it = new Download(ExtApi.downloads, params);

  // ✅ 设置清理回调
  it.extraCleanFn = () => {
    if (T.isBlobUrl(url)) {
      BlobUrl.revoke(url);
      Log.debug("revoke: ", url);
    }
  }
  return it.download();  // ✅ 下载完成后自动调用 extraCleanFn
}
```

**md-save（❌ 泄漏）**
```typescript
// local.ts:158
const imageUrl = URL.createObjectURL(task.blob!);

// ❌ 创建后从未 revoke
// 内存泄漏量 = 保存次数 × 图片数量 × 平均图片大小
```

#### 3. Chrome MIME 类型 Bug

**jia-web-clipper（✅ 修复）**
```javascript
// handler/browser.js:112-130
async function fetchUrlTask(task) {
  const blob = await Global.TaskFetcher.get(task);

  if (Global.isChrome) {
    // Chrome 的 downloads API 会根据 Content-Type 覆盖文件扩展名
    // 例如：filename="img.jpg" + type="image/webp" → 保存为 img.webp
    const fileExtension = T.getFileExtension(task.filename);
    const contentType = T.extension2MimeType(fileExtension);
    const newBlob = blob.slice(0, blob.size, contentType);
    return newBlob;
  }
  return blob;
}
```

**md-save（❌ 未处理）**
```typescript
// image-download.ts:87
task.blob = await response.blob();  // 直接使用原始 Blob
```

**问题示例**：
```
原始 URL: https://example.com/photo.jpg
HTTP 响应: Content-Type: image/webp

jia-web-clipper 行为:
  blob.type = "image/webp" → 修改为 "image/jpeg" → 保存为 photo.jpg ✅

md-save 行为:
  blob.type = "image/webp" → Chrome 自动改名 → 保存为 photo.webp ❌
  Markdown 引用: ./assets/photo.jpg → 404 Not Found
```

#### 4. 路径检测机制

**jia-web-clipper（✅ 简洁）**
```javascript
// handler/browser.js:102-108
const {id, filename: filePath} = downloadResult;  // 等待完成，直接获取真实路径
if (task.taskType == 'mainFileTask') {
  updateDownloadFolder(task.filename, filePath);
} else {
  ExtApi.eraseDownloadItem(id);  // 清理下载历史
}

function updateDownloadFolder(filename, filePath){
  const downloadFolder = T.sanitizePath(filePath).replace(filename, '');
  MxWcStorage.set('downloadFolder', downloadFolder);
}
```

**md-save（❌ 复杂且不可靠）**
```typescript
// local.ts:213-249
private async waitForDownloadPath(downloadId: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // ❌ 3 秒超时后返回 null
      resolve(null);
    }, 3000);

    const checkInterval = setInterval(async () => {
      try {
        const [item] = await browser.downloads.search({ id: downloadId });
        if (item?.filename) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve(item.filename);
        }
      } catch (error) {
        // ❌ 静默失败
      }
    }, 100);  // ❌ 100ms 轮询
  });
}
```

**问题**：
1. 轮询浪费 CPU
2. 超时时间固定（3 秒），无法适应慢速网络
3. 超时后返回 `null`，但调用方未处理空值
4. 没有等待下载完成，可能在下载刚开始时就超时

---

## 核心问题诊断

### 问题 1：未等待下载完成（Critical）

**影响**：导致所有其他问题

**证据**：
```typescript
// local.ts:152-170
const imagePromises = context.images!
  .filter(task => task.status === 'success' && task.blob)
  .map(async (task) => {
    const imagePath = `${imageBasePrefix}${task.filename}`;
    const imageUrl = URL.createObjectURL(task.blob!);

    return browser.downloads.download({  // ← 返回 Promise<number>
      url: imageUrl,
      filename: imagePath,
      saveAs: false
    });
  });

const results = await Promise.allSettled(imagePromises);
// ← 这里 Promise 已 resolve，但文件可能还在下载中
```

**问题分析**：
```javascript
// browser.downloads.download() 的实际行为
async function download(options) {
  const downloadId = createDownloadTask(options);  // 创建任务
  // ❌ 立即返回 ID，不等待下载完成
  return downloadId;
}

// 实际下载流程（异步发生）
downloadTask.start()
  ↓ 触发 onCreated 事件 (downloadItem)
  ↓ 开始下载...
  ↓ 触发 onChanged 事件 (delta.state = 'in_progress')
  ↓ 下载完成
  ↓ 触发 onChanged 事件 (delta.state = 'complete')
```

**时间线对比**：
```
jia-web-clipper（✅ 正确）:
T0: browser.downloads.download() 触发
T1: onCreated 事件 → 记录 downloadId
T2: 开始下载
T3: onChanged (state=in_progress)
T4: 下载完成
T5: onChanged (state=complete) → Promise resolve ✅
T6: BlobUrl.revoke() → 清理资源 ✅

md-save（❌ 错误）:
T0: browser.downloads.download() 触发
T0: Promise 立即 resolve(downloadId) ❌
T1: 继续执行后续代码（可能释放 BlobURL）❌
T2: 开始下载
T3: onChanged (state=in_progress)
T4: BlobURL 已被释放 → 下载失败 ❌
```

---

### 问题 2：BlobURL 内存泄漏（High）

**影响**：长期使用导致浏览器卡顿

**泄漏量计算**：
```typescript
// 单次保存泄漏量
保存 1 篇文章 (5 张图片，每张 1MB):
  5 * 1MB = 5MB BlobURL 泄漏

// 累积泄漏量
保存 10 篇文章: 50MB
保存 100 篇文章: 500MB  ← 浏览器开始卡顿
```

**泄漏原因**：
```typescript
// image-download.ts:66-101
async download(tasks: ImageTask[]) {
  const downloadedTasks = await Promise.all(
    tasks.map(async (task) => {
      task.blob = await response.blob();  // ← Blob 对象占用内存
      return task;
    })
  );
  return { tasks: downloadedTasks, markdown };
}

// local.ts:152-182
context.images!.map(async (task) => {
  const imageUrl = URL.createObjectURL(task.blob!);  // ← 创建 BlobURL
  return browser.downloads.download({ url: imageUrl, ... });
});

// ❌ BlobURL 从未调用 URL.revokeObjectURL()
// ❌ Blob 对象在 context.images 数组中保持引用，无法被 GC
```

**正确的生命周期**：
```typescript
// jia-web-clipper 的做法
const blob = await fetch(url).then(r => r.blob());
const blobUrl = URL.createObjectURL(blob);
try {
  await downloadWithListener(blobUrl);  // 等待下载完成
} finally {
  URL.revokeObjectURL(blobUrl);  // ✅ 释放内存
}
```

---

### 问题 3：Chrome MIME 类型 Bug（Medium）

**影响**：Chrome 浏览器下文件扩展名错误

**复现步骤**：
```typescript
// 1. 原始图片
URL: https://cdn.example.com/photo.jpg
HTTP Response:
  Content-Type: image/webp  ← 服务器返回 WebP 格式

// 2. md-save 行为
const blob = await response.blob();
// blob.type = "image/webp"

const task = {
  filename: "img_abc123.jpg",  // ← 期望保存为 .jpg
  blob: blob  // type = "image/webp"
};

// 3. Chrome downloads API 行为
browser.downloads.download({
  url: URL.createObjectURL(blob),  // ← Blob.type = "image/webp"
  filename: "assets/img_abc123.jpg"  // ← 期望文件名
});

// 4. Chrome 实际保存结果
// Chrome 检测到 Blob.type 与文件扩展名不匹配
// 自动改名: img_abc123.jpg → img_abc123.webp ❌

// 5. Markdown 引用失效
// Markdown: ![](./assets/img_abc123.jpg)
// 实际文件: ./assets/img_abc123.webp
// 结果: 404 Not Found
```

**浏览器差异**：
| 浏览器 | 行为 | 是否需要修复 |
|--------|------|-------------|
| Chrome/Edge | 根据 Blob.type 自动改名 | ✅ 需要 |
| Firefox | 尊重 filename 参数 | ❌ 不需要 |

---

### 问题 4：路径检测机制缺失（Low）

**影响**：无法准确记录用户选择的下载目录

**`waitForDownloadPath()` 的问题**：
```typescript
// local.ts:213-249
private async waitForDownloadPath(downloadId: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null);  // ❌ 超时返回 null
    }, 3000);

    const checkInterval = setInterval(async () => {
      const [item] = await browser.downloads.search({ id: downloadId });
      if (item?.filename) {
        resolve(item.filename);
      }
    }, 100);
  });
}
```

**时间线问题**：
```
T0: browser.downloads.download() 返回 downloadId = 123
T0: 调用 waitForDownloadPath(123)
T1: 第 1 次轮询 → browser.downloads.search({id: 123}) → item = undefined ❌
T2: 第 2 次轮询 → item = undefined
...
T30: 第 30 次轮询 (3 秒后) → 超时返回 null ❌

实际情况：
T5: onCreated 事件触发 → filename 字段可能还未填充（Chrome）
T10: 下载开始 → filename 才确定
T50: 下载完成 → 但已经超时
```

**调用方未处理 `null`**：
```typescript
// local.ts:131-145
const realPath = await this.waitForDownloadPath(mdDownloadId);
if (realPath) {
  // ✅ 有路径：记录目录
} else {
  // ❌ 无路径：静默失败，用户不知道文件去哪了
}
```

---

## 改进方案

### 方案 1：实现 BrowserDownload 包装类（核心）

**设计目标**：
- ✅ 等待下载完成
- ✅ 自动清理 BlobURL
- ✅ 完整的错误处理
- ✅ 跨浏览器兼容

**实现路径**：
```
entrypoints/utils/save/browser-download.ts  (新建)
```

**核心代码**：
```typescript
/**
 * BrowserDownload - 浏览器下载包装类
 *
 * 基于 jia-web-clipper 的 Download 类实现
 * 解决 browser.downloads API 的异步问题
 */
export class BrowserDownload {
  private downloadId?: number;
  private createdListener?: (item: browser.downloads.DownloadItem) => void;
  private changedListener?: (delta: browser.downloads.DownloadDelta) => void;
  private cleanupFn?: () => void;

  constructor(
    private options: browser.downloads.DownloadOptions,
    cleanupFn?: () => void
  ) {
    this.cleanupFn = cleanupFn;
  }

  /**
   * 开始下载并等待完成
   *
   * @returns {id: number, filename: string} 下载 ID 和真实文件路径
   */
  async download(): Promise<{ id: number; filename: string }> {
    return new Promise((resolve, reject) => {
      // 监听 onCreated 事件（获取 downloadId）
      this.createdListener = (item) => {
        if (item.url !== this.options.url) return;
        this.downloadId = item.id;

        // Firefox 在 onCreated 事件中已有 filename
        if (item.filename) {
          console.log('[BrowserDownload] Got filename from onCreated:', item.filename);
        }
      };

      // 监听 onChanged 事件（等待完成/失败）
      this.changedListener = (delta) => {
        if (!this.downloadId || delta.id !== this.downloadId) return;

        // Chrome 在 onChanged 事件中才有 filename
        if (delta.filename?.current) {
          console.log('[BrowserDownload] Got filename from onChanged:', delta.filename.current);
        }

        if (delta.state?.current === 'complete') {
          const filename = delta.filename?.current || '';
          console.log('[BrowserDownload] Download complete:', filename);
          resolve({ id: this.downloadId, filename });
          this.cleanup();
        } else if (delta.state?.current === 'interrupted') {
          const error = delta.error?.current || 'Download interrupted';
          console.error('[BrowserDownload] Download failed:', error);
          reject(new Error(error));
          this.cleanup();
        }
      };

      // 注册监听器
      browser.downloads.onCreated.addListener(this.createdListener);
      browser.downloads.onChanged.addListener(this.changedListener);

      // 触发下载
      browser.downloads.download(this.options)
        .catch((error) => {
          console.error('[BrowserDownload] Failed to start download:', error);
          this.cleanup();
          reject(error);
        });
    });
  }

  /**
   * 清理监听器和资源
   */
  private cleanup() {
    // 移除事件监听器
    if (this.createdListener) {
      browser.downloads.onCreated.removeListener(this.createdListener);
    }
    if (this.changedListener) {
      browser.downloads.onChanged.removeListener(this.changedListener);
    }

    // 调用自定义清理函数（释放 BlobURL）
    if (this.cleanupFn) {
      try {
        this.cleanupFn();
      } catch (error) {
        console.error('[BrowserDownload] Cleanup error:', error);
      }
    }
  }
}
```

**使用示例**：
```typescript
// 下载单个文件
const blobUrl = URL.createObjectURL(blob);
const downloader = new BrowserDownload(
  { url: blobUrl, filename: 'test.jpg', saveAs: false },
  () => URL.revokeObjectURL(blobUrl)  // ✅ 清理回调
);

try {
  const { id, filename } = await downloader.download();
  console.log('Downloaded to:', filename);
} catch (error) {
  console.error('Download failed:', error);
}
```

---

### 方案 2：修复 LocalSaveStrategyImpl

**修改文件**：`entrypoints/utils/save/strategies/local.ts`

**核心改动**：

#### 2.1 修改 `saveAsMultipleFiles()` 方法

```typescript
// local.ts:104-210
private async saveAsMultipleFiles(context: SaveContext): Promise<SaveResult> {
  try {
    console.log('[LocalSaveStrategyImpl] Starting multi-file download...');

    const downloadPath = this.getDownloadPath(context.config);
    const basePath = downloadPath ? `${downloadPath}/` : '';
    const filenameDir = context.filename.includes('/')
      ? context.filename.substring(0, context.filename.lastIndexOf('/') + 1)
      : '';
    const assetsDir = this.getAssetsDir(context);

    // 1. 下载 Markdown 文件
    const mdSafePath = `${basePath}${context.filename}.md`;
    const mdDataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(context.markdown)}`;

    const mdDownloader = new BrowserDownload({
      url: mdDataUrl,
      filename: mdSafePath,
      saveAs: false
    });

    const { id: mdDownloadId, filename: mdRealPath } = await mdDownloader.download();
    console.log('[LocalSaveStrategyImpl] Markdown saved to:', mdRealPath);

    // 2. 并行下载所有图片
    const successTasks = context.images!.filter(
      task => task.status === 'success' && task.blob
    );

    const imageResults = await Promise.allSettled(
      successTasks.map(async (task) => {
        const imagePath = `${basePath}${filenameDir}${assetsDir}/${task.filename}`;
        const imageUrl = URL.createObjectURL(task.blob!);

        const downloader = new BrowserDownload(
          { url: imageUrl, filename: imagePath, saveAs: false },
          () => URL.revokeObjectURL(imageUrl)  // ✅ 自动清理 BlobURL
        );

        try {
          const result = await downloader.download();
          console.log('[LocalSaveStrategyImpl] Image saved:', result.filename);
          return { success: true, task, result };
        } catch (error) {
          console.error('[LocalSaveStrategyImpl] Image download failed:', task.filename, error);
          return { success: false, task, error };
        }
      })
    );

    // 3. 统计结果
    const successCount = imageResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failedCount = imageResults.length - successCount;

    console.log('[LocalSaveStrategyImpl] Download summary:', {
      markdown: mdRealPath,
      images: successCount,
      failed: failedCount
    });

    const fileSize = new Blob([context.markdown]).size;

    return this.createSuccessResult(
      mdRealPath,
      1 + successCount,
      {
        fileSize,
        imageCount: successCount,
        imagesFailedCount: failedCount,
        downloadId: mdDownloadId
      }
    );
  } catch (error) {
    console.error('[LocalSaveStrategyImpl] Multi-file save failed:', error);
    return this.createErrorResult(
      error instanceof Error ? error.message : 'Multi-file download failed',
      'UNKNOWN'
    );
  }
}
```

#### 2.2 修改 `saveAsMarkdown()` 方法

```typescript
// local.ts:61-99
private async saveAsMarkdown(context: SaveContext): Promise<SaveResult> {
  try {
    const downloadPath = this.getDownloadPath(context.config);
    const safePath = downloadPath
      ? `${downloadPath}/${context.filename}.md`
      : `${context.filename}.md`;

    const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(context.markdown)}`;

    const downloader = new BrowserDownload({
      url: dataUrl,
      filename: safePath,
      saveAs: false
    });

    const { id: downloadId, filename: realPath } = await downloader.download();
    console.log('[LocalSaveStrategyImpl] Markdown saved to:', realPath);

    const fileSize = new Blob([context.markdown]).size;

    return this.createSuccessResult(
      realPath,
      1,
      { fileSize, downloadId }
    );
  } catch (error) {
    console.error('[LocalSaveStrategyImpl] Markdown save failed:', error);
    return this.createErrorResult(
      error instanceof Error ? error.message : 'Download failed',
      'PERMISSION'
    );
  }
}
```

#### 2.3 删除 `waitForDownloadPath()` 方法

```typescript
// ❌ 删除 local.ts:213-249
// private async waitForDownloadPath(downloadId: number): Promise<string | null> { ... }
```

---

### 方案 3：添加 Chrome MIME 类型修复

**修改文件**：`entrypoints/utils/save/image-download.ts`

**新增工具函数**：
```typescript
// image-download.ts（文件顶部新增）

/**
 * 检测是否为 Chrome/Edge 浏览器
 */
function isChromium(): boolean {
  return /chrome|edg/i.test(navigator.userAgent) && !/firefox/i.test(navigator.userAgent);
}

/**
 * 扩展名到 MIME 类型映射
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'bmp': 'image/bmp',
  'ico': 'image/x-icon'
};

/**
 * 根据文件扩展名获取 MIME 类型
 */
function extensionToMimeType(ext: string): string {
  return EXTENSION_TO_MIME[ext.toLowerCase()] || 'application/octet-stream';
}
```

**修改 `download()` 方法**：
```typescript
// image-download.ts:66-114
async download(
  tasks: ImageTask[],
  markdown: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ tasks: ImageTask[]; markdown: string }> {
  console.log('[ImageDownloadService] Starting download for', tasks.length, 'images');

  let completedCount = 0;
  const downloadedTasks = await Promise.all(
    tasks.map(async (task) => {
      try {
        task.status = 'downloading';
        console.log('[ImageDownloadService] Downloading:', task.originalUrl);

        const response = await fetch(task.originalUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        let blob = await response.blob();

        // ✅ Chrome MIME 类型修复
        if (isChromium()) {
          const ext = this.getExtension(task.originalUrl) || 'png';
          const expectedMimeType = extensionToMimeType(ext);

          // 如果 Blob 的 type 与期望的 MIME 类型不匹配，修正它
          if (blob.type !== expectedMimeType) {
            console.log('[ImageDownloadService] Chrome MIME fix:', {
              filename: task.filename,
              originalType: blob.type,
              expectedType: expectedMimeType
            });
            blob = blob.slice(0, blob.size, expectedMimeType);
          }
        }

        task.blob = blob;
        task.status = 'success';
        console.log('[ImageDownloadService] Downloaded:', task.filename, `(${task.blob.size} bytes)`);
      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
        console.warn('[ImageDownloadService] Failed to download:', task.originalUrl, error);
      } finally {
        completedCount++;
        onProgress?.(completedCount, tasks.length);
      }
      return task;
    })
  );

  // 回退失败的图片引用
  let fixedMarkdown = markdown;
  const failedTasks = downloadedTasks.filter(task => task.status === 'failed');

  if (failedTasks.length > 0) {
    console.log('[ImageDownloadService] Reverting', failedTasks.length, 'failed images to original URLs');
    fixedMarkdown = this.revertFailedTasks(fixedMarkdown, failedTasks);
  }

  return { tasks: downloadedTasks, markdown: fixedMarkdown };
}
```

---

### 方案 4：清理 Blob 引用（可选优化）

**问题**：`ImageTask.blob` 在下载完成后仍保留引用，阻止 GC

**解决方案**：下载完成后清空 Blob 引用

**修改文件**：`entrypoints/utils/save/strategies/local.ts`

```typescript
// local.ts:152-182
const imageResults = await Promise.allSettled(
  successTasks.map(async (task) => {
    const imagePath = `${basePath}${filenameDir}${assetsDir}/${task.filename}`;
    const imageUrl = URL.createObjectURL(task.blob!);

    const downloader = new BrowserDownload(
      { url: imageUrl, filename: imagePath, saveAs: false },
      () => {
        URL.revokeObjectURL(imageUrl);
        // ✅ 清空 Blob 引用，允许 GC 回收
        task.blob = undefined;
      }
    );

    try {
      const result = await downloader.download();
      return { success: true, task, result };
    } catch (error) {
      return { success: false, task, error };
    }
  })
);
```

---

## 实现细节

### 实现步骤

#### 阶段 1：基础设施（1-2 小时）
1. ✅ 创建 `entrypoints/utils/save/browser-download.ts`
2. ✅ 实现 `BrowserDownload` 类
3. ✅ 编写单元测试（可选）

#### 阶段 2：集成 Local 策略（1 小时）
1. ✅ 修改 `local.ts` 导入 `BrowserDownload`
2. ✅ 重构 `saveAsMarkdown()` 方法
3. ✅ 重构 `saveAsMultipleFiles()` 方法
4. ✅ 删除 `waitForDownloadPath()` 方法

#### 阶段 3：Chrome MIME 修复（30 分钟）
1. ✅ 在 `image-download.ts` 添加工具函数
2. ✅ 修改 `download()` 方法

#### 阶段 4：测试（1-2 小时）
1. ✅ 测试单图片下载
2. ✅ 测试多图片下载
3. ✅ 测试下载失败场景
4. ✅ 测试 Chrome/Firefox 兼容性
5. ✅ 内存泄漏测试

#### 阶段 5：文档和发布（30 分钟）
1. ✅ 更新 CHANGELOG.md
2. ✅ 更新 CLAUDE.md（如需要）
3. ✅ 提交代码 + 创建 PR

---

### 代码清单

#### 新建文件
- `entrypoints/utils/save/browser-download.ts` (约 150 行)

#### 修改文件
- `entrypoints/utils/save/strategies/local.ts`
  - 修改 `saveAsMarkdown()` (约 20 行改动)
  - 修改 `saveAsMultipleFiles()` (约 60 行改动)
  - 删除 `waitForDownloadPath()` (约 40 行删除)

- `entrypoints/utils/save/image-download.ts`
  - 新增工具函数 (约 30 行)
  - 修改 `download()` (约 15 行改动)

**总代码量**：
- 新增：约 180 行
- 修改：约 95 行
- 删除：约 40 行
- 净增：约 235 行

---

### 类型定义

**新增类型**：
```typescript
// browser-download.ts
export interface DownloadResult {
  id: number;        // 下载 ID
  filename: string;  // 真实文件路径（操作系统格式）
}

export type CleanupFunction = () => void;
```

**现有类型（无需修改）**：
```typescript
// types.ts
export interface ImageTask {
  originalUrl: string;
  localPath: string;
  filename: string;
  webdavPath: string;
  status: 'pending' | 'downloading' | 'success' | 'failed';
  blob?: Blob;  // ← 下载完成后应清空
  error?: string;
}
```

---

## 测试策略

### 单元测试

#### 测试 1：BrowserDownload 基础功能
```typescript
// test/browser-download.test.ts
describe('BrowserDownload', () => {
  it('should wait for download completion', async () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    let cleaned = false;

    const downloader = new BrowserDownload(
      { url, filename: 'test.txt', saveAs: false },
      () => { cleaned = true; }
    );

    const result = await downloader.download();

    expect(result.id).toBeGreaterThan(0);
    expect(result.filename).toContain('test.txt');
    expect(cleaned).toBe(true);  // ✅ 清理回调已执行
  });

  it('should handle download failure', async () => {
    const downloader = new BrowserDownload({
      url: 'invalid://url',
      filename: 'test.txt',
      saveAs: false
    });

    await expect(downloader.download()).rejects.toThrow();
  });
});
```

#### 测试 2：Chrome MIME 类型修复
```typescript
// test/image-download.test.ts
describe('ImageDownloadService - Chrome MIME fix', () => {
  it('should fix Blob type for Chrome', async () => {
    // Mock Chrome
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Chrome/120.0.0.0',
      configurable: true
    });

    const service = new ImageDownloadService();

    // Mock fetch 返回 WebP 格式
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['fake'], { type: 'image/webp' }))
    });

    const tasks: ImageTask[] = [{
      originalUrl: 'https://example.com/photo.jpg',
      localPath: './assets/photo.jpg',
      filename: 'photo.jpg',
      webdavPath: 'assets/photo.jpg',
      status: 'pending'
    }];

    const result = await service.download(tasks, '');

    // ✅ Blob type 应该被修正为 image/jpeg
    expect(result.tasks[0].blob?.type).toBe('image/jpeg');
  });
});
```

---

### 集成测试

#### 测试场景矩阵

| 场景 | 图片数量 | 图片状态 | 期望结果 |
|------|---------|---------|---------|
| 1. 无图片 | 0 | - | Markdown 成功下载 |
| 2. 单图片成功 | 1 | success | Markdown + 1 图片成功 |
| 3. 多图片成功 | 5 | all success | Markdown + 5 图片成功 |
| 4. 部分图片失败 | 5 | 3 success, 2 failed | Markdown + 3 图片成功，2 张回退到原始 URL |
| 5. 全部图片失败 | 5 | all failed | Markdown 成功，所有图片回退到原始 URL |
| 6. 下载中断 | 3 | success → interrupted | 捕获错误，返回失败结果 |

#### 测试脚本

```typescript
// test/integration/local-save.test.ts
describe('LocalSaveStrategyImpl - Integration', () => {
  let strategy: LocalSaveStrategyImpl;

  beforeEach(() => {
    strategy = new LocalSaveStrategyImpl();
  });

  it('should save markdown with multiple images', async () => {
    const context: SaveContext = {
      filename: 'test-article',
      markdown: '# Test\n![](./assets/img1.jpg)\n![](./assets/img2.jpg)',
      url: 'https://example.com/article',
      config: DEFAULT_CONFIG,
      images: [
        {
          originalUrl: 'https://example.com/img1.jpg',
          localPath: './assets/img1.jpg',
          filename: 'img1.jpg',
          webdavPath: 'assets/img1.jpg',
          status: 'success',
          blob: new Blob(['fake1'], { type: 'image/jpeg' })
        },
        {
          originalUrl: 'https://example.com/img2.jpg',
          localPath: './assets/img2.jpg',
          filename: 'img2.jpg',
          webdavPath: 'assets/img2.jpg',
          status: 'success',
          blob: new Blob(['fake2'], { type: 'image/jpeg' })
        }
      ]
    };

    const result = await strategy.save(context);

    expect(result.success).toBe(true);
    expect(result.filesCount).toBe(3);  // 1 Markdown + 2 images
    expect(result.metadata?.imageCount).toBe(2);
    expect(result.metadata?.imagesFailedCount).toBe(0);
  });

  it('should handle partial image failure', async () => {
    const context: SaveContext = {
      filename: 'test-article',
      markdown: '# Test\n![](./assets/img1.jpg)\n![](./assets/img2.jpg)',
      url: 'https://example.com/article',
      config: DEFAULT_CONFIG,
      images: [
        {
          originalUrl: 'https://example.com/img1.jpg',
          localPath: './assets/img1.jpg',
          filename: 'img1.jpg',
          webdavPath: 'assets/img1.jpg',
          status: 'success',
          blob: new Blob(['fake1'], { type: 'image/jpeg' })
        },
        {
          originalUrl: 'https://example.com/img2.jpg',
          localPath: './assets/img2.jpg',
          filename: 'img2.jpg',
          webdavPath: 'assets/img2.jpg',
          status: 'failed',  // ✅ 失败的图片
          error: 'Network error'
        }
      ]
    };

    const result = await strategy.save(context);

    expect(result.success).toBe(true);
    expect(result.filesCount).toBe(2);  // 1 Markdown + 1 image
    expect(result.metadata?.imageCount).toBe(1);
    expect(result.metadata?.imagesFailedCount).toBe(1);
  });
});
```

---

### 手动测试清单

#### 测试环境
- [ ] Chrome 120+ (Windows/macOS/Linux)
- [ ] Firefox 120+ (Windows/macOS/Linux)
- [ ] Edge 120+ (Windows)

#### 测试用例

**用例 1：无图片保存**
1. 打开任意纯文本网页
2. 禁用图片下载：Options → Image Download → Disabled
3. 保存整个页面
4. ✅ 验证：Markdown 文件成功下载

**用例 2：单图片保存**
1. 打开包含 1 张图片的网页
2. 启用图片下载
3. 保存页面
4. ✅ 验证：
   - Markdown 文件存在
   - `assets/` 目录存在
   - 图片文件存在且可打开
   - Markdown 中引用路径正确 (`./assets/img_xxx.jpg`)

**用例 3：多图片保存（5 张）**
1. 打开包含 5 张图片的网页
2. 启用图片下载
3. 保存页面
4. ✅ 验证：
   - Markdown 文件存在
   - `assets/` 目录包含 5 张图片
   - 所有图片可打开
   - Markdown 引用正确

**用例 4：大图片保存（5MB+）**
1. 打开包含大图片的网页（高分辨率照片）
2. 保存页面
3. ✅ 验证：
   - 下载成功（不超时）
   - 图片完整（大小正确）

**用例 5：网络失败场景**
1. 打开包含外部图片的网页
2. 启用图片下载
3. 断开网络（在 DevTools 中设置 Offline）
4. 保存页面
5. ✅ 验证：
   - Markdown 保存成功
   - 图片引用回退到原始 URL
   - 控制台显示错误日志

**用例 6：Chrome MIME 类型测试**
1. 打开包含 WebP/AVIF 格式图片的网页（但 URL 以 .jpg 结尾）
2. 保存页面
3. ✅ 验证：
   - Chrome: 图片保存为 `.jpg`（不是 `.webp`）
   - Markdown 引用正确

**用例 7：自定义下载路径**
1. Options → Download Directory → Custom
2. 设置路径：`/Users/xxx/Documents/md-save`
3. 保存页面（含图片）
4. ✅ 验证：
   - Markdown 保存到 `/Users/xxx/Documents/md-save/article.md`
   - 图片保存到 `/Users/xxx/Documents/md-save/assets/img_xxx.jpg`

**用例 8：目录结构保存**
1. 设置 titleTemplate: `{{YYYY}}/{{MM}}/{{title}}`
2. 保存页面（含图片）
3. ✅ 验证：
   - Markdown 保存到 `2025/12/article.md`
   - 图片保存到 `2025/12/assets/img_xxx.jpg`

**用例 9：内存泄漏测试**
1. 打开 Chrome Task Manager (Shift+Esc)
2. 记录扩展初始内存：`M0`
3. 保存 10 篇文章（每篇 5 张图片，每张 1MB）
4. 记录扩展当前内存：`M1`
5. 等待 1 分钟（等待 GC）
6. 记录扩展最终内存：`M2`
7. ✅ 验证：`M2 - M0 < 10MB`（泄漏量可接受）

---

## 风险评估

### 技术风险

#### 风险 1：浏览器兼容性（Medium）
**描述**：`browser.downloads.onChanged` 事件在不同浏览器中行为可能不一致

**缓解措施**：
- ✅ 参考 jia-web-clipper 的跨浏览器实现（已验证）
- ✅ 在 Chrome/Firefox/Edge 上进行完整测试
- ✅ 添加详细的日志输出便于调试

**影响**：如果出现兼容性问题，可能导致某个浏览器下载失败率较高

---

#### 风险 2：事件监听器泄漏（Low）
**描述**：如果 `cleanup()` 未正确调用，监听器可能永久驻留内存

**缓解措施**：
- ✅ Promise 的 `resolve/reject` 都调用 `cleanup()`
- ✅ `catch` 块也调用 `cleanup()`
- ✅ 添加单元测试验证监听器移除

**影响**：长期使用可能导致内存泄漏（但影响小于 BlobURL 泄漏）

---

#### 风险 3：下载超时（Low）
**描述**：大文件或慢速网络下，下载可能永久挂起

**当前状态**：未实现超时机制

**未来改进**：
```typescript
// 可选：添加超时控制
constructor(options, cleanupFn, timeout = 60000) {
  this.timeout = timeout;
}

async download() {
  return Promise.race([
    this.downloadPromise(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Download timeout')), this.timeout);
    })
  ]);
}
```

---

### 用户体验风险

#### 风险 4：下载速度感知（Medium）
**描述**：等待下载完成可能让用户感觉"变慢"

**实际情况**：
- 旧版本：下载 API 立即返回 → 用户看到"成功" → 但文件可能丢失（假成功）
- 新版本：等待下载完成 → 用户看到"成功" → 文件确实存在（真成功）

**缓解措施**：
- ✅ 添加进度提示（"正在下载 3/5 张图片..."）
- ✅ 用户偏好：真实反馈 > 假性能

---

#### 风险 5：错误提示（Low）
**描述**：下载失败错误信息可能不够友好

**当前实现**：
```typescript
// browser.downloads.onChanged 返回的错误信息
delta.error.current = "NETWORK_FAILED"  // 英文技术术语
```

**未来改进**：
```typescript
const ERROR_MESSAGES: Record<string, string> = {
  'NETWORK_FAILED': '网络连接失败，请检查网络设置',
  'FILE_BLOCKED': '文件被浏览器安全设置阻止',
  'FILE_NAME_TOO_LONG': '文件名过长，请使用更短的标题模板'
};

const userFriendlyError = ERROR_MESSAGES[error] || error;
```

---

### 向后兼容性风险

#### 风险 6：配置迁移（None）
**描述**：新版本未引入配置字段变更

**验证**：
- ✅ 未修改 `ExtensionConfig` 类型
- ✅ 未修改 `ImageTask` 类型（仅清空 `blob` 字段）
- ✅ 未修改模板变量

---

#### 风险 7：历史记录兼容性（None）
**描述**：新版本未改变历史记录格式

**验证**：
- ✅ `SaveResult` 类型未变更
- ✅ `addHistoryRecord()` 调用未变更

---

## 附录

### 参考资料

#### 官方文档
- [Chrome Downloads API](https://developer.chrome.com/docs/extensions/reference/downloads/)
- [Firefox Downloads API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads)
- [WebExtensions Polyfill](https://github.com/mozilla/webextension-polyfill)

#### 相关项目
- [jia-web-clipper](https://github.com/mika-cn/maoxian-web-clipper) - 参考实现
- [SingleFile](https://github.com/gildas-lormeau/SingleFile) - 类似项目

---

### 术语表

| 术语 | 定义 |
|------|------|
| BlobURL | 通过 `URL.createObjectURL()` 创建的临时对象 URL，格式：`blob:http://...` |
| Download Task | 浏览器下载管理器中的一个下载任务，有唯一 ID |
| onCreated | `browser.downloads` 事件，下载任务创建时触发 |
| onChanged | `browser.downloads` 事件，下载状态变化时触发（in_progress/complete/interrupted） |
| MIME Type | 媒体类型标识符，如 `image/jpeg`、`text/markdown` |
| Content-Type | HTTP 响应头，指示资源的 MIME 类型 |
| Fire-and-Forget | 异步操作模式：触发后不等待结果 |

---

### 变更历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|---------|
| 1.0 | 2025-12-03 | Linus (Claude Code) | 初始版本：完整分析和改进方案 |

---

### 下一步行动

- [ ] 创建 `browser-download.ts` 文件
- [ ] 修改 `local.ts` 集成新实现
- [ ] 修改 `image-download.ts` 添加 Chrome MIME 修复
- [ ] 编写单元测试
- [ ] 执行集成测试
- [ ] 内存泄漏测试
- [ ] 更新 CHANGELOG.md
- [ ] 提交代码并创建 PR
- [ ] Code Review
- [ ] 合并到主分支
- [ ] 发布新版本

---

**文档结束**
