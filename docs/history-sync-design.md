# 历史记录同步功能设计文档

**版本**: 1.0.0
**创建日期**: 2025-01-15
**状态**: 设计完成，待实施

---

## 1. 需求概述

### 1.1 核心需求

实现浏览器扩展历史记录的多设备同步功能，通过 WebDAV 存储实现数据共享。

**用户故事：**
- 作为用户，我希望在公司电脑保存的文章，回家后能在个人电脑查看
- 作为用户，我希望保存文章后自动同步，无需手动操作
- 作为用户，我希望看到所有设备的完整保存历史，按时间排序

### 1.2 需求范围

**包含功能：**
- ✅ 历史记录自动同步到 WebDAV
- ✅ 保存文章时自动上传
- ✅ 扩展启动时自动下载合并
- ✅ 手动同步按钮
- ✅ 历史记录 UI 改进（时间排序、搜索、分页、悬浮提示）

**不包含功能：**
- ❌ 配置自动同步（保持现有的手动上传/下载机制）
- ❌ 冲突解决 UI（自动合并，无需用户选择）
- ❌ 虚拟滚动（使用简单分页）

---

## 2. 核心设计决策

### 2.1 是否需要去重？

**决策：必须去重**

**原因分析：**

```text
场景1：正常的多次保存（不应去重）
  设备A 周一保存文章X → {url: "x", savedAt: 100}
  设备A 周二保存文章X（内容更新）→ {url: "x", savedAt: 200}
  期望：显示2条记录（不同时间的保存）

场景2：同步导致的副本（必须去重）
  设备A 保存 → {url: "x", savedAt: 100} → 上传云端
  设备B 下载 → 本地已有 {url: "x", savedAt: 100}
  如果不去重：设备B显示2条完全相同的记录（BUG）
```

**去重策略：**
- **唯一Key**: `${url}_${savedAt}`
- **效果**:
  - 相同URL + 相同时间 → 去重（同步副本）
  - 相同URL + 不同时间 → 保留（真实的多次保存）

### 2.2 配置是否自动同步？

**决策：只自动同步历史记录，不自动同步配置**

**对比分析：**

| 特性 | 历史记录 | 配置 |
|------|---------|------|
| 数据性质 | 只增不改（Append-only） | 可修改可删除 |
| 合并策略 | 简单（取并集去重） | 复杂（哪个是正确版本？） |
| 多设备需求 | 所有设备看到相同历史 | 可能需要不同配置 |
| 风险 | 低（最坏情况是重复） | 高（错误配置会导致功能失效） |

**风险示例：**
```text
设备A：家里电脑，WebDAV密码改为"newpass"
自动同步 → 设备B：公司电脑，WebDAV密码被覆盖为"newpass"
但设备B连接的是公司WebDAV，密码应该是"oldpass"
→ 设备B无法连接WebDAV（功能失效）
```

### 2.3 保存时是否自动同步？

**决策：必须实现（P0需求）**

**用户期望的工作流：**
```text
✅ 正确流程：
  1. 设备A：保存文章 → 自动同步到云端
  2. 设备B：启动扩展 → 自动看到设备A的文章

❌ 错误流程（如果没有自动同步）：
  1. 设备A：保存文章
  2. 设备A：手动点击"同步"按钮
  3. 设备B：打开扩展
  4. 设备B：手动点击"同步"按钮
  → 用户体验差，容易忘记同步
```

**实现方式：**
- 用户保存文章 → `addHistoryRecord()`
- → 添加到本地 storage
- → 调用 `historySyncService.appendRecord()`
- → 下载云端 history.json
- → 添加新记录并去重
- → 上传到云端（覆盖）

**性能分析：**
- 1000条记录的 history.json ≈ 500KB
- 下载+解析+添加+上传 ≈ 1秒（10Mbps网络）
- 保存频率：一天5-10次
- **结论：1秒延迟可接受**

### 2.4 启动时同步会阻塞吗？

**决策：不会阻塞，异步执行**

