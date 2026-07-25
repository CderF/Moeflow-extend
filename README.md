# 🌱 种植园尨译助手 (Zhongzhiyuan Moetran Helper)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform: Chrome](https://img.shields.io/badge/Platform-Chrome%20%2F%20Edge-orange.svg)](https://www.google.com/chrome/)

**种植园尨译助手** 是一款专为 [Moetran (尨译)](https://moetran.com) 翻译平台成员（尤其是种植园汉化组成员）打造的高颜值、自动化浏览器扩展（Chrome Manifest V3）。它不仅能够自动感知登录状态、抓取翻译与校对进度，还集成了**内置日语辞書（MOJi + Weblio）**、**无缝深浅色主题切换 (Anti-FOUC)**、**灵动岛悬浮挂件**以及**单项目与全量工作简报生成**功能。

---

## 📷 界面截图与功能展示 (Screenshots)

> 💡 **提示**：请将您的截图放置在 `img/screenshots/` 目录下（若不存在可新建文件夹），并将下方图片路径替换为实际文件名即可。

| 扩展 Popup 弹窗仪表盘 | 灵动岛悬浮胶囊挂件 |
| :---: | :---: |
| ![Popup 弹窗界面](img/screenshots/popup.png) | ![悬浮挂件界面](img/screenshots/widget.gif) |
| *全量统计、20项目列表与分步诊断* | *展开功能菜单与主题选单* |

| 内置日语辞書 (MOJi + Weblio) | 单项目实时统计与工作简报 |
| :---: | :---: |
| ![日语辞書界面](img/screenshots/dictionary.png) | ![单项目统计界面（无项目）](img/screenshots/project_stats1.png) | ![单项目统计界面（有项目）] (img/screenshots/project_stats2.png) |
| *假名发音例句与权威日日释义* | *自动感知当前项目与一键简报* |

<details>
<summary><b>🔍 点击展开：主题模式对比 (深色 / 浅色)</b></summary>
<br>

| 强制深色模式 (Dark) | 强制浅色模式 (Light) |
| :---: | :---: |
| ![深色模式](img/screenshots/theme_dark.png) | ![浅色模式](img/screenshots/theme_light.png) |

</details>

---

## ✨ 核心功能亮点

### 📊 1. 全量与近期双维度数据统计
- **参与项目总数 (全量)**：自动处理多页 API 分页（解析 `X-PAGINATION-COUNT` / `X-TOTAL-COUNT`），精准获取您历史参与过的所有项目总数。
- **种植园项目总数 (全量)**：智能识别属于“种植园汉化组”团队的项目数及您的官方团队身份。
- **近期 20 个项目精细监控**：句数统计（翻译句数 / 校对句数）、完成率以及状态分布基于最近 20 个项目精确展示。
- **当前项目实时统计**：在 `moetran.com` 的项目工作区页面中，悬浮挂件可直接读取并展示当前正在进行的项目统计及进度条，并可一键生成该项目的专属工作简报。

### 🎯 2. 双判定全满完成规则
- **已完成 (Finished)**：翻译进度为 100% **且** 校对进度为 100%。
- **进行中 (Active)**：翻译或校对进度任意一项未达到 100%。

### 📖 3. 内置日语辞書助手 (MOJi + Weblio)
- **双词典切换**：
  - **MOJi 辞書 (日中/中日)**：查词自动获取假名、发音、声调、详细中文释义及精选双语例句。
  - **Weblio 国語 (日日)**：解析 Weblio 原生词条内容，呈现代言权威日日释义并提供一键前往原网页入口。
- **独立可拖拽窗口**：支持在网页内任意拖拽词典窗口并记忆位置 (`mt-jdict-pos`)。

### 🌓 4. 无缝主题切换与防闪烁 (Anti-FOUC)
- **三档主题控制**：支持 **跟随系统 (System)**、**强制深色 (Dark)** 和 **强制浅色 (Light)** 模式。
- **Anti-FOUC 预加载**：在 `document_start` 阶段通过 `theme-preloader.js` 为 `<html>` 设置 `data-mt-theme` 属性，彻底消除页面刷新时的白色闪烁。
- **二级横向选单**：悬浮挂件一级菜单点击“切换主题”即可平滑展开二级横向选单，实时勾选并预览效果。

### 🍎 5. 灵动岛 / 胶囊风格悬浮挂件 (Dynamic Island Floating Capsule)
- **网页嵌入**：在 `moetran.com` 网页中自动注入极简胶囊挂件。
- **Pointer Events 拖拽与平滑吸附**：支持在页面任意位置拖拽，自动处理视口边缘裁剪与位置持久化保存 (`mt-widget-pos`)。
- **弹簧微动画**：采用 iOS 风格 Stagger 阶梯动画平滑展开子菜单（包含“切换主题”、“日语辞書”、“当前项目统计”）。

### 🖼️ 6. 自动 Referer 修饰与头像防盗链 (declarativeNetRequest)
- 基于 MV3 `declarativeNetRequest` 规则 (`rules.json`)，自动拦截修饰对 `m-t.pics` 及 `moetran.com/avatars` 的图片请求 Header，彻底解决头像跨域 403 加载失败问题，并保留 Base64 canvas 转码兜底方案。

### 📋 7. 一键工作简报生成
- 支持一键生成格式规范的 Markdown 工作简报（涵盖全量统计或当前项目统计）并写入剪贴板，方便直接粘贴至 QQ/微信/飞书/钉钉 团队群进行汇报。

### 🛠️ 8. 内置分步诊断测试面板
- Popup 扩展弹窗中内置折叠诊断面板，可一键测试 JWT Token 读取、网络 API 连通性与数据解析断言，排查异常一目了然。

---

## 📁 目录结构

```text
Moeflow-extend/
├── manifest.json             # Chrome Extension Manifest V3 配置文件
├── background.js             # Service Worker 后台服务 (ES Module: 统计刷新、API 中转与字典请求)
├── content.js                # 网页 Content Script (悬浮胶囊挂件、词典弹窗、单项目统计与 Token 捕获)
├── content.css               # 悬浮挂件、词典窗口与网页内 Modal 样式 (iOS Dynamic Island 风格)
├── popup.html                # 插件 Popup 弹出界面 HTML
├── popup.js                  # 插件 Popup 脚本 (数据渲染与诊断测试)
├── popup.css                 # 插件 Popup 样式 (Apple SF 风格 Design Tokens)
├── theme-preloader.js        # 网页防闪烁主题预加载脚本 (document_start)
├── popup-theme-preloader.js  # Popup 防闪烁主题预加载脚本
├── moetran-theme.css         # Moetran 网页端定制主题样式表
├── rules.json                # declarativeNetRequest 头像 Referer 修改规则
├── utils/
│   └── moetranApi.js         # Moetran REST API 交互模块 (Token 提取、接口调用与统计计算)
├── img/
│   ├── cotton.png            # 插件主图标 (棉花)
│   ├── icon.png              # 默认浅色图标
│   └── icon-white.png        # 默认深色图标
├── tests/
│   └── theme.spec.mjs        # Playwright E2E 主题与交互测试
├── AGENTS.md                 # AI Agent 开发指南与架构说明
└── README.md                 # 项目说明文档
```

---

## 🚀 安装与使用指南

### 开发者模式安装 (Unpacked Extension)

1. 克隆或下载本项目源码到本地：
   ```bash
   git clone https://github.com/your-username/Moeflow-extend.git
   ```
2. 打开 Google Chrome 或基于 Chromium 的浏览器（如 Microsoft Edge / Brave）。
3. 在地址栏输入 `chrome://extensions/` 并按回车。
4. 开启右上角的 **开发者模式 (Developer mode)**。
5. 点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
6. 选择本项目所在的 `Moeflow-extend` 文件夹。
7. 在浏览器中打开并登录 [moetran.com](https://moetran.com)，点击浏览器右上角的扩展图标或网页中的悬浮挂件即可使用！

---

## 🔧 技术架构与 API

- **Manifest Standard**: Chrome Extension Manifest V3 (`"type": "module"`)
- **API 交互**:
  - `GET /v1/user/info`: 获取当前登录用户信息。
  - `GET /v1/user/projects`: 分页获取用户参与的项目列表（带 `X-PAGINATION-COUNT` 响应头解析）。
  - `GET /v1/teams/{teamId}` / `/v1/teams/{teamId}/members`: 获取种植园团队身份与成员列表。
  - `GET /v1/projects/{projectId}`: 获取单项目详细状态。
  - `MOJi 辞書 API`: `https://api.mojidict.com/app/mojidict/api/v2/search/all` & `v1/word/detailInfo`
  - `Weblio API`: `https://www.weblio.jp/content/` (Background 直接抓取 HTML 并防盗链)
- **Token 提取机制**:
  1. `chrome.storage.local` 本地缓存优先。
  2. 自动检索已打开 `moetran.com` 标签页的 `localStorage`（匹配 JWT `eyJ...` 正则）。
  3. Domain Cookie 兜底扫描。
- **网络规则 (declarativeNetRequest)**:
  - 在 `rules.json` 中配置 Referer 为 `https://moetran.com/`，解决第三方图片防盗链。

---

## 🧪 自动化测试

项目包含 Playwright E2E 自动化测试，验证防闪烁主题预加载、灵动岛挂件交互、二级选单展开与状态持久化：

```bash
npx playwright test tests/theme.spec.mjs
```

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 许可证。
