# CONTEXT

## 项目概述

种植园尨译助手(Moetran Helper)——面向种植园汉化组组员的 Chrome MV3 扩展,注入 `https://moetran.com/*`,提供翻译数据统计、主题切换、日语辞書查询、梗百科查询、日文符号输入、飞书同步等能力。

## 术语表

### 日文符号面板

悬浮在 moetran.com 页面上的可拖动小面板(入口动作 `mt-action-jsym`,容器 `mt-jsym-modal-box`),列出 35 个日文常用符号(`JSYM_LIST`)。用户点击符号或按下已配置的快捷键位,即可把符号插入当前焦点输入框的游标处。面板位置持久化于 `chrome.storage.local`(`mt-jsym-pos`)。

_Avoid_: 符号列表、符号弹窗。

### 符号插入

把符号插入 `document.activeElement` 游标处的行为(`insertSymbol`)。兼容标准 `<input>`/`<textarea>`(直接改写 value 并派发 input/change 事件)与 `contentEditable`(用 `execCommand("insertText")`);当页面没有聚焦到可输入区域时,会打开日文符号面板并显示提示「请先点击翻译输入框」。快捷键触发与点击触发共用该行为。

_Avoid_: 打字、输入。

### 快捷键位

5 个可配置槽位之一,绑定「按键组合 + 符号」,按下组合即触发对应符号插入。按键与符号均可由用户在符号面板的「自定义」编辑模式中调整;按键强制至少含一个修饰键,同一组合不可分配给两个槽位。默认键位为 `Alt/⌥+Shift+1..5`(由 `Alt+1..5` 调整而来,以规避浏览器标签页切换与特殊字符冲突),默认符号为面板列表前 5 个(`♥ ♡ ♪ ☆ ★`)。配置持久化于 `chrome.storage.local`(`mt-jsym-shortcuts`)。

_Avoid_: 快捷键(单独提「快捷键」时易与槽位概念混淆)。