**技术实现：**
```typescript
browser.runtime.onStartup.addListener(async () => {
  // Service Worker异步执行，不阻塞扩展启动
  if (config.historySync?.enabled && config.historySync?.autoSyncOnStartup) {
    historySyncService.sync().catch(err => console.error('Sync failed:', err));
  }
});
```

**性能测试：**
- 1000条记录：
  - 下载：0.4s（500KB / 10Mbps）
  - 解析JSON：10ms
  - 合并去重：10ms
  - 保存到storage：50ms
- **总计：≈ 0.5秒**
- 不阻塞UI（独立线程）
- 用户打开popup不需要等待同步完成

### 2.5 是否需要唯一ID字段？

**决策：不需要持久化ID字段，运行时计算即可**

**方案对比：**

**方案A：添加 id 字段**
```typescript
interface HistoryRecord {
  id: string;  // "${url}_${savedAt}"
  url: string;
  savedAt: number;
  // ...
}
```
- 优点：查询时可以直接用 id
- 缺点：数据冗余、需要迁移旧数据、增加存储空间

**方案B：运行时计算（✅ 采用）**
```typescript
function getRecordKey(record: HistoryRecord): string {
  return `${record.url}_${record.savedAt}`;
}

function deduplicateRecords(records: HistoryRecord[]): HistoryRecord[] {
  const map = new Map<string, HistoryRecord>();
  records.forEach(r => map.set(getRecordKey(r), r));
  return Array.from(map.values());
}
```
- 优点：
  - ✅ 零数据迁移（完全向后兼容）
  - ✅ 没有数据冗余
  - ✅ 逻辑集中在一个函数中
- 缺点：需要每次计算（但这是 O(1) 操作，性能影响可忽略）

**Linus 的判断：方案B**
> "Don't store what you can compute. Computation is cheap, storage bugs are expensive."

### 2.6 WebDAV 服务是否复用？

**决策：完全复用现有的 webdav-client.ts**

**现有API：**
```typescript
// 下载
const content = await webdavClient.downloadFile('/path/to/history.json');

// 上传
await webdavClient.uploadFile('/path/to/history.json', content, true);

// 确保目录存在
await webdavClient.ensureDirectory('/path/to/dir/');
```

**结论：现有API完全够用，不需要新增任何方法**

---

## 3. 数据结构设计

### 3.1 HistoryRecord（不变）

```typescript
// types/history.ts
export interface HistoryRecord {
  // === 现有字段（完全不变）===
  title: string;
  url: string;
  savedAt: number;     // 已有！用于排序和去重
  content: string;
  saveMethod: 'local' | 'webdav';

  // === 不需要新增字段 ===
  // id?: string;  ❌ 删除 - 运行时计算即可
}

// 运行时计算唯一key（零存储冗余）
export function getRecordKey(record: HistoryRecord): string {
  return `${record.url}_${record.savedAt}`;
}
```

**关键设计：**
- ✅ 零字段新增 = 零数据迁移
- ✅ `url + savedAt` 组合 = 完美的自然主键
- ✅ 同一URL不同时间 → 不同记录（支持查看历史版本）
- ✅ 同一URL相同时间 → 去重（同步场景）

### 3.2 ExtensionConfig（扩展）

```typescript
// types/config.ts
export interface ExtensionConfig {
  // ... 现有字段不变 ...

  historySync?: {  // 可选 = 向后兼容
    enabled: boolean;              // 是否启用历史同步
    autoSyncOnStartup?: boolean;   // 启动时自动同步（默认true）
    syncDir?: string;              // 同步目录（默认使用configSyncDir）
  };
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  // ... 现有默认值 ...
  historySync: {
    enabled: false,
    autoSyncOnStartup: true,
  }
};
```

**向后兼容性：**
- `historySync?` 是可选字段，旧配置不会报错
- 未设置时 `enabled: false`，不影响现有功能

### 3.3 WebDAV 存储格式

```json
// WebDAV: /md-save-settings/history.json
{
  "version": "1.0.0",
  "lastSyncAt": 1736899200000,
  "records": [
    {
      "title": "Article Title",
      "url": "https://example.com/article",
      "savedAt": 1736899100000,
      "content": "# Article\n\nContent...",
      "saveMethod": "webdav"
    }
  ]
}
```

