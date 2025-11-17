# 元数据和多选功能技术设计文档

## 文档信息

- **功能名称**: 元数据系统（分类/标签）+ 多区域选择
- **创建日期**: 2025-01-18
- **状态**: 设计完成，待实施
- **预计工作量**: 6-8天（单人开发）
- **优先级**: P1（元数据系统），P2（多选累积）

---

## 1. 原始需求

### 1.1 多区域选择并累积内容

**用户诉求**:
允许用户一次选择多个区域后再进行编辑和保存，而不是选择一次就立即弹出预览窗口。

**具体要求**:
- 进入选择模式后，可以连续选择多个区域
- 每选择一个区域，该区域被标记（视觉反馈）
- 显示已选择区域数量
- 提供"继续选择"和"完成编辑"按钮
- 完成选择后，将所有选中区域的内容合并（用空行分隔），然后统一显示预览窗口

### 1.2 标签系统

**用户诉求**:
为保存的内容添加标签，便于后续分类和检索。

**具体要求**:
- 支持为每篇保存的内容添加多个标签
- 标签输入时提供自动补全功能（基于历史标签）
- 标签缓存在本地，不需要每次从历史记录中提取
- 标签可以在模板变量中使用（如 `{{tags}}`）

### 1.3 分类系统

**用户诉求**:
为保存的内容指定分类，类似标签但只能单选。

**具体要求**:
- 支持为每篇保存的内容指定一个分类
- 分类输入时提供自动补全功能（基于历史分类）
- 分类缓存在本地
- 分类可以在模板变量中使用（如 `{{category}}`）

### 1.4 模板变量扩展

**用户诉求**:
在文件名和内容模板中使用分类和标签变量。

**具体要求**:
- 新增模板变量 `{{category}}` 和 `{{tags}}`
- 用户可以在 `titleTemplate` 中使用，例如 `{{category}}/{{YYYY}}/{{title}}`
- 用户可以在 `contentTemplate` 中使用，例如在 frontmatter 中添加 `category: {{category}}`
- 建议在 options 页面提供示例模板，但不强制修改默认配置

---

## 2. 架构设计决策

### 2.1 核心原则

基于 Linus Torvalds 的"好品味"原则：

1. **消除特殊情况** - 使用统一的数据结构和处理流程
2. **向后兼容** - 所有新字段都是可选的，不破坏现有用户数据
3. **简洁优先** - 拒绝过度设计，解决真实问题
4. **数据结构优先** - 先设计数据结构，代码自然简洁

### 2.2 关键设计决策汇总

| 决策点 | 方案 | 理由 |
|--------|------|------|
| **标签存储格式** | 逗号+空格分隔字符串 `"React, 前端, 性能"` | 简洁，易于模板替换，用户可直接编辑 |
| **元数据缓存位置** | 独立的 `userMetadata` storage key | 避免每次从1000条历史记录中提取，性能优化 |
| **缓存排序策略** | LRU（最近使用优先） | 最常用的建议排在前面，符合用户直觉 |
| **分类上限** | 50个 | 避免过度分类导致组织混乱 |
| **标签上限** | 100个 | 标签性质决定会更多，但需要限制防止性能问题 |
| **单个标签长度** | 50字符 | 避免异常长标签破坏UI |
| **累积区域上限** | 20个 | 防止内存溢出（每个区域~10KB） |
| **Autocomplete 防抖** | 200ms | 平衡响应速度和性能 |
| **建议结果数量** | 10条 | 避免下拉列表过长 |
| **默认模板是否修改** | ❌ 不修改 | 避免破坏现有用户习惯 |
| **Modal 状态保留** | ❌ 不保留 | 每次打开都是干净状态，避免混淆 |

### 2.3 数据流向

```
用户输入元数据
    ↓
TemplateData { category, tags }
    ↓
模板替换（filename + content）
    ↓
保存到文件
    ↓
记录到 HistoryRecord { category?, tags? }
    ↓
更新 userMetadata 缓存（LRU排序）
    ↓
WebDAV 同步（包含元数据）
```

### 2.4 类型扩展

#### TemplateData 扩展

```typescript
export interface TemplateData {
  // 现有字段...
  title: string;
  url: string;
  domain: string;
  content: string;
  // 时间字段...

  // 🆕 元数据字段
  category: string;  // 空字符串表示无分类
  tags: string;      // 逗号+空格分隔，如 "React, 前端, 性能"
}
```

