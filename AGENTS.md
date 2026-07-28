# 🤖 AI Agent Developer Guide: 种植园尨译助手 (Moetran Helper)

本文档为后续协同维护与二次开发的 AI Agent（或人类开发者）提供完整架构解析、业务逻辑规范、数据契约、API 协议与开发约束。

---

## 1. 🏗️ 项目架构与组件划分

本项目是一个基于 **Chrome Extension Manifest V3** 标准构建的跨浏览器插件，主要处理与 `https://moetran.com` (尨译平台) 的认证、数据同步、内置辞書工具、日文符号快捷输入面板、防闪烁主题切换与 UI 呈现。

```text
Moeflow-extend/
├── manifest.json             # MV3 声明文件 (Service Worker 指定 "type": "module")
├── background.js             # Service Worker 后台线程 (定时同步、消息中转、辞書请求与挂件自动注入)
├── content.js                # 网页 Content Script (JWT 捕获、悬浮胶囊挂件、辞書 Modal、日文符号面板与单项目统计)
├── content.css               # 嵌入挂件、辞書窗口、日文符号面板与 Modal 样式 (iOS Dynamic Island 胶囊风格)
├── popup.html                # 扩展弹窗 HTML 视图 (包含诊断测试面板)
├── popup.js                  # 弹窗交互逻辑 (数据渲染、一键简报生成、分步断言测试)
├── popup.css                 # 弹窗样式 (Apple SF Pro 设计系统 & Design Tokens)
├── theme-preloader.js        # 网页防闪烁主题预加载脚本 (document_start 阶段设置 data-mt-theme)
├── popup-theme-preloader.js  # Popup 防闪烁主题预加载脚本
├── moetran-theme.css         # Moetran 网页端定制主题样式表
├── rules.json                # declarativeNetRequest 头像 Referer 修改规则
├── Privacy Policy.md         # 扩展隐私政策声明文档 (Privacy Policy)
├── utils/
│   └── moetranApi.js         # API 服务模块 (Token 提取、接口请求、多页分页与统计计算引擎)
├── img/
│   ├── cotton.png            # 插件主图标 (棉花)
│   ├── icon.png              # 浅色模式图标
│   └── icon-white.png        # 深色模式图标
├── tests/
│   └── theme.spec.mjs        # Playwright E2E 自动化测试用例
├── AGENTS.md                 # AI Agent 开发指南 (本文档)
└── README.md                 # GitHub 项目说明文档
```

---

## 2. 🔐 认证与 Token 提取管道 (`utils/moetranApi.js`)

由于 Moetran 平台将认证 Token 保存在前端 `localStorage` 中而非 Domain Cookie 中，插件采用了三重保障的 Token 抓取管道：

1. **`chrome.storage.local` 本地缓存**：`userToken` 优先读取。
2. **动态 Tab 脚本提取**：通过 `chrome.tabs.query` 查找已被用户打开的 `moetran.com` 页面，使用 `chrome.scripting.executeScript` 深度扫描 `localStorage` 中的 JWT Token 正则（匹配 `eyJ...`）。
3. **Cookie 扫描兜底**：通过 `chrome.cookies.getAll` 扫描可能的认证 Header。

### 头像防盗链处理机制
- **`declarativeNetRequest` 静态规则 (`rules.json`)**：修饰所有发往 `*m-t.pics*` 及 `*moetran.com/avatars*` 的图片/XHR 请求 Header，设置 `Referer: https://moetran.com/` 与 `Origin: https://moetran.com`，彻底消除跨域 403 阻断。
- **Base64 Canvas 转换兜底**：`content.js` 在页面上下文拉取头像并转为 Base64 `data:image/...` 存入 `userProfile`。

> ⚠️ **开发注意**：后台 Service Worker 无权直接访问页面的 `localStorage`，必须通过 Content Script 或 `executeScript` 进行交互。

---

## 3. 📊 数据统计引擎与计算规范 (`utils/moetranApi.js`)

`getUserProjects`、`calculateWorkStats` 与 `getSingleProjectDetail` 是核心计算引擎。必须严格遵循以下**业务规则**：

### 维度 1：全量参与项目数与全量种植园项目数
- **`totalProjects`（全量参与项目总数）**：
  - `getUserProjects` 会自动解析 API 响应头 `X-PAGINATION-COUNT` / `X-TOTAL-COUNT` 或 JSON `total` 字段。
  - 当参与项目数大于 100 时，系统会自动执行多页分页迭代，确保准确反映用户历史参与过的**所有项目总数**。
- **`plantationProjects`（全量种植园项目数）**：
  - 遍历用户全量参与项目集中，满足 `isPlantationProject(proj)` 的项目：即 `team._id === "6500669ca33c76075e705f00"` 或 `team.name` 包含 `"种植园"`。

### 维度 2：近期 20 个项目精细监控 (句数、完成率与状态分布)
- **统计范围限制**：`totalSources`（总句数）、`totalTranslated`（翻译句数）、`totalChecked`（校对句数）、`overallTranslationProgress`（翻译完成率）、`overallProofreadProgress`（校对完成率）、`projectList` 列表及状态分布，**必须严格基于最近 20 个项目 (`allProjects.slice(0, 20)`) 计算与展示**。
- **项目标题格式**：统一格式化为 `团队名 - 大项目名称 - 小项目名称`（通过 `formatFullProjectTitle` 自动解析）。

### 维度 3：当前工作项目实时统计 (Single Project Stats)
- `content.js` 自动从当前页面 URL 匹配项目 ID (`/(?:projects|workspace|editor)\/([a-fA-F0-9]{24})/`)。
- 发送 `FETCH_SINGLE_PROJECT` 消息给 `background.js` 调用 `getSingleProjectDetail(projectId)` 获取实时句数与进度。