**为什么单文件而不是多文件？**
- 浏览器扩展是单用户环境，无真正并发
- 1000条记录 ≈ 500KB，一次性读写完全可接受
- 合并逻辑是幂等的，即使两台设备同时同步也不会丢数据

---

## 4. 核心算法

### 4.1 合并去重算法

```typescript
/**
 * 合并并去重历史记录
 *
 * 输入：本地记录 + 云端记录
 * 输出：去重后的合并结果
 *
 * 规则：相同 url+savedAt 只保留一条
 * 复杂度：O(n)
 */
function mergeRecords(records: HistoryRecord[]): HistoryRecord[] {
  const map = new Map<string, HistoryRecord>();

  for (const record of records) {
    const key = getRecordKey(record);  // `${url}_${savedAt}`
    map.set(key, record);  // Map自动去重
  }

  return Array.from(map.values());
}
```

**关键特性：**
- 简单直接：10行代码，零分支
- 幂等操作：多次执行结果相同
- 性能优秀：O(n) 时间复杂度，1000条记录约10ms

### 4.2 同步流程

#### 4.2.1 保存时增量同步

```typescript
async function appendRecord(record: HistoryRecord): Promise<SyncResult> {
  // 1. 下载云端数据
  const remote = await downloadFromWebDAV();

  // 2. 添加新记录
  remote.push(record);

  // 3. 去重（防止重复上传）
  const merged = mergeRecords(remote);

  // 4. 上传
  await uploadToWebDAV(merged);

  return { success: true, count: merged.length };
}
```

**为什么不是真正的"增量"？**
- 真正的增量需要：下载 → 读取 → 追加 → 上传
- 但如果多个设备同时保存，会产生并发冲突
- 当前方案（全量上传）简单且安全，性能可接受

#### 4.2.2 全量同步

```typescript
async function sync(): Promise<SyncResult> {
  // 1. 下载云端
  const remote = await downloadFromWebDAV();

  // 2. 读取本地
  const local = await getLocalHistory();

  // 3. 合并去重
  const merged = mergeRecords([...local, ...remote]);

  // 4. 双向更新
  await Promise.all([
    saveLocalHistory(merged),
    uploadToWebDAV(merged)
  ]);

  return { success: true, count: merged.length };
}
```

**使用场景：**
- 扩展启动时自动同步
- 用户点击"同步"按钮

---

## 5. 技术实现

### 5.1 文件结构

```
utils/
  ├── history-sync.ts          # 新增：同步服务
  ├── webdav-client.ts         # 现有：复用
types/
  ├── config.ts                # 修改：添加 historySync 配置
  ├── history.ts               # 现有：不变
entrypoints/
  ├── background.ts            # 修改：集成同步逻辑
  ├── options/App.vue          # 修改：添加同步配置UI
  ├── saved-records/App.vue    # 修改：UI改进 + 同步按钮
```

### 5.2 HistorySyncService（核心服务）

