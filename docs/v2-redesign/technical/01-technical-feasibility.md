# 技术可行性分析
## 关键技术挑战与解决方案

**文档版本**：v1.0
**创建日期**：2025-01-25
**审核状态**：待审核

---

## 一、核心技术挑战

### 1.1 挑战清单

| 挑战 | 难度 | 优先级 | 状态 |
|------|------|--------|------|
| 懒加载页面完整抓取 | ⭐⭐⭐⭐ | P0 | 可行 ✅ |
| 多段内容选择交互 | ⭐⭐⭐ | P0 | 可行 ✅ |
| 保存时选择位置（目录树） | ⭐⭐⭐ | P0 | 可行 ✅ |
| 自动同步（Service Worker 限制） | ⭐⭐⭐⭐⭐ | P1 | 有限可行 ⚠️ |
| 图片批量下载（跨域） | ⭐⭐⭐ | P1 | 可行 ✅ |
| WebDAV 兼容性 | ⭐⭐ | P0 | 可行 ✅ |
| 历史记录合并（冲突解决） | ⭐⭐⭐ | P1 | 可行 ✅ |
| 配置迁移（向后兼容） | ⭐⭐ | P0 | 可行 ✅ |

---

## 二、懒加载页面处理

### 2.1 问题描述

**现象**：
- 现代网站使用懒加载（Lazy Loading）提升性能
- 图片、视频、内容只在滚动到可见区域时加载
- 直接提取 DOM 会丢失大量内容

**常见懒加载实现方式**：
1. **IntersectionObserver API**（现代方式）
   ```javascript
   const observer = new IntersectionObserver((entries) => {
     entries.forEach(entry => {
       if (entry.isIntersecting) {
         const img = entry.target;
         img.src = img.dataset.src; // 从 data-src 加载
       }
     });
   });
   ```

2. **Scroll 事件监听**（传统方式）
   ```javascript
   window.addEventListener('scroll', () => {
     const images = document.querySelectorAll('img[data-src]');
     images.forEach(img => {
       if (isInViewport(img)) {
         img.src = img.dataset.src;
       }
     });
   });
   ```

3. **`loading="lazy"` 属性**（原生支持）
   ```html
   <img src="image.jpg" loading="lazy">
   ```

### 2.2 解决方案

#### 方案 A：模拟滚动（推荐）

**原理**：自动滚动页面到底部，触发所有懒加载

```javascript
// entrypoints/content/lazy-loader.ts
export class LazyLoadHandler {
  async triggerAllLazyLoads(): Promise<void> {
    return new Promise((resolve) => {
      const scrollStep = 500; // 每次滚动 500px
      const scrollDelay = 200; // 等待 200ms 让内容加载

      let currentScroll = 0;
      const maxScroll = document.body.scrollHeight;

      const scrollInterval = setInterval(() => {
        window.scrollTo(0, currentScroll);
        currentScroll += scrollStep;

        if (currentScroll >= maxScroll) {
          clearInterval(scrollInterval);
          // 等待最后一批内容加载
          setTimeout(() => {
            window.scrollTo(0, 0); // 滚回顶部
            resolve();
          }, 1000);
        }
      }, scrollDelay);
    });
  }

  // 检测是否有未加载的图片
  hasLazyImages(): boolean {
    const lazySelectors = [
      'img[data-src]',
      'img[data-lazy-src]',
      'img[loading="lazy"]',
      'img.lazy',
      'img.lazyload'
    ];

    return lazySelectors.some(selector =>
      document.querySelectorAll(selector).length > 0
    );
  }
}
```

**优点**：
- ✅ 兼容所有懒加载方式
- ✅ 简单可靠
- ✅ 不需要分析具体实现

**缺点**：
- ❌ 速度较慢（需要等待滚动和加载）
- ❌ 用户可见（滚动动画）
- ❌ 可能触发页面 Analytics（统计代码）

#### 方案 B：IntersectionObserver 劫持（高级）

**原理**：劫持 IntersectionObserver API，强制触发所有回调

```javascript
export class LazyLoadHijacker {
  hijackIntersectionObserver() {
    const OriginalIO = window.IntersectionObserver;
    const observerCallbacks: Function[] = [];

    window.IntersectionObserver = class extends OriginalIO {
      constructor(callback: IntersectionObserverCallback, options?: any) {
        super(callback, options);
        observerCallbacks.push(callback);
      }
    } as any;

    // 强制触发所有回调
    this.triggerAllObservers = () => {
      observerCallbacks.forEach(callback => {
        // 模拟所有元素都进入视口
        const entries = Array.from(document.querySelectorAll('img')).map(img => ({
          target: img,
          isIntersecting: true,
          // ...其他必需属性
        }));
        callback(entries as any, null as any);
      });
    };
  }
}
```