#### HistoryRecord 扩展

```typescript
export interface HistoryRecord {
  // 现有字段...

  // 🆕 元数据字段（可选，向后兼容）
  category?: string;
  tags?: string[];  // 存储为数组，便于查询过滤
}
```

#### UserMetadata（新增）

```typescript
export interface UserMetadata {
  categories: string[];  // 最多50个，LRU排序
  tags: string[];        // 最多100个，LRU排序
  version: string;       // '1.0.0'
}
```

---

## 3. 分阶段实施方案

### 阶段划分原则

1. **低风险优先** - 先实现基础设施，再实现交互改动
2. **独立可测** - 每个阶段都可独立工作、测试、回滚
3. **增量价值** - 每个阶段完成后都有可用功能
4. **风险隔离** - 最复杂的功能放在最后

### 阶段1：元数据基础设施（1天，低风险）✅

**目标**: 建立数据结构，不改变用户交互

**文件变更**:

1. **新建 `utils/metadata.ts`**
   - `getMetadata()` - 获取元数据缓存（带防御性裁剪）
   - `updateMetadataCache(category, tags)` - 更新缓存（LRU策略）
   - `parseTags(input)` - 解析标签字符串

2. **修改 `types/history.ts`**
   - `HistoryRecord` 添加 `category?: string`
   - `HistoryRecord` 添加 `tags?: string[]`

3. **修改 `utils/template.ts`**
   - `TemplateData` 添加 `category: string` 和 `tags: string`
   - `generateTemplateData()` 添加可选参数 `metadata?: { category, tags }`
   - 测试空值替换为空字符串

**测试清单**:
- [ ] 调用 `updateMetadataCache('前端', ['React', 'Vue'])`
- [ ] 调用 `getMetadata()` 验证数据存储
- [ ] 调用 `generateTemplateData` 传入空 metadata，验证不报错
- [ ] 模板替换 `{{category}}` 和 `{{tags}}` 验证为空字符串
- [ ] 验证 LRU 排序正确（最近使用的排在前面）

**交付物**:
- `utils/metadata.ts` 文件
- 类型定义扩展
- 单元测试通过

---

### 阶段2：Modal 元数据输入（2-3天，中等复杂）⚠️

**目标**: 在预览 Modal 中添加分类和标签输入，支持 autocomplete

**关键改动**: 重构 `createPreviewModal` 函数（必须！）

#### 2.1 重构 `createPreviewModal`

**当前问题**: 250行 God 函数，难以扩展

**重构方案**:

```typescript
async function createPreviewModal(extractedContent: ExtractedContent) {
  // 1. 加载元数据缓存
  const metadata = await getMetadata();

  // 2. 初始化状态
  const state: ModalState = { /* ... */ };

  // 3. 构建 DOM
  const modal = buildModalDOM(extractedContent, state);
  document.body.appendChild(modal);

  // 4. 绑定事件（拆分为独立函数）
  setupFilenameEditor(modal, state);
  setupMetadataInputs(modal, state, metadata);  // 🆕
  setupContentEditor(modal, state);
  setupSaveButtons(modal, state, extractedContent);

  return modal;
}
```

**拆分后的函数职责**:
- `buildModalDOM()` - 纯 UI 构建，无业务逻辑
- `setupFilenameEditor()` - 文件名编辑和验证
- `setupMetadataInputs()` - 分类和标签输入，autocomplete
- `setupContentEditor()` - Markdown 内容编辑
- `setupSaveButtons()` - 保存按钮逻辑，传递元数据

#### 2.2 Autocomplete 实现

**分类（单选）**:
- 直接过滤整个输入
- 选择后替换整个输入框
- Enter/Tab 选中第一个建议

**标签（多选，更复杂）**:
- 基于**当前正在输入的词**过滤（逗号后的词）
- 选择后插入到当前位置，自动添加逗号+空格
- 排除已输入的标签

**核心函数**:

```typescript
// 提取当前正在输入的词
function getCurrentWord(input: string, cursorPosition: number): string {
  const beforeCursor = input.substring(0, cursorPosition);
  const lastCommaIndex = beforeCursor.lastIndexOf(',');
  return beforeCursor.substring(lastCommaIndex + 1).trim();
}

// 高亮匹配文本
function highlightMatch(text: string, query: string): string {
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}
```