### 维度 4：已完成 (Finished) / 进行中 (Active) 状态判定
- **已完成 (Finished)**：`sourceCount > 0` 且 **翻译进度 === 100%** 并且 **校对进度 === 100%**。
- **进行中 (Active)**：翻译或校对进度任意一项未达到 100%（或项目句数为 0）。

### 维度 5：团队身份标准化 (`normalizeTeamRole`)
官方团队身份映射为以下 5 种统一名称：
1. `"创建人"` (Creator / Owner / level 1)
2. `"管理员"` (Admin / Manager / level 2)
3. `"资深成员"` (Senior / level 3)
4. `"成员"` (Member / level 4)
5. `"见习成员"` (Trainee / Intern / level 5)

---

## 4. 📖 日语辞書与符号工具引擎

### 日语辞書助手 (MOJi + Weblio)
1. **MOJi 辞書 (日中 / 中日)**：
   - 接口 1: `GET https://api.mojidict.com/app/mojidict/api/v2/search/all?text={query}&types=102` (检索词条列表)
   - 接口 2: `GET https://api.mojidict.com/app/mojidict/api/v1/word/detailInfo?wordId={targetId}` (获取假名、发音、声调、中文释义与双语例句)
2. **Weblio 国語 (日日)**：
   - Service Worker 后台请求 `https://www.weblio.jp/content/{query}`
   - `content.js` 使用 `DOMParser` 解析 HTML 节点 `.kiji` / `#main`，清洗广告与无用元素，重写相对路径 `<a>` 标签为新窗口跳转。
3. **窗口拖拽与记忆**：
   - 词典窗口可通过 Header 拖拽，位置持久化至 `chrome.storage.local` (`mt-jdict-pos`)。

### 梗百科助手 (萌娘百科 + Pixiv百科)
1. **萌娘百科 (Moegirl Wiki)**：
   - 接口 1: `GET https://zh.moegirl.org.cn/api.php?action=query&list=search&srsearch={query}&format=json&utf8=1` (检索相关词条列表)
   - 接口 2: `GET https://zh.moegirl.org.cn/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&piprop=original&titles={title}&format=json&utf8=1` (提取词条导言摘要与首图)
2. **ピクシブ百科事典 (Pixiv Dic)**：
   - Service Worker 后台请求 `https://dic.pixiv.net/a/{query}` / `https://dic.pixiv.net/search?query={query}`
   - `content.js` 使用 `DOMParser` 解析 DOM，清洗广告与无用元素，渲染文章标题、导言摘要、精选主图与“在 Pixiv 百科查看原网页 ↗”外链按钮。
3. **窗口拖拽、记忆与选中文本联动**：
   - 梗百科窗口可通过 Header 拖拽，位置持久化至 `chrome.storage.local` (`mt-mwiki-pos`)。
   - 选中文本时点击胶囊按钮，可自动填充选中的网络梗/词条文本并触发快速查询。

### 日文常用符号快捷输入面板 (`mt-action-jsym`)
1. **输入框焦点感知与光标插入 (`insertSymbol`)**：
   - 监听点击符号按钮事件，判断当前焦点元素 `document.activeElement` 是否为 `<input>`、`<textarea>` 或 `contentEditable` 富文本。
   - 自动在当前选区/光标处插入目标符号，并触发 `input` 与 `change` 事件（兼容 React / Vue 数据绑定模型）。
   - 若未聚焦任何文本输入框，显示 `showJsymHint` 极简防呆提示。
2. **独立拖拽与记忆**：
   - 符号面板 Header 支持 Pointer Events 拖拽，位置持久化存至 `chrome.storage.local` (`mt-jsym-pos`)。

---

## 5. 🌓 主题模式与防闪烁 (Anti-FOUC) 规范

- **三档主题**：`system` (跟随系统), `dark` (强制深色), `light` (强制浅色)。
- **存储键名**：`chrome.storage.local` 中的 `mt-theme-mode`。
- **防闪烁机制 (Anti-FOUC)**：
  - `theme-preloader.js` (声明在 `manifest.json` `content_scripts` `run_at: "document_start"`) 率先执行，在 DOM 渲染前将 `data-mt-theme` 属性直接写入 `document.documentElement`。
  - `popup-theme-preloader.js` 负责 Popup HTML 渲染前的主题注入。

---

## 6. 🛠️ 代码验证与质量保证 (Checklist)

修改代码后，必须按顺序执行以下验证流程：

1. **JavaScript 语法静态检查**：
   ```bash
   node -c utils/moetranApi.js background.js content.js popup.js theme-preloader.js popup-theme-preloader.js
   ```

2. **业务逻辑 Node.js 断言测试**：
   ```bash
   node -e '
   import("./utils/moetranApi.js").then(({ calculateWorkStats, isPlantationProject, normalizeTeamRole }) => {
     console.log("Testing normalizeTeamRole:", normalizeTeamRole("admin") === "管理员");
     const mockProjects = [
       { id: 1, name: "Test 1", sourceCount: 10, translatedSourceCount: 10, checkedSourceCount: 10, team: { id: "6500669ca33c76075e705f00", name: "种植园汉化组" } }
     ];
     const stats = calculateWorkStats(mockProjects);
     console.log("Stats test passed:", stats.finishedProjects === 1);
   });
   '
   ```

3. **Playwright E2E 自动化测试** (验证主题预加载、胶囊浮窗与二级选单)：
   ```bash
   npx playwright test tests/theme.spec.mjs
   ```

4. **Manifest V3 检查**：
   - 确保 `background` 中声明了 `"type": "module"`。
   - 确保 `declarative_net_request` 资源指向 `rules.json`。
   - 确保 `web_accessible_resources` 包含 `img/icon.png` 与 `img/icon-white.png`。
