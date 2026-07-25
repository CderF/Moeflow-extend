/**
 * Background Service Worker (Manifest V3)
 * Handles background statistics sync, message handling, and token management.
 */

import { getUserInfo, getUserProjects, calculateWorkStats, getPlantationTeamMemberRole, normalizeTeamRole, getSingleProjectDetail, TEAM_PLANTATION_ID } from "./utils/moetranApi.js";

async function injectContentScriptToAllTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ["https://moetran.com/*", "https://*.moetran.com/*"] });
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
      } catch (e) {
        console.warn(`[Background] Failed to inject content.js into tab ${tab.id}:`, e);
      }
    }
  } catch (err) {
    console.warn("[Background] Tab query for auto-injection error:", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[种植园尨译助手] Background service worker initialized.");
  chrome.alarms.create("refreshStatsAlarm", { periodInMinutes: 30 });
  injectContentScriptToAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectContentScriptToAllTabs();
});

/**
 * Perform stats & user info refresh from Moetran API (Recent items)
 */
async function refreshUserStats() {
  try {
    // 1. Fetch user info for username, avatar and official team role
    const userInfo = await getUserInfo();
    let profile = null;
    if (userInfo) {
      let officialTeamRole = "";
      try {
        officialTeamRole = await getPlantationTeamMemberRole(userInfo.id);
      } catch (e) {
        console.warn("[Background] Team member role fetch warning:", e);
      }

      profile = {
        name: userInfo.name || "尨译用户",
        email: userInfo.email || "",
        avatar: userInfo.avatar || "",
        teamRole: officialTeamRole ? normalizeTeamRole(officialTeamRole) : (userInfo.teamRole ? normalizeTeamRole(userInfo.teamRole) : "")
      };
      await chrome.storage.local.set({ userProfile: profile });
    } else {
      const stored = await chrome.storage.local.get("userProfile");
      profile = stored.userProfile || null;
    }

    // 2. Fetch user participated project list (with pagination to fetch all items) and calculate statistics
    const projects = await getUserProjects(1, 100);
    const stats = calculateWorkStats(Array.isArray(projects) ? projects : []);

    if (profile) {
      if (!profile.teamRole) {
        profile.teamRole = normalizeTeamRole(stats.plantationRole);
      }
      await chrome.storage.local.set({ userProfile: profile });
    }
    await chrome.storage.local.set({ workStats: stats, lastSyncTime: Date.now() });

    // Update badge with plantation project count
    if (stats.plantationProjects > 0) {
      await chrome.action.setBadgeText({ text: String(stats.plantationProjects) });
      await chrome.action.setBadgeBackgroundColor({ color: "#2563EB" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }

    return { success: true, stats, userProfile: profile };
  } catch (error) {
    console.error("[Background] Failed to refresh stats:", error);
    const stored = await chrome.storage.local.get(["workStats", "userProfile"]);
    return { success: false, error: error.message, stats: stored.workStats || null, userProfile: stored.userProfile || null };
  }
}

// Message Listener for Extension Communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "STORE_TOKEN": {
          const storageObj = {};
          if (message.token) storageObj.userToken = message.token;
          if (message.userProfile) storageObj.userProfile = message.userProfile;
          if (Object.keys(storageObj).length > 0) {
            await chrome.storage.local.set(storageObj);
            console.log("[Background] User token/profile stored successfully.");
          }
          const result = await refreshUserStats();
          sendResponse(result);
          break;
        }

        case "FETCH_STATS": {
          const refreshResult = await refreshUserStats();
          sendResponse(refreshResult);
          break;
        }

        case "FETCH_SINGLE_PROJECT": {
          const { projectId } = message;
          const { userProfile } = await chrome.storage.local.get("userProfile");
          if (!projectId) {
            sendResponse({ success: false, error: "未指定项目 ID", userProfile: userProfile || null });
            break;
          }
          const singleStats = await getSingleProjectDetail(projectId);
          if (singleStats) {
            sendResponse({ success: true, projectStats: singleStats, userProfile: userProfile || null });
          } else {
            sendResponse({ success: false, error: "无法获取该项目数据", userProfile: userProfile || null });
          }
          break;
        }

        case "GET_CACHED_STATS": {
          const { workStats, lastSyncTime, userProfile } = await chrome.storage.local.get([
            "workStats",
            "lastSyncTime",
            "userProfile"
          ]);
          sendResponse({
            success: true,
            stats: workStats || null,
            lastSyncTime: lastSyncTime || null,
            userProfile: userProfile || null
          });
          break;
        }

        case "FETCH_WEBLIO":
        case "FETCH_DICT": {
          const { query, dictType } = message;
          if (!query || typeof query !== "string") {
            sendResponse({ success: false, error: "请输入需要查询的词汇" });
            break;
          }
          const trimmed = query.trim();

          if (dictType === "ja") {
            // Weblio 日日 (国語)
            const targetUrl = "https://www.weblio.jp/content/" + encodeURIComponent(trimmed);
            try {
              const res = await fetch(targetUrl, {
                headers: {
                  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                  "Accept-Language": "ja,zh-CN,zh;q=0.9,en;q=0.8"
                }
              });

              if (!res.ok) {
                sendResponse({ success: false, error: `请求失败 (HTTP ${res.status})`, targetUrl, source: "weblio" });
                break;
              }

              const htmlText = await res.text();
              sendResponse({ success: true, source: "weblio", html: htmlText, targetUrl, query: trimmed, dictType });
            } catch (fetchErr) {
              console.error("[Background] Fetch Weblio error:", fetchErr);
              sendResponse({ success: false, error: "网络请求失败，请检查网络连接", targetUrl, source: "weblio" });
            }
          } else {
            // MOJi 辞書 (日中 / 中日)
            const mojiResult = await fetchMojiDict(trimmed);
            sendResponse(mojiResult);
          }
          break;
        }

        default:
          sendResponse({ success: false, error: "Unknown message type" });
          break;
      }
    } catch (err) {
      console.error("[Background] Error handling message:", err);
      try {
        sendResponse({ success: false, error: err.message });
      } catch (e) {
        // sender might have already closed
      }
    }
  })();

  return true; // Keep message channel open for async response
});

