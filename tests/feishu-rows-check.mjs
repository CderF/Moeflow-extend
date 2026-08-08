/**
 * Node assertion checks for Feishu row building rules (no browser required).
 * Run: node tests/feishu-rows-check.mjs
 */
import assert from "node:assert/strict";
import { buildFeishuRowsFromProjects, determineChapterStatus, extractChapterNumber } from "../utils/moetranApi.js";
import { buildSmartFieldsPayload } from "../utils/feishuSync.js";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

const mkChapter = ({
  id,
  name,
  source = 100,
  translated = 0,
  checked = 0,
  created = "2026-01-01T00:00:00.000Z",
  updated = "2026-01-02T00:00:00.000Z",
  pstatus = 0,
  set = "测试漫画"
}) => ({
  id,
  _id: id,
  name,
  sourceCount: source,
  translatedSourceCount: translated,
  checkedSourceCount: checked,
  createTime: created,
  edit_time: updated, // 真实 API 字段为 create_time / edit_time
  status: pstatus,    // 平台项目状态: 0 进行中 / 1 已完结 / 2 计划完结 / 3 计划删除
  project_set: { name: set }
});

check("extractChapterNumber: 第X话 / 小数 / 卷 / 非数字", () => {
  assert.equal(extractChapterNumber("第70话"), 70);
  assert.equal(extractChapterNumber("第 38.5 话"), 38.5);
  assert.equal(extractChapterNumber("第5卷"), 5);
  assert.equal(extractChapterNumber("12话"), 12);
  assert.equal(extractChapterNumber("38.5"), 38.5);
  assert.equal(extractChapterNumber("番外篇"), null);
  assert.equal(extractChapterNumber(""), null);
  assert.equal(extractChapterNumber(null), null);
});

check("determineChapterStatus: 翻译句数为 0 归入待翻译", () => {
  assert.equal(determineChapterStatus(500, 0, 0), "待翻译");
  assert.equal(determineChapterStatus(0, 0, 0), "待翻译");
  assert.equal(determineChapterStatus(100, 50, 0), "翻译中");
  assert.equal(determineChapterStatus(100, 100, 0), "待校对");
  assert.equal(determineChapterStatus(100, 100, 40), "校对中");
  assert.equal(determineChapterStatus(100, 100, 100), "已完成");
});

check("爆进用例: 70待翻译 + 66待校对 → 最新70 / 当前66 / 待校对 / 人员取自66话项目", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "p70", name: "第70话", translated: 0, updated: "2026-08-01T00:00:00.000Z" }),
    mkChapter({ id: "p66", name: "第66话", translated: 100, checked: 0, updated: "2026-08-05T00:00:00.000Z" }),
    mkChapter({ id: "p65", name: "第65话", translated: 100, checked: 100, updated: "2026-07-20T00:00:00.000Z" })
  ], { p66: { creator: "darc", participants: ["遥烨"] } });

  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.latestChapter, 70);
  assert.equal(r.currentChapter, 66);
  assert.equal(r.status, "待校对");
  assert.equal(r.creator, "darc");
  assert.deepEqual(r.participants, ["遥烨"]);
  assert.equal(r.membersLoaded, true);
  assert.equal(r.targetProjectId, "p66");
  // 最后编辑日期 = 全部章节 updatedAt 的最大值
  assert.equal(r.lastEditDate, new Date("2026-08-05T00:00:00.000Z").getTime());
});

check("病娇用例: 34待翻译 + 32待校对 → 最新34 / 当前32 / 待校对", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "b34", name: "第34话", translated: 0 }),
    mkChapter({ id: "b32", name: "第32话", translated: 100, checked: 0 })
  ], { b32: { creator: "OuKatsuKi", participants: ["alan", "BWV614"] } });

  const r = rows[0];
  assert.equal(r.latestChapter, 34);
  assert.equal(r.currentChapter, 32);
  assert.equal(r.status, "待校对");
  assert.equal(r.creator, "OuKatsuKi");
  assert.deepEqual(r.participants, ["alan", "BWV614"]);
});

check("无未翻译章节: 最新话数 = 全部章节最大话数", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "c5", name: "第5话", translated: 100, checked: 100 }),
    mkChapter({ id: "c6", name: "第6话", translated: 30, checked: 0 })
  ]);
  const r = rows[0];
  assert.equal(r.latestChapter, 6);
  assert.equal(r.currentChapter, 6);
  assert.equal(r.status, "翻译中");
});

check("全部待翻译: 当前进行 = 最新话数, 状态 = 待翻译", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "d3", name: "第3话", translated: 0 }),
    mkChapter({ id: "d5", name: "第5话", translated: 0 })
  ]);
  const r = rows[0];
  assert.equal(r.latestChapter, 5);
  assert.equal(r.currentChapter, 5);
  assert.equal(r.status, "待翻译");
  assert.equal(r.targetProjectId, "d5");
});

check("已完成插队: 66待校对 + 68已完成 → 当前 = 68, 状态 = 已完成", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "e70", name: "第70话", translated: 0 }),
    mkChapter({ id: "e66", name: "第66话", translated: 100, checked: 0 }),
    mkChapter({ id: "e68", name: "第68话", translated: 100, checked: 100 })
  ]);
  const r = rows[0];
  assert.equal(r.latestChapter, 70);
  assert.equal(r.currentChapter, 68);
  assert.equal(r.status, "已完成");
  assert.equal(r.targetProjectId, "e68");
});

