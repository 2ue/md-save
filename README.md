# MD Save

<div align="center">
  <img src="public/icon/128.png" alt="MD Save Logo" width="128" height="128">

  **一个简单易用的浏览器扩展，将网页内容转换为 Markdown 并保存到本地或 WebDAV 云端**

  [![Release](https://img.shields.io/github/v/release/2ue/md-save)](https://github.com/2ue/md-save/releases)
  [![License](https://img.shields.io/github/license/2ue/md-save)](LICENSE)
  [![Build Status](https://github.com/2ue/md-save/actions/workflows/release.yml/badge.svg)](https://github.com/2ue/md-save/actions)
</div>

---

## ✨ 特性

- 🎯 **灵活选择** - 支持选择区域保存或保存整个页面
- 📝 **Markdown 转换** - 使用 Turndown 引擎，支持 GitHub Flavored Markdown
- 💾 **多种保存方式** - 本地下载或 WebDAV 云端同步
- 🎨 **可定制模板** - 自定义文件名和内容格式
- 📜 **历史记录** - 完整的保存历史，随时查看和管理
- 🔄 **文件冲突处理** - 智能检测重复文件，提供覆盖/重命名选项
- 🌐 **跨浏览器** - 支持 Chrome、Edge 和 Firefox

## 📸 截图

### 弹出窗口
快速启动保存功能，查看当前页面信息

### 选择模式
点击选择页面中的任意元素进行保存

### 预览界面
保存前预览处理后的 Markdown 内容

### 历史记录
查看和管理所有保存的内容

## 🚀 安装

### 从 Release 安装

1. 前往 [Releases 页面](https://github.com/2ue/md-save/releases)
2. 下载对应浏览器的 zip 文件
   - Chrome/Edge: `md-save-chrome.zip`
   - Firefox: `md-save-firefox.zip`

#### Chrome/Edge 安装步骤
1. 解压下载的 zip 文件
2. 打开浏览器扩展页面
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择解压后的文件夹

#### Firefox 安装步骤
1. 打开 Firefox 附加组件页面 (`about:addons`)
2. 点击齿轮图标 → "从文件安装附加组件"
3. 选择下载的 zip 文件

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/2ue/md-save.git
cd md-save

# 安装依赖
pnpm install

# 开发模式（Chrome）
pnpm dev

# 开发模式（Firefox）
pnpm dev:firefox

# 构建扩展
pnpm build          # Chrome
pnpm build:firefox  # Firefox

# 打包为 zip
pnpm zip            # Chrome
pnpm zip:firefox    # Firefox
```

## 📖 使用方法

### 1. 基本操作

#### 保存整个页面
1. 点击浏览器工具栏上的 MD Save 图标
2. 选择"保存整个页面"
3. 预览转换后的 Markdown 内容
4. 选择保存位置（本地或 WebDAV）

#### 选择区域保存
1. 点击浏览器工具栏上的 MD Save 图标
2. 选择"选择区域保存"
3. 在页面上点击要保存的元素（会高亮显示）
4. 预览并保存

### 2. 配置 WebDAV（可选）

如果需要将内容保存到云端，可以配置 WebDAV：

1. 点击 MD Save 图标 → 设置
2. 填写 WebDAV 配置：
   - **服务器地址**: WebDAV 服务器 URL（如 `https://dav.example.com`）
   - **用户名**: WebDAV 账户用户名
   - **密码**: WebDAV 账户密码（或应用专用密码）
   - **保存路径**: 可选，自定义保存目录（如 `/markdown/`）
   - **认证类型**: Basic 或 Digest（通常选择 Basic）
3. 点击"测试连接"验证配置
4. 保存设置

**支持的 WebDAV 服务**：
- 坚果云
- Nextcloud
- ownCloud
- Synology NAS
- 其他标准 WebDAV 服务

### 3. 自定义模板

在设置页面可以自定义文件名和内容格式：

#### 文件名模板
```
{{YYYY}}/{{MM}}/{{title}}
```

#### 内容模板
```
---
title: {{title}}
url: {{url}}
date: {{date}} {{time}}
---

{{content}}
```

**可用变量**（基于 [dayjs](https://day.js.org/)）：

**基础变量**:
- `{{title}}` - 页面标题
- `{{url}}` - 页面 URL
- `{{domain}}` - 域名
- `{{content}}` - Markdown 内容

**时间变量**:
- 年月日: `{{YYYY}}`, `{{YY}}`, `{{MM}}`, `{{M}}`, `{{DD}}`, `{{D}}`
- 时分秒: `{{HH}}`, `{{H}}`, `{{hh}}`, `{{h}}`, `{{mm}}`, `{{m}}`, `{{ss}}`, `{{s}}`
- 星期: `{{d}}` (0-6), `{{dd}}` (Su), `{{ddd}}` (Sun)
- 组合（向后兼容）: `{{date}}` (YYYY-MM-DD), `{{time}}` (HH:mm:ss)

**示例**:
```
{{YYYY}}/{{MM}}/{{title}}           -> 2025/01/article
{{title}}_{{YYYY}}{{MM}}{{DD}}      -> article_20250110
{{date}}/{{title}}                  -> 2025-01-10/article
```

### 4. 查看历史记录

1. 点击 MD Save 图标 → 保存历史
2. 查看所有保存的内容记录
3. 支持：
   - 按日期/标题/网址搜索
   - 按保存位置筛选（本地/WebDAV）
   - 点击网址直接打开原文
   - 查看完整保存路径

## 🛠️ 技术栈

- **框架**: [WXT](https://wxt.dev/) - 现代化的浏览器扩展开发框架
- **UI**: [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **样式**: [Tailwind CSS](https://tailwindcss.com/)
- **图标**: [Lucide Vue](https://lucide.dev/)
- **Markdown**: [Turndown](https://github.com/mixmark-io/turndown) + [GFM Plugin](https://github.com/mixmark-io/turndown-plugin-gfm)
- **WebDAV**: [webdav](https://github.com/perry-mitchell/webdav-client)
- **时间处理**: [Day.js](https://day.js.org/) - 轻量级日期库
- **存储**: Browser Storage API

## 📁 项目结构

```
md-save/
├── entrypoints/          # 扩展入口点
│   ├── background.ts     # 后台脚本（文件下载、WebDAV 上传）
│   ├── content.ts        # 内容脚本（页面交互、内容提取）
│   ├── popup/            # 弹出窗口
│   ├── options/          # 设置页面
│   └── history/          # 历史记录页面
├── utils/                # 工具函数
│   ├── content-service.ts       # 内容处理服务
│   ├── markdown-converter.ts   # Markdown 转换器
│   ├── webdav-client.ts        # WebDAV 客户端
│   ├── config-validator.ts     # 配置验证
│   ├── error-handler.ts        # 错误处理
│   └── logger.ts               # 日志系统
├── types/                # TypeScript 类型定义
│   ├── config.ts         # 配置类型
│   ├── history.ts        # 历史记录类型
│   └── messages.ts       # 消息类型
└── public/               # 静态资源
    └── icon/             # 扩展图标
```

## 🔧 开发指南

### 环境要求

- Node.js >= 18.20.8
- pnpm >= 7.30.1

### 开发流程

1. **启动开发服务器**
   ```bash
   pnpm dev          # Chrome
   pnpm dev:firefox  # Firefox
   ```

2. **加载扩展到浏览器**
   - Chrome: 打开 `chrome://extensions`，加载 `.output/chrome-mv3` 目录
   - Firefox: 打开 `about:debugging`，加载临时附加组件

3. **热重载**
   - 代码修改会自动重新构建
   - 部分修改需要手动刷新扩展

4. **类型检查**
   ```bash
   pnpm compile
   ```

5. **构建生产版本**
   ```bash
   pnpm build
   pnpm zip
   ```

### 代码规范

- 使用 TypeScript 进行类型安全开发
- 遵循 Vue 3 Composition API 最佳实践
- 使用 Tailwind CSS 进行样式编写
- 统一使用 `utils/error-handler.ts` 处理错误
- 使用 `utils/logger.ts` 进行日志记录

## 🐛 常见问题

### WebDAV 认证失败
1. 检查用户名和密码是否正确
2. 某些服务（如坚果云）需要使用应用专用密码
3. 尝试切换认证类型（Basic/Digest）

### 内容提取失败
1. 确保在普通网页（http/https）中使用
2. 部分动态加载内容可能无法完整提取
3. 尝试使用"选择区域保存"指定具体元素

### 文件下载失败
1. 检查浏览器下载权限
2. 确认下载目录存在且有写入权限

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发流程
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### Commit 规范
```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关
```

## 📄 许可证

[MIT License](LICENSE)

## 🙏 致谢

- [WXT](https://wxt.dev/) - 优秀的扩展开发框架
- [Turndown](https://github.com/mixmark-io/turndown) - HTML 到 Markdown 转换
- [webdav-client](https://github.com/perry-mitchell/webdav-client) - WebDAV 客户端库

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/2ue">2ue</a>
</div>
