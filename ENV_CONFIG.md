# 环境变量配置说明

## 概述

MD Save 支持通过环境变量文件自动加载默认配置，避免开发时重复设置。**这些配置仅作为默认值，用户可以随时通过设置页面修改覆盖。**

## 环境变量文件

项目支持以下环境变量文件：

- `.env.development` - 开发环境配置（`pnpm dev` 时使用）
- `.env.production` - 生产环境配置（`pnpm build` 时使用）
- `.env.example` - 配置模板文件（供参考，不会被使用）
- `.env.local` - 本地私有配置（优先级最高，不会被提交到 Git）
- `.env.development.local` - 开发环境私有配置
- `.env.production.local` - 生产环境私有配置

## 配置加载优先级

```
用户设置（最高） > .env.*.local > .env.* > DEFAULT_CONFIG（最低）
```

**重要说明**：
1. 如果用户已在设置页面配置过，环境变量**不会**覆盖用户配置
2. 只有在首次加载且无用户配置时，才会应用环境变量
3. 用户可以随时通过设置页面修改配置，不受环境变量限制

## 支持的环境变量

```bash
# WebDAV 服务器配置
VITE_WEBDAV_URL=http://localhost:8080/webdav
VITE_WEBDAV_USERNAME=dev-user
VITE_WEBDAV_PASSWORD=dev-pass
VITE_WEBDAV_PATH=/markdown
VITE_WEBDAV_AUTH_TYPE=basic  # basic | digest

# 文件名模板
VITE_TITLE_TEMPLATE={{title}}_{{date}}

# 内容模板 (使用 \n 表示换行)
VITE_CONTENT_TEMPLATE=---\n原文链接: {{url}}\n---\n\n{{content}}

# 下载目录配置
VITE_DOWNLOAD_DIRECTORY=default  # default | custom
VITE_CUSTOM_DOWNLOAD_PATH=markdown-saves

# 配置同步目录
VITE_CONFIG_SYNC_DIR=/md-save-settings/

# 开发模式标识
VITE_DEV_MODE=true  # true | false
```

## 快速开始

### 1. 开发环境配置

如果你需要自定义开发配置，可以创建 `.env.development.local`：

```bash
# 复制示例文件
cp .env.example .env.development.local

# 编辑配置
vim .env.development.local
```

然后修改为你的开发配置：

```bash
VITE_WEBDAV_URL=http://192.168.1.100:8080/webdav
VITE_WEBDAV_USERNAME=myname
VITE_WEBDAV_PASSWORD=mypassword
```

### 2. 生产环境配置

通常生产环境不需要预配置，让用户自行设置。但如果需要，可以在 `.env.production` 中配置默认模板等。

### 3. 私有配置

对于包含敏感信息的配置（如密码），建议使用 `.local` 后缀的文件：

```bash
# .env.development.local (不会被提交到 Git)
VITE_WEBDAV_PASSWORD=my-secret-password
```

## 使用场景

### 场景 1：团队开发统一配置

团队可以在 `.env.development` 中配置共享的开发服务器地址：

```bash
VITE_WEBDAV_URL=http://dev-server.company.com/webdav
```

每个开发者再用 `.env.development.local` 配置自己的用户名和密码。

### 场景 2：多环境部署

```bash
# .env.development - 开发环境
VITE_WEBDAV_URL=http://localhost:8080/webdav

# .env.production - 生产环境
VITE_WEBDAV_URL=https://webdav.example.com
```

### 场景 3：个人开发便利

创建 `.env.local` 设置你的个人开发配置，避免每次重新设置：

```bash
VITE_WEBDAV_URL=http://192.168.1.100:8080/webdav
VITE_WEBDAV_USERNAME=myname
VITE_WEBDAV_PASSWORD=mypassword
VITE_CUSTOM_DOWNLOAD_PATH=my-notes
```

## 注意事项

1. **安全性**：不要在 `.env.development` 或 `.env.production` 中存储真实密码
2. **私有配置**：敏感信息使用 `.env.*.local` 文件，这些文件会被 Git 忽略
3. **用户优先**：环境变量只是默认值，用户设置始终优先
4. **调试信息**：首次加载环境变量配置时，控制台会输出 🚀 提示信息

## 故障排查

### 环境变量未生效？

1. **检查文件名**：确保文件名是 `.env.development`（开发环境）
2. **检查变量前缀**：所有变量必须以 `VITE_` 开头
3. **重启开发服务器**：运行 `pnpm dev` 重新启动
4. **清除 storage 并重新加载扩展**：
   - Chrome: 打开 `chrome://extensions/` → 找到扩展 → 点击"重新加载"按钮
   - 或者在扩展管理页面点击"清除存储数据"

### 如何查看环境变量是否加载成功？

**方法 1：查看设置页面（推荐）**
- 打开扩展的设置页面
- 在标题下方会显示环境变量初始化状态：
  - ✅ 环境变量配置已自动加载
  - 📋 Storage 中已有用户配置，未使用环境变量
  - ℹ️ 未检测到环境变量配置

**方法 2：查看 background 控制台**
- **Chrome/Edge**: 打开 `chrome://extensions/` → 找到 "MD Save" → 点击 "Service Worker" 蓝色链接
- **Firefox**: 打开 `about:debugging#/runtime/this-firefox` → 找到扩展 → 点击"检查"
- 查看日志输出：
  ```
  [Background] ✓ 环境变量配置已成功写入 storage
  🚀 环境变量配置已自动加载：
  WebDAV 服务器: http://...
  ```

### 如何清除环境变量配置？

**清除已有配置重新应用环境变量：**
1. 打开扩展管理页面（`chrome://extensions/`）
2. 找到 MD Save 扩展
3. 点击"详细信息"
4. 向下滚动找到"存储"部分
5. 点击"清除存储数据"
6. 重新加载扩展（点击刷新图标）

**或者手动清除：**
```javascript
// 在浏览器控制台执行：
browser.storage.local.clear()
```

## 技术实现

环境变量配置通过以下文件实现：

- `utils/env-config.ts` - 环境变量读取和配置应用
- `utils/content-service.ts` - 配置加载逻辑
- `.env.*` - 环境变量文件

详见源码注释。