check("非数字话数: 纯非数字按创建时间选取, 数字话数优先于非数字", () => {
  const rowsA = buildFeishuRowsFromProjects([
    mkChapter({ id: "f1", name: "番外篇·上", created: "2026-01-01T00:00:00.000Z", translated: 0 }),
    mkChapter({ id: "f2", name: "番外篇·下", created: "2026-03-01T00:00:00.000Z", translated: 0 })
  ]);
  assert.equal(rowsA[0].latestChapter, "番外篇·下");
  assert.equal(rowsA[0].targetProjectId, "f2");

  // 数字话数优先，即使非数字章节创建时间更晚
  const rowsB = buildFeishuRowsFromProjects([
    mkChapter({ id: "g1", name: "第12话", created: "2026-01-01T00:00:00.000Z", translated: 0 }),
    mkChapter({ id: "g2", name: "番外篇", created: "2026-06-01T00:00:00.000Z", translated: 0 })
  ]);
  assert.equal(rowsB[0].latestChapter, 12);
});

check("同话数并列: 取创建时间最新者为目标项目", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "h1", name: "第7话", created: "2026-01-01T00:00:00.000Z", translated: 0 }),
    mkChapter({ id: "h2", name: "第7话", created: "2026-05-01T00:00:00.000Z", translated: 0 })
  ]);
  assert.equal(rows[0].latestChapter, 7);
  assert.equal(rows[0].targetProjectId, "h2");
});

check("守护甜心用例: 平台已完结但句数为 0 的项目不污染最新话数", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "s7", name: "第7话", translated: 0 }),                    // 活跃未开坑
    mkChapter({ id: "s25", name: "第25话", translated: 0, pstatus: 1 })      // 已完结但句数缓存为 0
  ]);
  const r = rows[0];
  assert.equal(r.latestChapter, 7);
  assert.equal(r.currentChapter, 7);
  assert.equal(r.status, "待翻译");
});

check("已完结项目不污染当前进行话数（含部分句数的情况）", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "t8", name: "第8话", translated: 0 }),
    mkChapter({ id: "t7", name: "第7话", translated: 100, checked: 0 }),
    mkChapter({ id: "t25", name: "第25话", translated: 50, pstatus: 1 })     // 旧逻辑会判翻译中并当选当前进行
  ]);
  const r = rows[0];
  assert.equal(r.latestChapter, 8);
  assert.equal(r.currentChapter, 7);
  assert.equal(r.status, "待校对");
  assert.equal(r.targetProjectId, "t7");
});

check("整本漫画全部已完结: 回退到全量最大话数, 状态强制已完成", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "u5", name: "第5话", translated: 100, checked: 100, pstatus: 1 }),
    mkChapter({ id: "u6", name: "第6话", translated: 0, pstatus: 1 })        // 已完结但 0 句数
  ]);
  const r = rows[0];
  assert.equal(r.latestChapter, 6);
  assert.equal(r.currentChapter, 6);
  assert.equal(r.status, "已完成");
});

check("计划删除的项目完全排除", () => {
  const rows = buildFeishuRowsFromProjects([
    mkChapter({ id: "v9", name: "第9话", translated: 0 }),
    mkChapter({ id: "v99", name: "第99话", translated: 0, pstatus: 3 })
  ]);
  assert.equal(rows[0].latestChapter, 9);

  // 整本漫画都在计划删除中 → 不产生行
  const rowsGone = buildFeishuRowsFromProjects([
    mkChapter({ id: "v100", name: "第100话", pstatus: 3 })
  ]);
  assert.equal(rowsGone.length, 0);
});

check("buildSmartFieldsPayload: 列类型自适应 / membersLoaded 跳过 / participants 防御", () => {
  const baseRow = {
    mangaName: "测试漫画",
    latestChapter: "番外篇·下",
    currentChapter: 66,
    status: "待校对",
    creator: "darc",
    participants: ["遥烨"],
    membersLoaded: true,
    lastEditDate: new Date("2026-08-05T00:00:00.000Z").getTime()
  };

  // 非数字话名: 数字列落 0, 文本列保留话名
  const numberSchema = [{ field_name: "最新话数", type: 2 }];
  assert.equal(buildSmartFieldsPayload(baseRow, numberSchema)["最新话数"], 0);
  const textSchema = [{ field_name: "最新话数", type: 1 }];
  assert.equal(buildSmartFieldsPayload(baseRow, textSchema)["最新话数"], "番外篇·下");

  // membersLoaded = false 时不写入人员列, 保留表格已有值
  const fullSchema = [
    { field_name: "漫画名", type: 1 },
    { field_name: "图源", type: 1 },
    { field_name: "参与人员 1", type: 1 }
  ];
  const skipped = buildSmartFieldsPayload({ ...baseRow, membersLoaded: false }, fullSchema);
  assert.equal(skipped["漫画名"], "测试漫画");
  assert.equal("图源" in skipped, false);
  assert.equal("参与人员 1" in skipped, false);

  // participants 非数组时不抛异常
  const noArr = buildSmartFieldsPayload({ mangaName: "x", latestChapter: 1, currentChapter: 1, participants: undefined }, null);
  assert.equal(noArr["参与人员 1"], "");
});

console.log(`\n全部 ${passed} 项飞书行构建检查通过 ✅`);