```typescript
// utils/history-sync.ts
import { WebDAVClient } from './webdav-client';
import type { HistoryRecord } from '../types/history';
import type { ExtensionConfig } from '../types/config';

export interface SyncResult {
  success: boolean;
  count?: number;
  error?: string;
}

export function getRecordKey(record: HistoryRecord): string {
  return `${record.url}_${record.savedAt}`;
}

export class HistorySyncService {
  private webdavClient: WebDAVClient | null = null;
  private config: ExtensionConfig | null = null;

  async init(): Promise<void> {
    const { extensionConfig } = await browser.storage.local.get('extensionConfig');
    this.config = extensionConfig;

    if (this.config?.webdav?.url) {
      this.webdavClient = new WebDAVClient(
        this.config.webdav.url,
        this.config.webdav.username,
        this.config.webdav.password,
        this.config.webdav.authType
      );
    }
  }

  /** 保存时增量同步 */
  async appendRecord(record: HistoryRecord): Promise<SyncResult> {
    if (!this.config?.historySync?.enabled) {
      return { success: false, error: '历史同步未启用' };
    }

    try {
      const remote = await this.downloadFromWebDAV();
      remote.push(record);
      const merged = this.mergeRecords(remote);
      await this.uploadToWebDAV(merged);

      return { success: true, count: merged.length };
    } catch (error) {
      console.error('Append record failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /** 全量同步 */
  async sync(): Promise<SyncResult> {
    if (!this.config?.historySync?.enabled) {
      return { success: false, error: '历史同步未启用' };
    }

    if (!this.webdavClient) {
      return { success: false, error: 'WebDAV未配置' };
    }

    try {
      const remote = await this.downloadFromWebDAV();
      const local = await this.getLocalHistory();
      const merged = this.mergeRecords([...local, ...remote]);

      await Promise.all([
        this.saveLocalHistory(merged),
        this.uploadToWebDAV(merged)
      ]);

      return { success: true, count: merged.length };
    } catch (error) {
      console.error('Sync failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private mergeRecords(records: HistoryRecord[]): HistoryRecord[] {
    const map = new Map<string, HistoryRecord>();
    for (const record of records) {
      map.set(getRecordKey(record), record);
    }
    return Array.from(map.values());
  }

  private async getLocalHistory(): Promise<HistoryRecord[]> {
    const { saveHistory } = await browser.storage.local.get('saveHistory');
    return saveHistory || [];
  }

  private async saveLocalHistory(records: HistoryRecord[]): Promise<void> {
    await browser.storage.local.set({ saveHistory: records });
  }

  private async downloadFromWebDAV(): Promise<HistoryRecord[]> {
    if (!this.webdavClient || !this.config) return [];

    const syncDir = this.config.historySync?.syncDir
      || this.config.configSyncDir
      || '/md-save-settings/';
    const filePath = `${syncDir}/history.json`;

    try {
      const content = await this.webdavClient.downloadFile(filePath);
      const data = JSON.parse(content);
      return data.records || [];
    } catch (error) {
      console.log('No remote history, starting fresh');
      return [];
    }
  }

  private async uploadToWebDAV(records: HistoryRecord[]): Promise<void> {
    if (!this.webdavClient || !this.config) {
      throw new Error('WebDAV not configured');
    }

    const syncDir = this.config.historySync?.syncDir
      || this.config.configSyncDir
      || '/md-save-settings/';

    await this.webdavClient.ensureDirectory(syncDir);

    const data = {
      version: '1.0.0',
      lastSyncAt: Date.now(),
      records
    };

    const filePath = `${syncDir}/history.json`;
    await this.webdavClient.uploadFile(
      filePath,
      JSON.stringify(data, null, 2),
      true  // overwrite
    );
  }
}

// 全局单例
export const historySyncService = new HistorySyncService();
```

### 5.3 Background 集成

```typescript
// entrypoints/background.ts
import { historySyncService } from '../utils/history-sync';

// 初始化同步服务
historySyncService.init();

// 启动时自动同步
browser.runtime.onStartup.addListener(async () => {
  const { extensionConfig } = await browser.storage.local.get('extensionConfig');

  if (extensionConfig?.historySync?.enabled &&
      extensionConfig?.historySync?.autoSyncOnStartup !== false) {
    historySyncService.sync().catch(err =>
      console.error('Auto sync on startup failed:', err)
    );
  }
});

// 修改现有的 addHistoryRecord 函数
async function addHistoryRecord(record: HistoryRecord) {
  // 1. 添加到本地
  const { saveHistory = [] } = await browser.storage.local.get('saveHistory');
  saveHistory.unshift(record);
  await browser.storage.local.set({ saveHistory });

  // 2. 保存时同步到云端（异步，不阻塞）
  const { extensionConfig } = await browser.storage.local.get('extensionConfig');
  if (extensionConfig?.historySync?.enabled) {
    historySyncService.appendRecord(record).catch(err =>
      console.error('Auto sync after save failed:', err)
    );
  }
}
```

### 5.4 Options UI

