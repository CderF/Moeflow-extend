# 🤖 AI Agent Developer Guide: 种植园尨译助手 (Moetran Helper)

本文档为后续协同维护与二次开发的 AI Agent（或人类开发者）提供架构解析、业务逻辑规范、数据契约与开发约束。

---

## 1. 🏗️ 项目架构与组件划分

本项目是一个基于 **Chrome Extension Manifest V3** 标准构建的跨浏览器插件，主要处理与 `https://moetran.com` (尨译平台) 的认证、数据同步与 UI 呈现。

```text
Moeflow-extend/
├── manifest.json         # MV3 声明文件 (Service Worker 指定 "type": "module")
├── background.js         # Service Worker 后台线程 (定时同步、消息中转与挂件自动注入)
├── content.js            # 网页 Content Script (JWT Token 页面捕获、灵动岛挂件与嵌入弹窗)
├── content.css           # 嵌入挂件样式 (iOS Dynamic Island 胶囊风格)
├── popup.html            # 扩展弹窗 HTML 视图 (包含诊断测试面板)
├── popup.js              # 弹窗交互逻辑 (数据渲染、一键简报生成、分步断言测试)
├── popup.css             # 弹窗样式 (Apple SF Pro 设计系统 & Design Tokens)
├── utils/
│   └── moetranApi.js     # API 服务模块 (Token 提取、接口请求、多页分页与统计计算引擎)
├── img/
│   └── icon.png          # 插件统一图标
├── AGENTS.md             # AI Agent 开发指南 (本文档)
└── README.md             # GitHub 项目说明文档
```

---

## 2. 🔐 认证与 Token 提取机制 (`utils/moetranApi.js`)

由于 Moetran 平台将认证 Token 保存在前端 `localStorage` 中而非 Domain Cookie 中，插件采用了三重保障的 Token 抓取管道：

1. **`chrome.storage.local` 本地缓存**：`userToken` 优先读取。
2. **动态 Tab 脚本提取**：通过 `chrome.tabs.query` 查找已被用户打开的 `moetran.com` 页面，使用 `chrome.scripting.executeScript` 深度扫描 `localStorage` 中的 JWT Token 正则（匹配 `eyJ...`）。
3. **Cookie 扫描兜底**：通过 `chrome.cookies.getAll` 扫描可能的认证 Header。

> ⚠️ **开发注意**：后台 Service Worker 无权直接访问页面的 `localStorage`，必须通过 Content Script 或 `executeScript` 进行交互。

---

## 3. 📊 数据统计引擎与计算规范

位于 `utils/moetranApi.js` 的 `getUserProjects` 和 `calculateWorkStats` 是核心计算引擎。必须严格遵循以下**业务规则**：

### 维度 1：全量参与项目数与全量种植园项目数
- **`totalProjects`（全量参与项目总数）**：
  - `getUserProjects` 会自动解析 API 响应头 `X-PAGINATION-COUNT` / `X-TOTAL-COUNT` 或 JSON `total` 字段。
  - 当参与项目数大于 100 时，系统会自动执行多页分页迭代，确保准确反映用户历史参与过的**所有项目总数**。
- **`plantationProjects`（全量种植园项目数）**：
  - 遍历用户全量参与项目集中，满足 `isPlantationProject(proj)` 的项目：即 `team._id === "6500669ca33c76075e705f00"` 或 `team.name` 包含 `"种植园"`。

### 维度 2：近期 20 个项目精细监控 (句数、完成率与状态分布)
- **统计范围限制**：`totalSources`（总句数）、`totalTranslated`（翻译句数）、`totalChecked`（校对句数）、`overallTranslationProgress`（翻译完成率）、`overallProofreadProgress`（校对完成率）、`projectList` 列表及状态分布，**必须严格基于最近 20 个项目 (`allProjects.slice(0, 20)`) 计算与展示**。
- **项目标题格式**：统一格式化为 `团队名 - 大项目名称 - 小项目名称`（通过 `formatFullProjectTitle` 自动解析）。

### 维度 3：已完成 (Finished) / 进行中 (Active) 状态判定
- **已完成 (Finished)**：`sourceCount > 0` 且 **翻译进度 === 100%** 并且 **校对进度 === 100%**。
- **进行中 (Active)**：翻译或校对进度任意一项未达到 100%（或项目句数为 0）。

```javascript
// 状态分布核心代码逻辑 (moetranApi.js)
const isFinished = (sourceCount > 0) && (translationProgress === 100) && (proofreadProgress === 100);
if (isFinished) {
  finishedProjects++;
} else {
  activeProjects++;
}
```

---

## 4. 🎨 UI/UX 与设计系统规范

- **头像与图标规则**：Moetran 服务器对头像图片开启了防盗链与 Referer 校验（空 Referer 导致 403 加载失败）。因此统一禁用远程头像图片抓取，统一使用本地 `img/icon.png` 和用户名文本展示。
- **弹窗设计**：`popup.css` 使用 CSS Variables 构建了 Apple SF Pro 设计系统，支持 `prefers-color-scheme: dark` 深色模式自适应。
- **悬浮挂件交互**：`content.js` 注入的弹窗支持外部空白区域点击自动收起（`document.addEventListener("click", ...)`）。

---

## 5. 🛠️ 代码验证与质量保证 (Checklist)

修改代码后，必须执行以下验证流程：

1. **JavaScript 语法静态检查**：
   ```bash
   node -c utils/moetranApi.js background.js content.js popup.js
   ```
2. **业务逻辑 Node.js 断言测试**：
   ```bash
   node -e '
   import("./utils/moetranApi.js").then(({ calculateWorkStats, isPlantationProject }) => {
     // 验证状态计算与分页统计断言
   });
   '
   ```
3. **Manifest V3 检查**：
   - 确保 `background` 中声明了 `"type": "module"`。
   - 确保 `web_accessible_resources` 包含 `img/icon.png`。
