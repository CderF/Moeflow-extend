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
├── docs/
│   ├── Privacy Policy.md     # 扩展隐私政策声明文档 (Privacy Policy)
│   ├── proposals/            # 提案与规格文档 (proposal-quick-key / proposal-image-dim / spec)
│   └── agents/               # Agent 协作文档 (issue-tracker / domain)
├── utils/
│   ├── moetranApi.js         # API 服务模块 (Token 提取、接口请求、多页分页、统计计算与飞书行构建引擎)
│   └── feishuSync.js         # 飞书 Bitable 同步模块 (Token/记录快照缓存、批量写入、字段自动创建)
├── img/
│   ├── cotton.png            # 插件主图标 (棉花)
│   ├── icon.png              # 浅色模式图标
│   └── icon-white.png        # 深色模式图标
├── tests/
│   ├── theme.spec.mjs        # Playwright E2E 自动化测试用例
│   └── feishu-rows-check.mjs # 飞书行构建业务逻辑单元测试 (话数选取、状态判定、批量字段适配)
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

`getUserProjects`、`calculateWorkStats`、`getSingleProjectDetail` 以及飞书行构建引擎 `buildFeishuRowsFromProjects` 是核心计算函数。必须严格遵循以下**业务规则**：

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

---

## 7. 🔄 飞书同步功能专项开发与 MCP 测试工作流

本节专门面向飞书 Bitable 同步功能（`utils/feishuSync.js`、`background.js` 中 `SYNC_PROJECT_TO_FEISHU` / `SYNC_RECENT_TO_FEISHU` / `BULK_SYNC_PLANTATION_TO_FEISHU` 消息处理链）的**修改与测试**，提供端到端验证规范。

### 7.1 核心数据流回顾

```
[Moetran API] → getTeamProjects / getUserProjectsFirstPage
      ↓
[buildFeishuRowsFromProjects]  ← moetranApi.js 核心行构建引擎
      ↓
[getProjectMembers]            ← 并行拉取各漫画当前话项目的成员信息
      ↓
[batchUpsertMangasToFeishu]    ← feishuSync.js：batch_update 覆盖 + batch_create 新增
      ↓
[飞书 Bitable 多维表格]
```

关键约束：
- **串行队列 (`feishuSyncQueue`)**：所有飞书同步任务通过 `enqueueFeishuSync` 排队，防止并发写入造成空行重复或记录碰撞。
- **30 秒团队项目缓存 (`_teamProjCache`)**：`getCachedTeamProjects()` 在 Service Worker 生命周期内最多每 30 秒真实请求一次 Moetran API。
- **60 秒飞书记录快照缓存**：`feishuSync.js` 内部对 Bitable 全量记录建立内存快照，避免每次同步都全量拉取表格数据。

### 7.2 标准测试步骤（无 MCP 环境 / 基础验证）

> 适用于任何环境下的快速冒烟测试，优先执行。

```bash
# Step 1: 语法检查（全文件）
node -c utils/moetranApi.js utils/feishuSync.js background.js content.js popup.js

# Step 2: 飞书行构建单元测试（14 项业务规则断言）
node tests/feishu-rows-check.mjs

# Step 3: Playwright E2E（主题 / 挂件）
npx playwright test tests/theme.spec.mjs
```

### 7.3 MCP 增强测试工作流（需本地安装 `moeflow-sync-dev`）

> **前置检测**：在执行以下步骤前，先验证 MCP server 是否可用：
> ```bash
> # 如果以下命令返回 JSON 数据列表，说明 moeflow-sync-dev 服务正常运行
> # （通过 Antigravity MCP 工具调用 mock_project_snapshot，count=1）
> ```
> 若 MCP server 不可用（服务未启动或未安装），跳过本节，使用 7.2 的基础测试步骤即可。

#### 工具说明

| MCP 工具 | 用途 | 关键参数 |
|----------|------|----------|
| `mock_project_snapshot` | 生成 N 条仿真项目数据（含种植园团队 ID、project_set、members） | `count`（条数）、`change_finished_state`（是否包含已完成项目） |
| `assert_diff_logic` | 比对两次项目快照，精准提取发生句数/状态/新增/删除变更的项目清单 | `old_snapshot`、`new_snapshot`（均为项目对象数组） |
| `test_webhook_sync` | 直接向飞书 Webhook 或 Bitable API 发送 JSON Payload 进行端到端推送验证 | `webhook_url`、`payload`、`bearer_token`（可选） |