```vue
<!-- entrypoints/options/App.vue -->
<template>
  <div class="config-section">
    <h2>历史记录同步</h2>

    <!-- 同步开关 -->
    <div class="config-item">
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          v-model="config.historySync.enabled"
          @change="saveConfig"
        />
        <span>启用历史记录同步到 WebDAV</span>
      </label>
    </div>

    <!-- 同步选项（仅在启用时显示） -->
    <div v-if="config.historySync?.enabled" class="ml-6 mt-3 space-y-3">
      <!-- 自动同步 -->
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          v-model="config.historySync.autoSyncOnStartup"
          @change="saveConfig"
        />
        <span>扩展启动时自动同步</span>
      </label>

      <!-- 同步目录 -->
      <div class="space-y-1">
        <label class="block text-sm font-medium">同步目录（可选）</label>
        <input
          type="text"
          v-model="config.historySync.syncDir"
          placeholder="未设置时使用配置同步目录"
          class="w-full px-3 py-2 border rounded"
          @blur="saveConfig"
        />
        <p class="text-xs text-gray-500">
          留空则使用：{{ config.configSyncDir || '/md-save-settings/' }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { ExtensionConfig } from '../../types/config';

const config = ref<ExtensionConfig>({
  // ... 初始化 ...
  historySync: {
    enabled: false,
    autoSyncOnStartup: true,
  }
});

async function saveConfig() {
  await browser.storage.local.set({ extensionConfig: config.value });
}
</script>
```

### 5.5 历史记录页面 UI 改进

```vue
<!-- entrypoints/saved-records/App.vue -->
<template>
  <div class="history-page p-4">
    <!-- 顶部操作栏 -->
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-2xl font-bold">保存历史</h1>

      <!-- 同步按钮 -->
      <button
        @click="handleSync"
        :disabled="isSyncing"
        class="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        <RefreshCw :class="{ 'animate-spin': isSyncing }" class="w-4 h-4" />
        {{ syncButtonText }}
      </button>
    </div>

    <!-- 搜索框 -->
    <div class="mb-4">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索标题或 URL..."
        class="w-full px-4 py-2 border rounded"
      />
    </div>

    <!-- 统计信息 -->
    <div class="mb-2 text-sm text-gray-600">
      共 {{ filteredRecords.length }} 条记录
      <span v-if="searchQuery">（已过滤）</span>
    </div>

    <!-- 表格 -->
    <table class="w-full border-collapse">
      <thead>
        <tr class="bg-gray-100">
          <th class="border p-2 text-left">标题</th>
          <th class="border p-2 text-left">URL</th>
          <th class="border p-2 text-left w-40">保存时间</th>
          <th class="border p-2 text-left w-32">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="record in currentPageRecords" :key="getRecordKey(record)">
          <!-- 标题（悬浮提示） -->
          <td class="border p-2 max-w-xs truncate" :title="record.title">
            {{ record.title }}
          </td>

          <!-- URL（悬浮提示） -->
          <td class="border p-2 max-w-md truncate" :title="record.url">
            {{ record.url }}
          </td>

          <!-- 时间 -->
          <td class="border p-2">
            {{ formatTime(record.savedAt) }}
          </td>

          <!-- 操作 -->
          <td class="border p-2">
            <button @click="viewRecord(record)">查看</button>
            <button @click="deleteRecord(record)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="mt-4 flex justify-center items-center gap-2">
      <button
        @click="currentPage--"
        :disabled="currentPage === 1"
        class="px-3 py-1 border rounded disabled:opacity-50"
      >
        上一页
      </button>

      <span>第 {{ currentPage }} / {{ totalPages }} 页</span>

      <button
        @click="currentPage++"
        :disabled="currentPage === totalPages"
        class="px-3 py-1 border rounded disabled:opacity-50"
      >
        下一页
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { getRecordKey } from '../../utils/history-sync';
import type { HistoryRecord } from '../../types/history';

const records = ref<HistoryRecord[]>([]);
const searchQuery = ref('');
const currentPage = ref(1);
const pageSize = 50;
const isSyncing = ref(false);
const syncMessage = ref('');

// 按时间倒序排序
const sortedRecords = computed(() => {
  return [...records.value].sort((a, b) => b.savedAt - a.savedAt);
});

// 搜索过滤
const filteredRecords = computed(() => {
  if (!searchQuery.value) return sortedRecords.value;

  const query = searchQuery.value.toLowerCase();
  return sortedRecords.value.filter(r =>
    r.title.toLowerCase().includes(query) ||
    r.url.toLowerCase().includes(query)
  );
});

// 当前页记录
const currentPageRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredRecords.value.slice(start, start + pageSize);
});

// 总页数
const totalPages = computed(() => {
  return Math.ceil(filteredRecords.value.length / pageSize);
});

// 同步按钮文本
const syncButtonText = computed(() => {
  if (isSyncing.value) return '同步中...';
  if (syncMessage.value) return syncMessage.value;
  return '同步';
});

// 手动同步
async function handleSync() {
  isSyncing.value = true;
  syncMessage.value = '';

  try {
    const result = await browser.runtime.sendMessage({
      type: 'SYNC_HISTORY'
    });

    if (result.success) {
      syncMessage.value = '同步成功';
      await loadRecords();  // 重新加载记录
    } else {
      syncMessage.value = '同步失败';
      alert(`同步失败: ${result.error}`);
    }
  } catch (error) {
    syncMessage.value = '同步失败';
    console.error('Sync error:', error);
  } finally {
    isSyncing.value = false;
    setTimeout(() => {
      syncMessage.value = '';
    }, 3000);
  }
}

// 格式化时间
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 加载记录
async function loadRecords() {
  const { saveHistory = [] } = await browser.storage.local.get('saveHistory');
  records.value = saveHistory;
}

onMounted(() => {
  loadRecords();
});
</script>
```

