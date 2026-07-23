# 🌱 种植园尨译助手 (Zhongzhiyuan Moetran Helper)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform: Chrome](https://img.shields.io/badge/Platform-Chrome%20%2F%20Edge-orange.svg)](https://www.google.com/chrome/)

**种植园尨译助手** 是一款专为 [Moetran (尨译)](https://moetran.com) 翻译平台成员打造的高颜值、自动化浏览器扩展（Chrome Manifest V3）。它能够自动感知登录状态、抓取翻译与校对进度，并提供精美的数据仪表盘与一键团队工作简报功能。

---

## ✨ 核心功能亮点

### 📊 1. 全量与近期双维度数据统计
- **参与项目总数 (全量)**：自动读取全量分页数据，精确统计您历史参与过的所有项目总数。
- **种植园项目总数 (全量)**：精准识别属于“种植园汉化组”团队的项目数。
- **近期 20 项目精细监控**：句数统计（翻译句数 / 校对句数）、完成率以及状态分布基于最近 20 个项目精确展示。

### 🎯 2. 双判定全满完成规则
- **已完成 (Finished)**：翻译进度为 100% **且** 校对进度为 100%。
- **进行中 (Active)**：翻译或校对进度任意一项未达到 100%。

### 🍎 3. 苹果 Apple SF Pro 极简高颜值 UI
- **Popup 扩展弹窗**：借鉴 macOS / iOS SF 风格，支持深浅色模式自适应、毛玻璃（Glassmorphism）微光特效与平滑微交互。
- **网页嵌入式悬浮挂件**：在 `moetran.com` 网页右下角自动注入灵动岛 / 胶囊风格悬浮徽章，点击可直接展开工作统计弹窗，支持点击空白处自动收起。

### 📋 4. 一键工作简报生成
- 点击“一键工作简报”，自动生成格式规范的 Markdown 文本并写入剪贴板，方便直接粘贴至 QQ/微信/飞书/钉钉 团队群进行日报/周报汇报。

### 🛠️ 5. 内置分步诊断测试面板
- Popup 中内置折叠诊断面板，可一键测试 JWT Token 读取、网络 API 连通性与数据解析断言，排查异常一目了然。

---

## 📁 目录结构

```text
Moeflow-extend/
├── manifest.json         # Chrome Extension Manifest V3 配置文件
├── background.js         # Service Worker 后台服务 (ES Module)
├── content.js            # 网页 Content Script (注入悬浮挂件与弹窗逻辑)
├── content.css           # 悬浮挂件与网页内弹窗样式 (iOS Dynamic Island 风格)
├── popup.html            # 插件 Popup 弹出界面 HTML
├── popup.js              # 插件 Popup 脚本 (包含数据渲染与诊断测试)
├── popup.css             # 插件 Popup 样式 (Apple SF 风格 Design Tokens)
├── utils/
│   └── moetranApi.js     # Moetran REST API 交互模块 (Token 提取、接口调用与统计计算)
├── img/
│   └── icon.png          # 插件统一图标
├── AGENTS.md             # AI Agent 开发指南与架构说明
└── README.md             # 项目说明文档
```

---

## 🚀 安装与使用指南

### 开发/开发者模式安装 (Unpacked Extension)

1. 克隆或下载本项目源码到本地：
   ```bash
   git clone https://github.com/your-username/Moeflow-extend.git
   ```
2. 打开 Google Chrome 或基于 Chromium 的浏览器（如 Microsoft Edge / Brave）。
3. 在地址栏输入 `chrome://extensions/` 并按回车。
4. 开启右上角的 **开发者模式 (Developer mode)**。
5. 点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
6. 选择本项目所在的 `Moeflow-extend` 文件夹。
7. 在浏览器中打开并登录 [moetran.com](https://moetran.com)，点击浏览器右上角的扩展图标或网页右下角的悬浮挂件即可查看实时数据！

---

## 🔧 技术架构与 API

- **Manifest**: Chrome Extension Manifest V3 (`"type": "module"`)
- **API 交互**:
  - `GET /v1/user/info`: 获取当前登录用户信息。
  - `GET /v1/user/projects`: 分页获取用户参与的项目列表（带 `X-PAGINATION-COUNT` 响应头解析）。
- **Token 提取机制**:
  1. `chrome.storage.local` 本地缓存优先。
  2. 自动检索已打开 `moetran.com` 标签页的 `localStorage`（匹配 JWT `eyJ...` 正则）。
  3. Domain Cookie 兜底扫描。

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 许可证。