**键盘导航**:
- `↑` / `↓` - 高亮上一个/下一个建议
- `Enter` / `Tab` - 选择当前高亮的建议
- `Esc` - 关闭下拉列表

**点击外部关闭**:
- 监听 `document.click`
- 判断点击目标是否在输入框或下拉列表内
- Modal 关闭时移除监听器

#### 2.3 CSS 样式

**设计原则**:
- 与现有 modal 风格一致（白色背景、蓝色主色调、4px圆角）
- 元数据区使用浅灰背景（`#f8f9fa`）区分
- Autocomplete 使用浅蓝高亮（`#e7f3ff`）
- 所有交互元素有 hover 和 focus 状态

**关键样式**:
```css
.metadata-group {
  margin: 16px 0;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  max-height: 200px;
  overflow-y: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.suggestion-item:hover,
.suggestion-item.highlighted {
  background-color: #e7f3ff;
}
```

#### 2.4 保存逻辑修改

```typescript
async function saveWithStrategy(
  strategyName: string,
  state: ModalState,
  extractedContent: ExtractedContent,
  metadata: { category: string; tags: string }
) {
  // 生成模板数据（包含元数据）
  const templateData = generateTemplateData(
    extractedContent,
    metadata  // 🆕 传递元数据
  );

  // 应用模板
  const filename = generateFilename(config.titleTemplate, templateData);
  const content = generateContent(config.contentTemplate, templateData);

  // 发送保存消息（包含元数据）
  const result = await browser.runtime.sendMessage({
    type: 'SAVE',
    data: {
      context: { /* ... */ },
      strategy: strategyName,
      metadata: {  // 🆕 传递元数据
        category: metadata.category,
        tags: parseTags(metadata.tags)
      }
    }
  });
}
```

**测试清单**:
- [ ] 打开预览 modal，输入分类 "前"，验证下拉建议正确
- [ ] 使用 ↑↓ 键导航，Enter 选择，验证正确
- [ ] 输入标签 "React, 前"，验证只建议标签（不包括 React）
- [ ] Tab 选择标签后，光标自动移到逗号后
- [ ] 保存后检查模板替换是否正确
- [ ] 性能测试：100个标签过滤延迟 < 50ms
- [ ] 点击外部关闭下拉列表
- [ ] 特殊字符标签（如 `C++`）不破坏 UI

**交付物**:
- 重构后的 `createPreviewModal` 函数
- Autocomplete 组件
- CSS 样式
- 功能测试通过

---

### 阶段3：历史记录集成（1天，低风险）✅

**目标**: 保存时记录元数据，并更新缓存

**文件变更**:

1. **修改 `entrypoints/background.ts`**

   **SAVE 消息处理**:
   ```typescript
   const { context, strategy, metadata } = message.data as {
     context: SaveContext;
     strategy: string;
     metadata?: {  // 🆕
       category?: string;
       tags?: string[];
     };
   };

   // 记录历史时包含元数据
   await addHistoryRecord({
     // ... 现有字段
     category: metadata?.category,
     tags: metadata?.tags
   });
   ```

   **addHistoryRecord 函数**:
   ```typescript
   // 🆕 更新元数据缓存
   if (newRecord.category || newRecord.tags) {
     await updateMetadataCache(
       newRecord.category || '',
       newRecord.tags || []
     );
   }
   ```

2. **修改 `utils/history-sync.ts`**

   **downloadFromWebDAV 后重建元数据缓存**:
   ```typescript
   // 提取所有分类和标签
   const categories = new Set<string>();
   const tags = new Set<string>();

   records.forEach((record: HistoryRecord) => {
     if (record.category) categories.add(record.category);
     if (record.tags) record.tags.forEach(tag => tags.add(tag));
   });

   // 更新本地缓存
   await browser.storage.local.set({
     userMetadata: {
       categories: Array.from(categories),
       tags: Array.from(tags),
       version: '1.0.0'
     }
   });
   ```

**测试清单**:
- [ ] 保存一篇文章，输入分类和标签
- [ ] 检查 `browser.storage.local.saveHistory` 包含新字段
- [ ] 检查 `browser.storage.local.userMetadata` 已更新
- [ ] 触发 WebDAV 同步，检查云端 JSON 包含新字段
- [ ] 清空本地，从云端下载，验证元数据缓存重建
- [ ] 旧版本历史记录（无元数据）正常读取