---

## 6. 实施计划

### Phase 1: 核心功能（P0 - 必须实现）

| 序号 | 任务 | 文件 | 预计工作量 |
|------|------|------|----------|
| 1 | 配置结构扩展 | `types/config.ts` | 0.5h |
| 2 | 合并去重逻辑 | `utils/history-sync.ts` | 1h |
| 3 | 同步服务核心 | `utils/history-sync.ts` | 2h |
| 4 | 保存时同步 | `entrypoints/background.ts` | 1h |
| 5 | 启动时同步 | `entrypoints/background.ts` | 0.5h |
| 6 | Options配置UI | `entrypoints/options/App.vue` | 1.5h |
| 7 | 历史记录UI改进 | `entrypoints/saved-records/App.vue` | 2.5h |
| 8 | 手动同步按钮 | `entrypoints/saved-records/App.vue` | 1h |

**总计：10 小时**

### Phase 2: 优化增强（P1 - 可选）

| 序号 | 任务 | 说明 | 预计工作量 |
|------|------|------|----------|
| 1 | 同步进度提示 | 显示"正在同步 123/1000 条记录..." | 1h |
| 2 | 批量同步队列 | 保存时不立即上传，累积10条后批量上传 | 2h |
| 3 | 同步失败重试 | 网络失败时自动重试3次 | 1h |
| 4 | 导出/导入历史 | 允许用户导出为JSON文件备份 | 1.5h |

---

## 7. 测试计划

### 7.1 单元测试

```typescript
// utils/__tests__/history-sync.test.ts

describe('getRecordKey', () => {
  it('should generate unique key from url and savedAt', () => {
    const record = { url: 'https://example.com', savedAt: 100 };
    expect(getRecordKey(record)).toBe('https://example.com_100');
  });
});

describe('mergeRecords', () => {
  it('should remove duplicates with same url and savedAt', () => {
    const records = [
      { url: 'a', savedAt: 100, title: '1' },
      { url: 'a', savedAt: 100, title: '2' },  // 重复
    ];
    const merged = mergeRecords(records);
    expect(merged.length).toBe(1);
  });

  it('should keep records with different savedAt', () => {
    const records = [
      { url: 'a', savedAt: 100, title: '1' },
      { url: 'a', savedAt: 200, title: '2' },  // 不同时间
    ];
    const merged = mergeRecords(records);
    expect(merged.length).toBe(2);
  });
});
```