/**
 * Fetch word details from MOJi 辞書 REST API
 */
async function fetchMojiDict(query) {
  const targetUrl = `https://www.mojidict.com/search/${encodeURIComponent(query)}`;
  const headers = {
    "x-MOJI-APP-ID": "com.mojitec.mojidict",
    "X-MOJI-OS": "PCWeb",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  try {
    const searchUrl = `https://api.mojidict.com/app/mojidict/api/v2/search/all?text=${encodeURIComponent(query)}&types=102`;
    const searchRes = await fetch(searchUrl, { headers });

    if (!searchRes.ok) {
      return { success: false, error: `MOJi API 响应异常 (HTTP ${searchRes.status})`, targetUrl, source: "moji" };
    }

    const searchData = await searchRes.json();
    const list = (searchData.word && searchData.word.list) ? searchData.word.list.slice(0, 3) : [];

    if (!list || list.length === 0) {
      return { success: true, source: "moji", query, targetUrl, words: [] };
    }

    const wordsDetailList = [];

    for (const item of list) {
      const targetId = item.targetId;
      if (!targetId) continue;

      try {
        const detailUrl = `https://api.mojidict.com/app/mojidict/api/v1/word/detailInfo?wordId=${targetId}`;
        const detailRes = await fetch(detailUrl, { headers });

        if (detailRes.ok) {
          const detailData = await detailRes.json();
          const wObj = detailData.word || {};
          const detailsArr = detailData.details || [];
          const subdetailsArr = detailData.subdetails || [];
          const examplesArr = detailData.examples || [];

          const zhSubdetails = subdetailsArr.filter(s => s.lang === "zh-CN" || s.lang === "zh");
          const formattedDetails = (zhSubdetails.length > 0)
            ? zhSubdetails.map(s => ({ title: "", text: s.title }))
            : (detailsArr.length > 0
                ? detailsArr.map(d => ({ title: d.title || "", text: d.detail || "" }))
                : [{ title: "", text: wObj.excerpt || item.excerpt || "" }]
              );

          const exampleMap = new Map();
          examplesArr.forEach(ex => {
            const relId = ex.relaId || ex._id;
            if (!exampleMap.has(relId)) {
              exampleMap.set(relId, { ja: "", zh: "" });
            }
            const pair = exampleMap.get(relId);
            if (ex.lang === "ja") pair.ja = ex.title;
            else pair.zh = ex.title;
          });

          const formattedExamples = Array.from(exampleMap.values())
            .filter(ex => ex.ja)
            .map(ex => ({ title: ex.ja, trans: ex.zh }));

          wordsDetailList.push({
            spell: wObj.spell || item.title || query,
            pronunc: wObj.pron || "",
            accent: wObj.accent || "",
            excerpt: wObj.excerpt || item.excerpt || "",
            details: formattedDetails,
            examples: formattedExamples.slice(0, 3)
          });
        }
      } catch (dErr) {
        console.warn("[Background] Fetch word detail error:", dErr);
      }
    }

    return { success: true, source: "moji", query, targetUrl, words: wordsDetailList };
  } catch (err) {
    console.error("[Background] MOJi search error:", err);
    return { success: false, error: "MOJi 辞書网络请求失败", targetUrl, source: "moji" };
  }
}