**优点**：
- ✅ 速度快（不需要真实滚动）
- ✅ 用户无感知

**缺点**：
- ❌ 复杂度高
- ❌ 可能不兼容某些网站
- ❌ 需要在页面加载早期注入

#### 方案 C：使用成熟库（最终推荐）

**使用 `defuddle` 库**（Obsidian 使用的方案）

```javascript
import { defuddle } from 'defuddle';

async function extractContent() {
  // defuddle 内置懒加载处理
  const content = await defuddle(document);

  return {
    title: content.title,
    content: content.content,
    images: content.images
  };
}
```

**优点**：
- ✅ 成熟稳定（Obsidian 验证）
- ✅ 自动处理懒加载
- ✅ 开箱即用

### 2.3 最终方案

**混合策略**：
1. 首先使用 `defuddle` 提取内容（P0）
2. 如果检测到大量 `data-src` 图片，提示用户手动滚动（P1）
3. 提供"深度抓取"选项，使用方案 A（P2）

```javascript
// 伪代码
async function extractWithLazyLoad(mode: 'auto' | 'deep') {
  if (mode === 'auto') {
    return await defuddle(document);
  } else {
    await lazyLoadHandler.triggerAllLazyLoads();
    return await defuddle(document);
  }
}
```

---

## 三、多段内容选择

### 3.1 问题描述

**需求**：
- 用户需要选择页面中不连续的多个段落
- 累加选择（Shift+点击）
- 保持选择顺序
- 可视化反馈（高亮）

**挑战**：
- 如何定位点击的元素？
- 如何高亮选中区域？
- 如何保存选择顺序？
- 如何处理嵌套元素？

### 3.2 解决方案

#### 核心技术：元素高亮 + 点击劫持