### 7.2 集成测试

**场景1：保存时自动同步**
1. 配置启用历史同步
2. 保存一篇文章
3. 检查云端 history.json 是否包含新记录

**场景2：启动时自动同步**
1. 设备A保存文章，同步到云端
2. 设备B启动扩展
3. 检查设备B本地是否包含设备A的记录

**场景3：手动同步**
1. 点击"同步"按钮
2. 检查按钮状态变化（同步中 → 同步成功）
3. 检查记录列表是否更新

**场景4：搜索和分页**
1. 创建100条测试记录
2. 搜索"test" → 检查过滤结果
3. 翻页 → 检查分页逻辑

### 7.3 性能测试

**测试数据：**
- 100条记录
- 1000条记录
- 10000条记录

**测试指标：**
- 合并去重时间
- 上传/下载时间
- UI渲染时间
- 内存占用

**预期结果：**
- 1000条记录合并 < 100ms
- 1000条记录上传 < 2s（10Mbps网络）
- 50条记录UI渲染 < 50ms

---

## 8. 风险评估

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|---------|
| 大数据量同步慢（1000+条） | 🟡 中 | 保存后1-2秒延迟 | Phase 2 增加批量同步队列 |
| 两设备同时同步冲突 | 🟢 低 | 后执行的覆盖前一个 | 合并逻辑是幂等的，最坏情况重新同步一次 |
| WebDAV 凭据错误 | 🟢 低 | 同步失败 | 复用现有错误处理，UI显示具体错误 |
| 旧数据兼容性 | 🟢 低 | 无影响 | 运行时计算key，无需迁移 |
| 网络故障导致同步失败 | 🟡 中 | 数据不一致 | Phase 2 增加失败重试机制 |

---

## 9. 向后兼容性

### 9.1 配置兼容

```typescript
// 旧配置（没有 historySync）
{
  "webdav": { ... }
}

// 新配置（添加 historySync）
{
  "webdav": { ... },
  "historySync": {
    "enabled": false,
    "autoSyncOnStartup": true
  }
}
```

**兼容性保证：**
- `historySync?` 是可选字段
- 未设置时默认 `enabled: false`
- 不影响现有功能

### 9.2 数据兼容

```typescript
// 旧数据（没有 id 字段）
{
  "url": "https://example.com",
  "savedAt": 100,
  "title": "Article"
}

// 新数据（运行时计算 id，不存储）
// 数据结构不变！
```

**兼容性保证：**
- 不添加新字段到 HistoryRecord
- 运行时计算 key
- 零数据迁移

---

## 10. 未来优化方向

### 10.1 性能优化

1. **增量同步优化**
   - 维护"待同步队列"
   - 累积10条记录后批量上传
   - 减少网络请求次数

2. **压缩存储**
   - 使用 gzip 压缩 history.json
   - 10000条记录从 5MB 压缩到 1MB

3. **分片存储**
   - 按月份分片：`history-2025-01.json`
   - 减少单文件大小
   - 支持按月加载

### 10.2 功能增强

1. **冲突解决**
   - 检测同步冲突
   - 提供合并预览
   - 允许用户选择保留哪个版本

2. **同步日志**
   - 记录每次同步时间
   - 显示同步历史
   - 方便排查问题

3. **离线支持**
   - 检测网络状态
   - 离线时缓存待同步数据
   - 网络恢复后自动同步

---

## 11. 参考资料

### 11.1 相关文档

- [WebDAV 客户端实现](../utils/webdav-client.ts)
- [历史记录数据结构](../types/history.ts)
- [配置类型定义](../types/config.ts)

### 11.2 外部参考

- [WebDAV RFC 4918](https://datatracker.ietf.org/doc/html/rfc4918)
- [Browser Extension Storage API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage)

---

## 12. 变更记录

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| 1.0.0 | 2025-01-15 | 初始版本 | Claude |

---

**文档状态**: ✅ 设计完成，待评审
**下一步**: 开始实施 Phase 1 任务