#### Step A — 生成仿真快照，验证行构建逻辑

```
1. 调用 mock_project_snapshot(count=10, change_finished_state=false)
   → 获得 10 条模拟进行中项目数据（含漫画名、话数、成员）

2. 将返回的项目数组传入 buildFeishuRowsFromProjects()（在 Node.js 中 import）
   → 验证输出的 rows 数组：
     · 每行包含 mangaName / latestChapter / currentChapter / status / creator / participants
     · latestChapter ≥ currentChapter（最新话数 ≥ 当前进行话数）
     · status 取值严格为「待翻译 / 翻译中 / 待校对 / 校对中 / 已完成」之一

3. 调用 mock_project_snapshot(count=10, change_finished_state=true)
   → 获得含已完成项目的快照
   → 重复 Step A.2，验证已完成章节被正确标记并排除出「当前进行」候选集
```

#### Step B — 验证差量变更检测逻辑

```
1. old_snapshot = mock_project_snapshot(count=5)  # 基准快照
2. 手动修改其中 1~2 条的 translatedSourceCount / checkedSourceCount
3. 调用 assert_diff_logic(old_snapshot=..., new_snapshot=修改后数据)
   → 验证返回的变更清单精确命中修改的项目，未修改项目不出现在列表中
   → 重点检查：新增项目、删除项目、句数变更、状态升级（翻译中→待校对→已完成）均被正确捕获
```

#### Step C — 端到端飞书推送验证

> ⚠️ 此步骤需要有效的飞书 App Token 和目标 Bitable 表格 URL。
> 仅在飞书 Bitable 写入逻辑（`feishuSync.js`）发生变更时执行。

```
1. 从 Popup 的飞书配置面板获取 App ID / App Secret（或直接从 chrome.storage.local 读取）
2. 调用飞书 auth 接口获取 tenant_access_token（参考 feishuSync.js 中 getFeishuToken()）
3. 调用 mock_project_snapshot(count=3) 生成测试 rows，手工转换为飞书 fields 格式
4. 调用 test_webhook_sync(
     webhook_url="https://open.feishu.cn/open-apis/bitable/v1/apps/{token}/tables/{id}/records/batch_create",
     payload={ records: [...] },
     bearer_token="t-xxx"
   )
   → 验证 HTTP 响应 code === 0，records 已写入表格
5. 再次调用 test_webhook_sync 执行 batch_update，验证同一漫画名的行被覆盖而非重复创建
```

#### Step D — 覆盖边界场景

修改飞书同步相关代码后，须额外验证以下边界情况：

| 场景 | 验证方法 |
|------|----------|
| 漫画所有章节均为 `计划删除` 状态 | mock 数据中将全部 `status` 设为 `3`，验证 `buildFeishuRowsFromProjects` 返回空数组 |
| 漫画存在文字话名（如「番外篇」「特别篇 2024」） | mock 数据中 `name` 字段使用纯文字，验证 `latestChapter` / `currentChapter` 输出为字符串而非数字 |
| 飞书 Token 过期（401 响应） | `test_webhook_sync` 使用过期 token，验证 `feishuSync.js` 能正确抛出错误并触发重新鉴权 |
| 并发两次触发同步 | 连续快速发送两次 `SYNC_RECENT_TO_FEISHU` 消息，验证 `feishuSyncQueue` 串行队列不产生重复写入 |

### 7.4 飞书同步功能回归测试矩阵

每次修改 `feishuSync.js` 或 `buildFeishuRowsFromProjects` 后，必须完整通过以下矩阵：

```
[必须通过]
✅ node tests/feishu-rows-check.mjs           # 14 项单元测试全绿
✅ node -c utils/feishuSync.js                 # 语法无误

[若本地有 moeflow-sync-dev，额外执行]
✅ Step A: mock_project_snapshot → buildFeishuRowsFromProjects 输出结构验证
✅ Step B: assert_diff_logic 差量检测精度验证
✅ Step C: test_webhook_sync 端到端写入验证（仅在 feishuSync.js 有写入逻辑变更时）
✅ Step D: 边界场景（计划删除、文字话名、Token 过期、并发队列）
```

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`.