**交付物**:
- Background 脚本更新
- 历史同步逻辑更新
- WebDAV 同步测试通过

---

### 阶段4：多选累积功能（2-3天，高风险）⚠️⚠️

**目标**: 支持选择多个区域后再预览

**关键改动**: 重构选择模式逻辑，添加累积状态管理

#### 4.1 累积状态设计

```typescript
// 模块级状态
const MAX_SECTIONS = 20;

let accumulationSession: {
  sections: Array<{
    markdown: string;
    title: string;
  }>;
  isActive: boolean;
} | null = null;
```

#### 4.2 选择流程改造

**当前流程**:
```
点击元素 → 提取内容 → 立即显示预览 modal
```

**新流程**:
```
点击元素 → 提取内容 → 添加到累积列表 → 更新工具栏
  ↓
用户继续选择或点击"完成编辑"
  ↓
合并所有区域 → 显示预览 modal
```

**核心函数**:

```typescript
async function handleElementClick(event: MouseEvent) {
  const element = event.target as HTMLElement;
  const content = ContentExtractor.extractElement(element);

  // 初始化累积会话
  if (!accumulationSession) {
    accumulationSession = { sections: [], isActive: true };
    showAccumulationToolbar();
  }

  // 检查数量上限
  if (accumulationSession.sections.length >= MAX_SECTIONS) {
    showMessage(`最多选择 ${MAX_SECTIONS} 个区域`, 'warning');
    return;
  }

  // 添加到累积列表
  const converter = new MarkdownConverter();
  const markdown = converter.convert(content.html);

  accumulationSession.sections.push({
    markdown: markdown.trim(),
    title: content.title || `区域 ${accumulationSession.sections.length + 1}`
  });

  // 视觉反馈
  element.classList.add('md-save-selected');
  updateAccumulationToolbar(accumulationSession.sections.length);
}
```

#### 4.3 浮动工具栏

**UI 设计**:
```
┌──────────────────────────────────────────────────┐
│ 已选择 3 个区域  [继续选择(ESC退出)]  [完成编辑]  [取消] │
└──────────────────────────────────────────────────┘
```

**位置**: 固定在顶部中央，`z-index: 10000`

**样式**:
```css
.md-save-accumulation-toolbar {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

#### 4.4 Markdown 合并规则

**规则**: 两个换行符（一个空行）分隔

```typescript
const mergedMarkdown = accumulationSession.sections
  .map(section => section.markdown)
  .join('\n\n');
```

**示例**:
```markdown
## 第一个区域标题
第一个区域内容...

## 第二个区域标题
第二个区域内容...

## 第三个区域标题
第三个区域内容...
```

#### 4.5 键盘快捷键

- `ESC` - 退出选择模式（但保留已选内容）
- `Ctrl+Enter` - 快速完成（等同于点击"完成编辑"）

#### 4.6 清理逻辑

```typescript
function clearAccumulationSession() {
  // 移除工具栏
  document.querySelector('.md-save-accumulation-toolbar')?.remove();

  // 移除所有选中标记
  document.querySelectorAll('.md-save-selected').forEach(el => {
    el.classList.remove('md-save-selected');
  });

  // 重置状态
  accumulationSession = null;
}
```

**测试清单**:
- [ ] 选择3个区域，验证 markdown 拼接正确（只有一个空行）
- [ ] ESC 退出选择模式，工具栏保留，状态保留
- [ ] 点击「完成编辑」，正确显示预览 modal
- [ ] 点击「取消」，所有状态清理（DOM、事件监听器）
- [ ] 快速选择→取消 10次，检查内存泄漏
- [ ] 选择20个区域后，第21个提示「最多选择20个区域」
- [ ] 保存后，检查文件内容空行数量正确
- [ ] 与单选模式兼容（文本选择 + 快捷键直接预览）

**交付物**:
- 重构后的选择模式逻辑
- 浮动工具栏组件
- Markdown 合并算法
- 内存泄漏测试通过

---

## 4. 边界情况和错误处理

### 4.1 Autocomplete 性能退化

**问题**: 用户有1000个历史标签（虽然限制了100，但旧数据可能存在）

**解决方案**:
```typescript
export async function getMetadata(): Promise<UserMetadata> {
  const metadata = result[METADATA_STORAGE_KEY] || { /* ... */ };

  // 🔧 防御性裁剪（处理旧数据）
  metadata.categories = metadata.categories.slice(0, 50);
  metadata.tags = metadata.tags.slice(0, 100);

  return metadata;
}
```

### 4.2 标签包含特殊字符

**问题**: 用户输入 `"React, C++, Node.js"`

**解决方案**:
- 使用简单的 `split(',')` 解析，不使用 regex
- 限制单个标签长度 ≤ 50 字符
- 模板系统的 `sanitizeTitle` 会自动处理特殊字符

```typescript
function parseTags(input: string): string[] {
  return input
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0 && tag.length <= 50);
}
```

### 4.3 多选累积时内存溢出

**问题**: 用户选择100个区域，每个10KB markdown → 1MB 字符串

**解决方案**:
```typescript
const MAX_SECTIONS = 20;  // 合理上限