```javascript
// entrypoints/content/multi-selector.ts
export class MultiSelector {
  private selectedElements: SelectedElement[] = [];
  private highlightOverlay: HTMLDivElement;

  interface SelectedElement {
    element: HTMLElement;
    order: number;
    rect: DOMRect;
  }

  // 1. 进入选择模式
  enterSelectionMode() {
    // 创建覆盖层（捕获点击事件）
    this.highlightOverlay = document.createElement('div');
    this.highlightOverlay.id = 'clipper-overlay';
    this.highlightOverlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 999998;
      cursor: crosshair;
    `;
    document.body.appendChild(this.highlightOverlay);

    // 监听鼠标移动（高亮可选元素）
    this.highlightOverlay.addEventListener('mousemove', this.handleMouseMove);

    // 监听点击（选择元素）
    this.highlightOverlay.addEventListener('click', this.handleClick);

    // 监听 Esc（退出）
    document.addEventListener('keydown', this.handleEscape);
  }

  // 2. 鼠标移动：高亮当前元素
  private handleMouseMove = (e: MouseEvent) => {
    // 暂时隐藏覆盖层，获取下方元素
    this.highlightOverlay.style.pointerEvents = 'none';
    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
    this.highlightOverlay.style.pointerEvents = 'auto';

    if (!targetElement) return;

    // 找到最近的可选元素（段落、div、section 等）
    const selectableElement = this.findSelectableAncestor(targetElement as HTMLElement);

    // 显示临时高亮
    this.showTemporaryHighlight(selectableElement);
  };

  // 3. 点击：累加选择
  private handleClick = (e: MouseEvent) => {
    e.preventDefault();

    // 获取点击的元素
    const targetElement = this.getElementAtPoint(e.clientX, e.clientY);

    if (e.shiftKey) {
      // Shift+点击：累加选择
      this.addSelection(targetElement);
    } else {
      // 普通点击：单独选择（清除之前的）
      this.clearSelections();
      this.addSelection(targetElement);
    }
  };

  // 4. 添加选择
  private addSelection(element: HTMLElement) {
    // 检查是否已选择
    if (this.isSelected(element)) {
      this.removeSelection(element);
      return;
    }

    const order = this.selectedElements.length + 1;
    const rect = element.getBoundingClientRect();

    this.selectedElements.push({ element, order, rect });

    // 添加持久高亮
    this.addPersistentHighlight(element, order);
  }

  // 5. 持久高亮（显示选择顺序）
  private addPersistentHighlight(element: HTMLElement, order: number) {
    const highlight = document.createElement('div');
    highlight.className = 'clipper-highlight';
    highlight.style.cssText = `
      position: absolute;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      pointer-events: none;
      z-index: 999999;
    `;

    // 添加序号标签
    const label = document.createElement('div');
    label.textContent = order.toString();
    label.style.cssText = `
      position: absolute;
      top: -20px;
      left: 0;
      background: #3b82f6;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
    `;
    highlight.appendChild(label);

    // 定位到元素
    const rect = element.getBoundingClientRect();
    highlight.style.top = `${rect.top + window.scrollY}px`;
    highlight.style.left = `${rect.left + window.scrollX}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;

    document.body.appendChild(highlight);

    // 保存引用用于清理
    element.dataset.highlightId = `highlight-${order}`;
  }

  // 6. 找到可选元素（段落级别）
  private findSelectableAncestor(element: HTMLElement): HTMLElement {
    const selectableTags = ['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE'];

    let current = element;
    while (current && current !== document.body) {
      if (selectableTags.includes(current.tagName)) {
        return current;
      }
      current = current.parentElement!;
    }

    return element;
  }

  // 7. 提取选中内容
  getSelectedContent(): string {
    // 按选择顺序排序
    const sorted = this.selectedElements.sort((a, b) => a.order - b.order);

    // 转换为 Markdown
    const markdownParts = sorted.map((item, index) => {
      const html = item.element.outerHTML;
      const markdown = convertToMarkdown(html);

      return `<!-- 片段 ${index + 1} -->\n\n${markdown}`;
    });

    return markdownParts.join('\n\n---\n\n');
  }
}
```

### 3.3 UI 反馈设计

```
进入选择模式后：

┌─────────────────────────────────┐
│ [顶部提示条]                     │
│ 多段选择模式                     │
│ • 点击元素选择                   │
│ • Shift+点击累加选择              │
│ • 已选择 2 个片段                │
│ [完成] [取消] [清除]             │
└─────────────────────────────────┘

[页面内容]
    ┌───────────────────┐
    │  [1]  选中的段落1  │ ← 蓝色边框 + 序号标签
    └───────────────────┘

    未选中的内容...

    ┌───────────────────┐
    │  [2]  选中的段落2  │ ← 蓝色边框 + 序号标签
    └───────────────────┘
```

### 3.4 可行性结论

**完全可行** ✅

- 技术成熟：元素定位、高亮、点击劫持都是标准 DOM 操作
- 性能良好：只监听必要事件
- 用户体验：清晰的视觉反馈

---

## 四、自动同步限制

### 4.1 问题描述

**用户期望**：
- 后台自动同步配置和历史记录
- 类似 Chrome 的 Settings Sync

**浏览器限制（Manifest V3）**：
1. **Service Worker 生命周期**
   - 每 5 分钟自动休眠
   - 不能自己唤醒自己
   - 用户不操作时无法执行代码

2. **Alarms API 限制**
   - 最小间隔 1 分钟
   - 不保证准时触发
   - 浏览器可以延迟或跳过

3. **Background Sync API**
   - 仅支持 PWA（Service Worker）
   - 不支持 浏览器扩展

### 4.2 解决方案对比

| 方案 | 可靠性 | 用户体验 | 实现难度 |
|------|--------|---------|---------|
| 手动同步（按钮） | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐ |
| 启动时自动同步 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| 定时同步（alarms） | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 操作触发同步 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |

#### 方案 A：手动同步（基础方案）

```javascript
// 用户点击"同步"按钮
async function manualSync() {
  const config = await downloadConfigFromWebDAV();
  await saveConfig(config);

  const remoteHistory = await downloadHistoryFromWebDAV();
  const localHistory = await getLocalHistory();
  const merged = mergeHistories(localHistory, remoteHistory);
  await saveHistory(merged);
}
```

**优点**：
- ✅ 100% 可靠
- ✅ 用户可控

**缺点**：
- ❌ 需要手动操作
- ❌ 容易忘记

#### 方案 B：启动时自动同步（推荐）

```javascript
// background.ts
browser.runtime.onStartup.addListener(async () => {
  const config = await storage.getItem('local:extensionConfig');

  if (config?.autoSync?.enabled) {
    try {
      await syncConfigAndHistory();
      console.log('[Auto-Sync] Startup sync completed');
    } catch (error) {
      console.error('[Auto-Sync] Failed:', error);
    }
  }
});

browser.runtime.onInstalled.addListener(async () => {
  // 首次安装或更新时同步
  await syncConfigAndHistory();
});
```

**优点**：
- ✅ 用户无感知
- ✅ 覆盖大多数使用场景（每天打开浏览器）

**缺点**：
- ❌ 不是实时同步
- ❌ 浏览器不重启就不同步

#### 方案 C：定时同步（辅助方案）

```javascript
// background.ts
browser.alarms.create('auto-sync', {
  periodInMinutes: 30 // 每 30 分钟
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'auto-sync') {
    // Service Worker 可能已休眠，这里会被唤醒
    await syncConfigAndHistory();
  }
});
```

**注意事项**：
- ⚠️ 不保证准时触发
- ⚠️ 浏览器省电模式可能跳过
- ⚠️ 最小间隔 1 分钟（但没必要这么频繁）

#### 方案 D：操作触发同步（智能方案）

```javascript
// 保存内容时自动上传
async function saveContent(content, saveContext) {
  // 1. 保存到本地/WebDAV
  await saveStrategy.save(content, saveContext);

  // 2. 记录到历史
  const record = createHistoryRecord(content);
  await addLocalHistory(record);

  // 3. 如果启用自动同步，上传历史记录
  if (config.autoSync?.enabled) {
    await uploadHistoryToWebDAV([record]); // 增量上传
  }
}

// 修改配置时自动上传
browser.storage.onChanged.addListener(async (changes) => {
  if (changes.extensionConfig && config.autoSync?.enabled) {
    await uploadConfigToWebDAV(changes.extensionConfig.newValue);
  }
});
```

**优点**：
- ✅ 接近实时同步
- ✅ 无需用户操作

**缺点**：
- ❌ 只能上传，不能自动下载
- ❌ 需要网络连接

### 4.3 最终方案（混合策略）

```javascript
// 同步策略配置
interface AutoSyncConfig {
  enabled: boolean;

  // 上传策略（实时）
  uploadOnSave: boolean;       // 保存内容时上传历史记录
  uploadOnConfigChange: boolean; // 修改配置时上传

  // 下载策略（定时）
  downloadOnStartup: boolean;  // 启动时下载（默认 true）
  downloadInterval: number;    // 定时下载间隔（分钟，0=禁用）
}
```

**实际行为**：
1. **上传（实时）**：
   - 用户保存内容 → 立即上传到 WebDAV
   - 用户修改配置 → 立即上传

2. **下载（定时）**：
   - 浏览器启动 → 自动下载最新配置和历史
   - 每 30 分钟 → 自动下载（如果用户启用）
   - 手动点击"同步"按钮 → 立即下载

3. **冲突解决**：
   - 上传：直接覆盖（Last Write Wins）
   - 下载：检测本地是否有未上传的新记录，提示用户

### 4.4 可行性结论

**有限可行** ⚠️

- ✅ 手动同步 100% 可靠
- ✅ 启动时同步覆盖大多数场景
- ⚠️ 定时同步不可靠（Service Worker 限制）
- ✅ 操作触发同步（上传）可靠

**推荐配置**：
- 默认启用：启动时同步 + 操作触发上传
- 可选启用：定时同步（30 分钟）
- 永远保留：手动同步按钮

---

## 五、保存时选择位置

### 5.1 问题描述

**需求**：
- 用户在保存时决定文件存到哪里（不是预设默认路径）
- 本地保存：触发浏览器下载对话框
- WebDAV 保存：显示目录树选择器

### 5.2 技术方案

#### 方案 A：本地保存 - 浏览器下载 API

```javascript
// Background Script（必须在 background 中执行）
async function saveToLocal(content: string, filename: string) {
  // 1. 创建 Blob
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  // 2. 触发下载（会弹出浏览器的保存对话框）
  const downloadId = await browser.downloads.download({
    url: url,
    filename: filename, // 建议的文件名
    saveAs: true,       // 强制显示对话框（用户选择目录）
    conflictAction: 'uniquify' // 文件冲突时自动重命名
  });

  // 3. 等待用户选择目录并下载完成
  await waitForDownloadComplete(downloadId);

  // 4. 获取用户选择的完整路径
  const [download] = await browser.downloads.search({ id: downloadId });
  const finalPath = download.filename; // 完整路径：C:/Users/xxx/Downloads/article.md

  // 5. 清理 Blob URL
  URL.revokeObjectURL(url);

  return { success: true, path: finalPath };
}
```

**优点**：
- ✅ 用户使用浏览器原生对话框（熟悉）
- ✅ 可以选择任意目录
- ✅ 浏览器会记住上次选择的目录

**缺点**：
- ❌ 无法完全控制 UI
- ❌ 路径格式因操作系统而异

#### 方案 B：WebDAV 保存 - 自定义目录树

```javascript
// WebDAV 目录树组件
interface DirectoryNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DirectoryNode[];
}

async function loadDirectoryTree(basePath: string): Promise<DirectoryNode> {
  const items = await webdavClient.getDirectoryContents(basePath);

  const tree: DirectoryNode = {
    name: basePath,
    path: basePath,
    isDirectory: true,
    children: []
  };

  for (const item of items) {
    if (item.type === 'directory') {
      tree.children!.push({
        name: item.basename,
        path: item.filename,
        isDirectory: true
      });
    }
  }

  return tree;
}
```

**UI 组件**（Vue 3）：

```vue
<template>
  <div class="directory-selector">
    <div class="breadcrumb">
      <span v-for="(part, index) in pathParts" :key="index">
        <button @click="navigateTo(index)">{{ part }}</button>
        <span v-if="index < pathParts.length - 1">/</span>
      </span>
    </div>

    <div class="directory-list">
      <div
        v-for="dir in directories"
        :key="dir.path"
        class="directory-item"
        @click="selectDirectory(dir)"
      >
        <Folder class="icon" />
        <span>{{ dir.name }}</span>
      </div>
    </div>

    <div class="actions">
      <button @click="createNewFolder">新建文件夹</button>
      <button @click="confirm">确定</button>
    </div>
  </div>
</template>
```

**ASCII 预览**：

```
┌─────────────────────────────────┐
│ 选择保存位置                     │
│ ═════════════════════════════════│
│ 路径: / notes / tech            │
│       [^]  [^]    [^]             │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 📁 2025                     │ │
│ │ 📁 javascript               │ │
│ │ 📁 python                   │ │
│ │ 📁 web-development          │ │
│ └─────────────────────────────┘ │
│                                  │
│ [+ 新建文件夹]  [确定]  [取消]   │
└─────────────────────────────────┘
```

### 5.3 可行性结论

**完全可行** ✅

- 本地保存：浏览器原生 API 支持
- WebDAV 保存：标准 WebDAV PROPFIND 方法获取目录列表
- UI 实现：标准 Vue 组件

---

## 六、其他技术要点

### 6.1 图片批量下载（跨域处理）

**问题**：Content Script 无法下载跨域图片

**解决方案**：通过 Background Script 中转

```javascript
// Content Script 发送请求
const imageUrls = extractImageUrls(markdown);
const result = await browser.runtime.sendMessage({
  type: 'DOWNLOAD_IMAGES',
  data: imageUrls
});

// Background Script 处理（无跨域限制）
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_IMAGES') {
    (async () => {
      const blobs = await Promise.all(
        message.data.map(url => fetch(url).then(r => r.blob()))
      );
      sendResponse({ success: true, blobs });
    })();
    return true; // 保持通道开启
  }
});
```

### 6.2 WebDAV 兼容性

**主流服务器测试**：
- Nextcloud ✅
- Synology NAS ✅
- 坚果云 ✅
- Seafile ✅
- Infini Cloud（原 ownCloud）✅

**标准方法**：
- PROPFIND（列出目录）
- PUT（上传文件）
- GET（下载文件）
- MKCOL（创建目录）
- DELETE（删除）

### 6.3 历史记录合并策略

```javascript
function mergeHistories(local: HistoryRecord[], remote: HistoryRecord[]): HistoryRecord[] {
  const map = new Map<string, HistoryRecord>();

  // 1. 添加所有本地记录
  local.forEach(record => map.set(record.id, record));

  // 2. 合并远端记录
  remote.forEach(record => {
    const existing = map.get(record.id);
    if (!existing) {
      // 新记录，直接添加
      map.set(record.id, record);
    } else {
      // 冲突：保留时间戳更新的
      if (record.timestamp > existing.timestamp) {
        map.set(record.id, record);
      }
    }
  });

  // 3. 按时间排序
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}
```

---

## 七、性能评估

### 7.1 关键操作性能目标

| 操作 | 目标时间 | 预估时间 | 状态 |
|------|---------|---------|------|
| 全页提取（无懒加载） | < 2s | 1-2s | ✅ |
| 全页提取（懒加载） | < 5s | 3-5s | ✅ |
| 多段选择（5 个片段） | < 1s | 0.5s | ✅ |
| 本地保存 | < 2s | 1s | ✅ |
| WebDAV 上传（1MB） | < 3s | 2-4s | ✅ |
| 历史记录加载（1000 条） | < 1s | 0.5s | ✅ |
| 历史记录合并（1000+1000） | < 2s | 1s | ✅ |

### 7.2 内存占用

- Extension 静态内存：< 10MB
- Content Script（选择模式）：< 5MB
- 历史记录（1000 条）：< 2MB
- 图片缓存（临时）：< 50MB

---

## 八、风险与缓解

### 8.1 高风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Service Worker 频繁休眠导致同步失败 | 高 | 中 | 1. 默认手动同步<br>2. 启动时同步<br>3. 操作触发上传 |
| 懒加载处理不完整 | 中 | 中 | 1. 使用成熟库（defuddle）<br>2. 提供手动触发<br>3. 提示用户滚动 |
| WebDAV 服务器兼容性问题 | 中 | 低 | 1. 测试主流服务器<br>2. 提供错误日志<br>3. 社区反馈 |

### 8.2 缓解策略

1. **防御性编程**：
   - 所有网络请求都有超时
   - 所有异步操作都有错误处理
   - 关键数据本地备份

2. **渐进式增强**：
   - 核心功能不依赖高级特性
   - 自动同步失败不影响手动同步
   - 懒加载失败仍能提取部分内容

3. **用户可控**：
   - 所有自动功能都有开关
   - 提供手动替代方案
   - 显示详细错误信息

---

## 九、技术选型

### 9.1 核心库选择

| 功能 | 库/方案 | 理由 |
|------|---------|------|
| 框架 | Vue 3 + WXT | 现代、类型安全、WXT 简化开发 |
| 内容提取 | defuddle | Obsidian 验证，处理懒加载 |
| HTML→MD | turndown + turndown-plugin-gfm | 成熟稳定，支持 GFM |
| 浏览器兼容 | webextension-polyfill | 官方推荐 |
| 日期处理 | dayjs | 轻量，Obsidian 使用 |
| 图标 | lucide-vue-next | 现代，与 Obsidian 一致 |
| WebDAV | 自实现客户端 | 控制力强，避免依赖 |
| 存储 | browser.storage + IndexedDB | 标准 API，大容量支持 |

### 9.2 架构模式

- **MV VM**：Vue 3 Composition API
- **策略模式**：保存策略（Local/WebDAV/...）
- **观察者模式**：配置变更监听
- **工厂模式**：内容提取器工厂

---

## 十、结论

### 10.1 整体可行性

**所有核心功能都可以实现** ✅

| 功能类别 | 可行性 | 备注 |
|---------|--------|------|
| 内容提取 | ✅ 100% | 使用成熟库 |
| 多段选择 | ✅ 100% | 标准 DOM 操作 |
| 本地保存 | ✅ 100% | 浏览器原生 API |
| WebDAV 保存 | ✅ 100% | 标准协议 |
| 元数据管理 | ✅ 100% | 数据结构设计 |
| 历史记录 | ✅ 100% | browser.storage + IndexedDB |
| 配置同步 | ⚠️ 90% | 手动+启动时可靠 |
| 历史同步 | ⚠️ 90% | 同上 |
| 自动同步 | ⚠️ 60% | Service Worker 限制 |

### 10.2 技术债务

**必须处理的问题**：
1. 配置迁移系统（向后兼容）
2. 错误处理和日志系统
3. 性能监控和优化

**可以延后的问题**：
1. AI 辅助功能
2. 高级模板逻辑（if/for）
3. 插件式架构（第三方存储）

### 10.3 开发建议

1. **分阶段实现**：
   - Phase 1: 核心功能（提取、保存、历史）
   - Phase 2: 增强功能（多段、图片、模板）
   - Phase 3: 同步功能（配置、历史）

2. **测试策略**：
   - 单元测试：工具函数、数据处理
   - 集成测试：保存流程、同步流程
   - 端到端测试：常见网站提取

3. **文档优先**：
   - 用户文档：快速开始、常见问题
   - 开发文档：架构设计、API 文档
   - 社区文档：贡献指南、模板开发

---

**文档状态**：完成
**最后更新**：2025-01-25
**审核人**：待审核
