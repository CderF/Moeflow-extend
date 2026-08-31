# 提案:日文符号面板快捷键输入

## 一句话定位

给 `mt-action-jsym` 符号面板增加 5 个可自定义的快捷键位,按下即把符号插入当前焦点输入框的游标处,省去频繁移动鼠标点击。

## 已确认需求

1. **5 个快捷键槽位**:每槽位 = 按键组合 + 符号,两者均可自定义。
2. **默认按键**:`Alt+Shift+1..5`(Mac 显示/输入为 `Opt+Shift+1..5`)。
   - ⚠️ 由最初的 `Alt+1..5` 调整而来:Chrome Win/Linux 上 `Alt+数字` 是「切换标签页」浏览器级快捷键,事件不会到达页面;Mac 上 `Opt+数字` 会输入特殊字符(`e.key` 变化),需用 `e.code` 匹配并 `preventDefault`。
3. **默认符号**:面板列表前 5 个 —— `♥ ♡ ♪ ☆ ★`。
4. **符号来源**:仅限面板现有 35 个符号(`content.js` 中 `JSYM_LIST`,约第 611 行)。
5. **自定义 UI**:符号面板内新增「自定义」编辑模式 —— 点槽位 → 从 35 符号中选 → 录制按键组合。
6. **录制规则**:强制至少含一个修饰键(Alt/Ctrl/⌘/Shift);同一组合不可分配给两个槽位。
7. **触发行为**:复用现有 `insertSymbol()`(content.js 约 1564 行)插入到 `document.activeElement` 的游标处;无焦点输入框时**打开符号面板并复用 `showJsymHint()` 提示**「请先点击翻译输入框」。
8. **持久化**:`chrome.storage.local`,与现有 `mt-jsym-pos`、`mt-theme-mode` 键保持一致风格(建议键名 `mt-jsym-shortcuts`)。
9. **作用域**:仅在 `https://moetran.com/*` 生效(content script 作用域)。

## 明确排除

- 默认键位使用裸 `Alt+1..5`(已因平台冲突调整为 `Alt/⌥+Shift+1..5`)。
- 符号支持自由文本输入(限定面板 35 个符号)。
- popup 独立设置区或双入口(只做符号面板内编辑)。
- 在 moetran.com 以外的站点生效。
- 使用 `chrome.commands` 浏览器级快捷键(content script `keydown` 监听即可,不动 manifest)。

## 待办项

| 事项 | 负责人 | 时机 |
|------|--------|------|
| Mac 日文输入法(Kotoeri)下 `Opt+Shift+数字` 是否被吞 | 开发者 | 实现后实测;若被吞,该平台用户改绑其他组合,并在面板提示中说明 |

## 实现要点(供后续会话参考)

- **监听**:content script 增加单个 `document` 级 `keydown` 监听,仅在组合命中已配置槽位时 `preventDefault()` 并调 `insertSymbol()`,其余情况完全不干预,避免干扰正常输入。
- **匹配**:统一用 `e.code`(如 `Digit1`)匹配数字键,避免键盘布局差异;修饰键用 `e.altKey / e.ctrlKey / e.metaKey / e.shiftKey`。
- **录制模式**:进入「自定义」模式后,`keydown` 监听临时切换为捕获模式,记录组合(规范化为 `Alt+Shift+1` 形式),Esc 取消;录制时禁用快捷键触发,防止误插入。
- **冲突校验**:保存时检查组合是否已在其他槽位占用,重复则拒绝并提示。
- **面板结构**:编辑模式入口建议加在 `mt-jsym-header`(现有 `mt-jsym-close-btn` 旁);槽位渲染进 `mt-jsym-body` 上方或独立编辑区。

## 验证方案(对齐仓库现有验证文化)

- `node -c content.js` —— 语法检查。
- 纯逻辑单测(仿 `tests/feishu-rows-check.mjs`):组合匹配函数 + 冲突校验函数。
- Playwright E2E(仿 `tests/theme.spec.mjs` 的 `chromium.launchPersistentContext` + `--load-extension` 方式):聚焦输入框 → 按 `Alt+Shift+1` → 断言插入 `♥`;无输入框 → 断言面板打开并显示提示;自定义界面选符号/录按键/保存 → 断言 `chrome.storage.local` 生效并刷新后仍可触发。