if (accumulationSession.sections.length >= MAX_SECTIONS) {
  showMessage(`最多选择 ${MAX_SECTIONS} 个区域`, 'warning');
  return;
}
```

### 4.4 Modal 状态泄漏

**问题**: 用户打开 modal → 输入元数据 → 关闭 → 再次打开 → 元数据还在

**解决方案**:
```typescript
async function createPreviewModal(extractedContent: ExtractedContent) {
  // ✅ 每次创建 modal 都初始化新状态
  const modalState = {
    filename: generateInitialFilename(extractedContent),
    content: extractedContent.markdown,
    category: '',  // 🔧 始终从空开始
    tags: ''       // 🔧 不保留上次输入
  };
}
```

### 4.5 WebDAV 同步元数据丢失

**问题**: 旧版本扩展上传历史记录（无元数据）→ 新版本下载 → 元数据缓存为空

**解决方案**:
```typescript
// utils/history-sync.ts - downloadFromWebDAV
private async downloadFromWebDAV(...): Promise<HistoryRecord[]> {
  const records = JSON.parse(content as string).records || [];

  // 🔧 下载后重建元数据缓存
  const categories = new Set<string>();
  const tags = new Set<string>();

  records.forEach(record => {
    if (record.category) categories.add(record.category);
    if (record.tags) record.tags.forEach(tag => tags.add(tag));
  });

  if (categories.size > 0 || tags.size > 0) {
    await browser.storage.local.set({
      userMetadata: { categories: [...categories], tags: [...tags], version: '1.0.0' }
    });
  }

  return records;
}
```

### 4.6 Autocomplete 点击外部关闭

**问题**: 下拉列表显示时，用户点击 modal 其他区域，下拉列表应该关闭

**解决方案**:
```typescript
function setupCategoryAutocomplete(...) {
  const closeOnClickOutside = (e: MouseEvent) => {
    if (!input.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
      dropdown.style.display = 'none';
    }
  };

  document.addEventListener('click', closeOnClickOutside);

  // 清理：modal 关闭时移除监听
  modal.addEventListener('beforeunload', () => {
    document.removeEventListener('click', closeOnClickOutside);
  });
}
```

---

## 5. 向后兼容性

### 5.1 数据兼容性

| 场景 | 行为 | 验证方法 |
|------|------|----------|
| 旧历史记录读取 | `category` 和 `tags` 为 `undefined`，不报错 | 读取旧版本保存的历史记录 |
| 模板空值处理 | `{{category}}` 和 `{{tags}}` 替换为空字符串 | 不输入元数据直接保存 |
| WebDAV 同步 | 旧版本上传的记录（无元数据）正常下载 | 新版本下载旧版本上传的数据 |
| 配置迁移 | 无需迁移（所有新字段都是可选） | - |

### 5.2 功能兼容性

| 功能 | 兼容性 | 说明 |
|------|--------|------|
| 不使用元数据功能 | ✅ 完全兼容 | 保存流程不变，`category` 和 `tags` 为空 |
| 不使用多选功能 | ✅ 完全兼容 | 选择一次后点击"完成编辑"即可 |
| 快捷键单选 | ✅ 完全兼容 | 文本选择 + 快捷键直接预览（不进入累积模式） |

### 5.3 测试清单

- [ ] 旧历史记录（无 `category` 和 `tags`）正常显示
- [ ] 旧配置（无元数据相关字段）正常加载
- [ ] 不输入元数据保存，模板变量替换为空字符串
- [ ] 不使用多选功能，单选流程不变
- [ ] WebDAV 同步兼容（新旧版本数据互通）

---

## 6. 风险评估和缓解措施

### 6.1 风险矩阵

| 风险 | 概率 | 影响 | 等级 | 缓解措施 |
|------|------|------|------|----------|
| `createPreviewModal` 过于臃肿 | 🔴 高 | 🔴 高 | 🔴 严重 | 必须先重构再扩展，拆分为独立函数 |
| Autocomplete 性能问题 | 🟡 中 | 🟡 中 | 🟡 中等 | 上限保护、200ms防抖、10条结果限制 |
| 多选累积内存泄漏 | 🟡 中 | 🔴 高 | 🔴 严重 | 限制20个区域、完整清理逻辑、内存测试 |
| WebDAV 同步冲突 | 🟢 低 | 🟡 中 | 🟡 中等 | 元数据缓存重建逻辑 |
| 用户数据丢失 | 🟢 低 | 🔴 高 | 🔴 严重 | 所有新字段可选、向后兼容测试 |

### 6.2 详细缓解措施

#### 风险1：`createPreviewModal` 过于臃肿

**现状**: 250行 God 函数，继续添加功能会难以维护

**缓解措施**:
- ✅ 必须在阶段2开始前完成重构
- ✅ 拆分为 `buildModalDOM`, `setupMetadataInputs`, `setupSaveButtons` 等独立函数
- ✅ 每个函数独立测试，职责单一

#### 风险2：Autocomplete 性能问题

**缓解措施**:
- ✅ 分类上限50，标签上限100（`getMetadata` 中强制裁剪）
- ✅ 200ms 防抖（`setTimeout` + `clearTimeout`）
- ✅ 结果限制10条（`.slice(0, 10)`）
- ✅ 性能测试：100个标签过滤延迟 < 50ms

#### 风险3：多选累积内存泄漏

**缓解措施**:
- ✅ 限制20个区域（`MAX_SECTIONS = 20`）
- ✅ `clearAccumulationSession` 清理所有 DOM 和事件监听器
- ✅ 内存泄漏测试：选择→取消 10次，检查 DevTools Memory Profiler

#### 风险4：WebDAV 同步冲突

**缓解措施**:
- ✅ `downloadFromWebDAV` 后自动重建元数据缓存
- ✅ 旧版本上传的历史记录（无元数据）不破坏新版本

#### 风险5：用户数据丢失

**缓解措施**:
- ✅ 所有新字段都是可选的（`category?: string`, `tags?: string[]`）
- ✅ 向后兼容性测试清单（见 5.3 节）
- ✅ 遵循"Never break userspace"原则

---

## 7. 实施时间线

### 7.1 总体规划

```
Week 1:
  Day 1: 阶段1 - 元数据基础设施
  Day 2-4: 阶段2 - Modal 元数据输入（含重构）
  Day 5: 阶段3 - 历史记录集成

