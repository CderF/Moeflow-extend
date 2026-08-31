/**
 * Node assertion checks for the dark-mode source-image dimming rule (no browser required).
 * Run: node tests/theme-image-dim-check.mjs
 *
 * Contract (issue #8): 深色模式下,翻译页「源图浏览区」的源图 <img> 降暗到
 * brightness(0.85);背景不动、标注/批注层(canvas)不受影响、浅色模式无对应规则。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cssPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../moetran-theme.css");
const css = readFileSync(cssPath, "utf8");

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

// 按 "}" 切块,取出同时命中源图浏览区与 <img> 的规则块。
// 注:moetran-theme.css 当前无 @media/@keyframes 等 at-rule,直接按 "}" 切分是安全的;
// 若日后引入 at-rule 块,这里需改为花括号配平切分。
const blocks = css
  .split("}")
  .map((b) => b.trim())
  .filter(Boolean);
const dimBlocks = blocks.filter((b) => b.includes("ImageSourceViewer") && b.includes("img"));

check("存在源图浏览区 <img> 降暗规则", () => {
  assert.ok(dimBlocks.length >= 1, "moetran-theme.css 中未找到同时含 ImageSourceViewer 与 img 的规则");
});

check("降暗规则:深色模式前缀 + brightness(0.85) + 不含 canvas", () => {
  for (const b of dimBlocks) {
    assert.match(b, /html\[data-mt-theme="dark"\]/, '规则必须挂 html[data-mt-theme="dark"] 前缀');
    assert.match(b, /filter:\s*brightness\(0\.85\)\s*!important/, "降暗值应为 filter: brightness(0.85) !important");
    assert.doesNotMatch(b, /canvas/, "不得命中标注/批注层(canvas)");
  }
});

check("浅色模式无源图降暗规则", () => {
  for (const b of blocks) {
    const lightDim =
      b.includes('html[data-mt-theme="light"]') &&
      b.includes("ImageSourceViewer") &&
      b.includes("img") &&
      b.includes("brightness");
    assert.equal(lightDim, false, "浅色模式前缀下不得存在源图降暗规则");
  }
});

console.log(`\n全部 ${passed} 项图片降暗规则检查通过 ✅`);