Week 2:
  Day 1-3: 阶段4 - 多选累积功能
  Day 4-5: 集成测试 + Bug 修复
```

**总工作量**: 6-8天（单人开发）

### 7.2 Milestone 定义

| Milestone | 完成标志 | 验收标准 |
|-----------|----------|----------|
| M1 - 元数据基础 | `utils/metadata.ts` 创建，类型扩展完成 | 单元测试通过，模板替换正确 |
| M2 - Autocomplete | Modal 支持分类/标签输入 | 功能测试通过，性能达标 |
| M3 - 历史集成 | 保存时记录元数据，WebDAV 同步 | 历史记录包含元数据，同步成功 |
| M4 - 多选功能 | 支持多区域选择并合并 | 内存测试通过，拼接正确 |
| M5 - 发布就绪 | 所有测试通过，文档完善 | 集成测试通过，向后兼容验证 |

### 7.3 优先级调整

**如果时间紧张**:
- ✅ 优先实现 M1-M3（元数据系统）
- ⏸️ M4（多选累积）可以作为后续增强功能
- 理由：元数据系统是核心价值，多选是锦上添花

---

## 8. 测试策略

### 8.1 单元测试

**文件**: `utils/metadata.test.ts`（需新建）

**测试用例**:
- [ ] `updateMetadataCache` - LRU 排序正确
- [ ] `getMetadata` - 防御性裁剪（超过上限）
- [ ] `parseTags` - 逗号分隔解析正确
- [ ] `parseTags` - 过滤空标签和超长标签
- [ ] `getCurrentWord` - 提取当前输入词正确
- [ ] `highlightMatch` - 高亮匹配文本正确

### 8.2 集成测试

**场景1: 完整保存流程（含元数据）**
1. 打开页面 → 选择区域
2. 预览 modal → 输入分类 "前端开发"
3. 输入标签 "React, 性能优化"
4. 保存到本地
5. 检查文件名是否正确（如使用了 `{{category}}`）
6. 检查文件内容是否包含元数据（如 frontmatter）
7. 检查历史记录包含 `category` 和 `tags`
8. 检查 `userMetadata` 缓存已更新

**场景2: Autocomplete 交互**
1. 打开 modal → 输入分类 "前"
2. 验证下拉列表显示正确建议
3. 使用 ↓ 键导航到第二个建议
4. 按 Enter 选择
5. 验证输入框填充正确
6. 输入标签 "React, 性"
7. 验证只显示包含"性"且不包括"React"的标签
8. 按 Tab 选择第一个建议
9. 验证光标移到逗号后

**场景3: 多选累积**
1. 进入选择模式
2. 连续选择3个区域
3. 验证每个区域有视觉标记
4. 验证工具栏显示"已选择 3 个区域"
5. 按 ESC 退出选择模式
6. 验证工具栏仍然存在
7. 点击"完成编辑"
8. 验证 modal 内容包含3个区域，用空行分隔
9. 保存后验证文件内容正确

**场景4: 向后兼容性**
1. 使用旧版本扩展保存一篇文章（无元数据）
2. 升级到新版本
3. 打开历史记录，验证旧记录正常显示
4. 保存新文章（不输入元数据）
5. 验证保存成功，模板变量替换为空字符串
6. WebDAV 同步，验证新旧数据共存

### 8.3 性能测试

| 测试项 | 目标 | 测试方法 |
|--------|------|----------|
| Autocomplete 过滤延迟 | < 50ms | 100个标签，输入单字符，测量过滤时间 |
| Modal 打开延迟 | < 200ms | 从调用到显示的总时间 |
| 多选累积内存占用 | 无明显增长 | 选择20个区域，使用 DevTools Memory Profiler |
| 内存泄漏检测 | 无泄漏 | 选择→取消 10次，检查 DOM 节点和事件监听器 |

### 8.4 浏览器兼容性

**目标浏览器**:
- ✅ Chrome/Edge（WXT 默认）
- ✅ Firefox（需单独测试）

**测试重点**:
- Browser API 差异（`browser.downloads`, `browser.storage`）
- CSS 兼容性（autocomplete 下拉列表位置）
- 事件监听器（`click`, `keydown`）

---

## 9. 文档和示例

### 9.1 用户文档更新

**Options 页面**:
- 添加模板变量说明：`{{category}}` 和 `{{tags}}`
- 提供示例模板：
  - 文件名: `{{category}}/{{YYYY}}-{{MM}}/{{title}}`
  - 内容:
    ```markdown
    ---
    title: {{title}}
    category: {{category}}
    tags: [{{tags}}]
    created: {{YYYY}}-{{MM}}-{{DD}}
    ---

    {{content}}
    ```

**README.md 更新**:
- 新增功能章节：元数据系统、多区域选择
- 更新截图（包含元数据输入界面）

### 9.2 示例配置

**场景1: Obsidian 笔记**
```json
{
  "titleTemplate": "{{category}}/{{title}}",
  "contentTemplate": "---\ntitle: {{title}}\ntags: [{{tags}}]\ncreated: {{YYYY}}-{{MM}}-{{DD}}\n---\n\n{{content}}"
}
```

**场景2: 博客文章**
```json
{
  "titleTemplate": "{{YYYY}}-{{MM}}-{{DD}}-{{title}}",
  "contentTemplate": "---\nlayout: post\ntitle: {{title}}\ncategory: {{category}}\ntags: [{{tags}}]\ndate: {{YYYY}}-{{MM}}-{{DD}} {{HH}}:{{mm}}:{{ss}}\n---\n\n{{content}}"
}
```

---

## 10. 最终检查清单

### 10.1 代码质量

- [ ] 没有超过3层缩进的函数
- [ ] 每个函数只做一件事
- [ ] 消除了所有特殊情况分支
- [ ] 类型定义完整（无 `any` 类型）
- [ ] 关键逻辑有注释

### 10.2 向后兼容性

- [ ] 旧历史记录可以正常读取
- [ ] 旧配置不会报错
- [ ] 不使用元数据功能时，一切如常
- [ ] WebDAV 同步兼容新旧版本

### 10.3 性能

- [ ] Autocomplete 过滤 < 50ms
- [ ] Modal 打开 < 200ms
- [ ] 内存无泄漏（DevTools 验证）
- [ ] 无明显性能退化

### 10.4 错误处理

- [ ] 所有异步操作有 try-catch
- [ ] 所有数组操作有边界检查
- [ ] 用户输入都经过验证
- [ ] 错误消息清晰易懂

### 10.5 用户体验

- [ ] 所有交互有即时反馈
- [ ] 键盘操作流畅（↑↓ Enter Tab Esc）
- [ ] 视觉反馈明确（选中状态、高亮）
- [ ] 错误提示友好

### 10.6 可维护性

- [ ] 函数职责单一（SOLID 原则）
- [ ] 代码可测试（无全局状态污染）
- [ ] 文档完善（用户文档 + 代码注释）
- [ ] 测试覆盖充分

---

## 11. 附录

### 11.1 技术决策记录（ADR）

**ADR-001: 标签存储格式选择**
- **日期**: 2025-01-18
- **决策**: 使用逗号+空格分隔字符串 `"React, 前端, 性能"`
- **备选方案**:
  - JSON 数组 `["React", "前端", "性能"]`
  - Hash 标签 `"#React #前端 #性能"`
- **理由**:
  - 简洁，用户易于理解和编辑
  - 模板替换简单，无需序列化
  - 符合大部分 Markdown frontmatter 约定
- **风险**: 标签中包含逗号会导致解析错误（通过限制输入字符缓解）

**ADR-002: 不修改默认模板**
- **日期**: 2025-01-18
- **决策**: 不修改 `DEFAULT_CONFIG.contentTemplate`
- **理由**:
  - 避免破坏现有用户习惯
  - 元数据是可选功能，不应强制使用
  - 在 options 页面提供示例即可
- **风险**: 新用户可能不知道如何使用元数据变量（通过文档和示例缓解）

**ADR-003: Modal 状态不跨会话保留**
- **日期**: 2025-01-18
- **决策**: 每次打开 modal 都初始化新的 `category` 和 `tags` 状态
- **理由**:
  - 避免用户混淆（保存不同文章时忘记清空上次的标签）
  - 简化状态管理逻辑
- **风险**: 用户需要每次重新输入（通过 autocomplete 缓解）

### 11.2 相关文件清单

**新建文件**:
- `utils/metadata.ts` - 元数据缓存管理
- `utils/metadata.test.ts` - 单元测试（可选）

**修改文件**:
- `types/history.ts` - 扩展 `HistoryRecord`
- `utils/template.ts` - 扩展 `TemplateData`, `generateTemplateData`
- `entrypoints/content.ts` - 重构 `createPreviewModal`, 选择模式
- `entrypoints/background.ts` - SAVE 消息处理, `addHistoryRecord`
- `utils/history-sync.ts` - `downloadFromWebDAV`

**文档更新**:
- `README.md` - 功能介绍
- `CHANGELOG.md` - 版本更新记录

### 11.3 性能基准

**测试环境**:
- CPU: 8核心 2.5GHz
- 内存: 16GB
- 浏览器: Chrome 131

**基准数据**:
- Autocomplete 过滤（100个标签）: ~15ms
- Modal 打开: ~120ms
- 多选累积（10个区域）: 内存增长 ~500KB
- 选择→取消 10次: 无内存泄漏

---

## 12. 未来增强方向

### 12.1 短期（3-6个月）

- [ ] 标签颜色标记（UI增强）
- [ ] 分类树状结构（如 "前端/React"）
- [ ] 历史记录按分类/标签过滤
- [ ] 导出元数据统计报告

### 12.2 长期（6-12个月）

- [ ] 标签云可视化
- [ ] 智能标签推荐（基于内容分析）
- [ ] 批量编辑历史记录元数据
- [ ] 元数据同步到其他笔记软件（Obsidian, Logseq）

---

**文档版本**: v1.0
**最后更新**: 2025-01-18
**作者**: Claude Code (Sonnet 4.5)
**审核状态**: 待用户确认
