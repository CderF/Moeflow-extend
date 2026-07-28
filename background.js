/**
 * Background Service Worker (Manifest V3)
 * Handles background statistics sync, message handling, and token management.
 */

import { getUserInfo, getUserProjects, getTeamProjects, calculateWorkStats, getPlantationTeamMemberRole, normalizeTeamRole, getSingleProjectDetail, TEAM_PLANTATION_ID, buildFeishuRowsFromProjects, extractMangaName } from "./utils/moetranApi.js";
import { syncMangaToFeishu, saveFeishuConfig, getFeishuConfig } from "./utils/feishuSync.js";

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

        case "FETCH_MEME_WIKI": {
          const { query, wikiType } = message;
          if (!query || typeof query !== "string") {
            sendResponse({ success: false, error: "请输入需要查询的词汇" });
            break;
          }
          const trimmed = query.trim();
          if (wikiType === "pixiv") {
            const pixivResult = await fetchPixivDic(trimmed);
            sendResponse(pixivResult);
          } else {
            const moegirlResult = await fetchMoegirlWiki(trimmed);
            sendResponse(moegirlResult);
          }
          break;
        }

        case "SAVE_FEISHU_CONFIG": {
          const { config } = message;
          if (config) {
            await saveFeishuConfig(config);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: "未接收到有效的配置对象" });
          }
          break;
        }

        case "GET_FEISHU_CONFIG": {
          const cfg = await getFeishuConfig();
          sendResponse({ success: true, config: cfg });
          break;
        }

        case "SYNC_PROJECT_TO_FEISHU": {
          const { projectId } = message;
          if (!projectId) {
            sendResponse({ success: false, error: "未提供项目 ID" });
            break;
          }
          try {
            const allProjects = await getUserProjects(1, 100);
            const targetProj = allProjects.find(p => String(p.id || p._id) === String(projectId));
            if (!targetProj) {
              sendResponse({ success: false, error: "未找到指定的项目" });
              break;
            }

            const mangaName = extractMangaName(targetProj);
            const mangaProjects = allProjects.filter(p => extractMangaName(p) === mangaName);
            const rows = buildFeishuRowsFromProjects(mangaProjects);

            if (rows.length > 0) {
              const res = await syncMangaToFeishu(rows[0]);
              sendResponse({ success: true, result: res });
            } else {
              sendResponse({ success: false, error: "构建飞书行数据失败" });
            }
          } catch (syncErr) {
            console.warn("[Background] Sync single project to Feishu failed:", syncErr);
            sendResponse({ success: false, error: syncErr.message });
          }
          break;
        }

        case "SYNC_RECENT_TO_FEISHU": {
          try {
            const projects = await getUserProjects(1, 100);
            const recentProjects = projects.slice(0, 10);
            const rows = buildFeishuRowsFromProjects(recentProjects);

            if (!rows || rows.length === 0) {
              sendResponse({ success: false, error: "未找到任何待同步的项目" });
              break;
            }

            const results = [];
            let successCount = 0;
            let firstErrorMsg = "";

            for (const row of rows) {
              try {
                const res = await syncMangaToFeishu(row);
                results.push({ success: true, ...res });
                successCount++;
              } catch (e) {
                console.warn(`[Background] Failed to sync manga ${row.mangaName}:`, e);
                results.push({ success: false, mangaName: row.mangaName, error: e.message });
                if (!firstErrorMsg) firstErrorMsg = e.message;
              }
            }

            if (successCount > 0) {
              sendResponse({ success: true, syncedCount: successCount, totalCount: rows.length, results });
            } else {
              sendResponse({ success: false, error: firstErrorMsg || "同步失败，无法写入飞书表格", results });
            }
          } catch (syncErr) {
            console.error("[Background] Sync recent 10 projects to Feishu failed:", syncErr);
            sendResponse({ success: false, error: syncErr.message });
          }
          break;
        }

        case "BULK_SYNC_PLANTATION_TO_FEISHU": {
          try {
            const teamProjects = await getTeamProjects(TEAM_PLANTATION_ID, 1, 100);
            const rows = buildFeishuRowsFromProjects(teamProjects);

            if (!rows || rows.length === 0) {
              sendResponse({ success: false, error: "未在种植园汉化组找到任何项目" });
              break;
            }

            const results = [];
            let successCount = 0;
            let firstErrorMsg = "";

            for (const row of rows) {
              try {
                const res = await syncMangaToFeishu(row);
                results.push({ success: true, ...res });
                successCount++;
              } catch (e) {
                console.warn(`[Background] Failed to sync plantation manga ${row.mangaName}:`, e);
                results.push({ success: false, mangaName: row.mangaName, error: e.message });
                if (!firstErrorMsg) firstErrorMsg = e.message;
              }
            }

            if (successCount > 0) {
              sendResponse({ success: true, syncedCount: successCount, totalCount: rows.length, results });
            } else {
              sendResponse({ success: false, error: firstErrorMsg || "全量同步失败，无法写入飞书表格", results });
            }
          } catch (syncErr) {
            console.error("[Background] Bulk sync plantation projects to Feishu failed:", syncErr);
            sendResponse({ success: false, error: syncErr.message });
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

/**
 * Fetch entry summary & OGP from 萌娘百科 (Moegirl Wiki)
 */
async function fetchMoegirlWiki(query) {
  const targetUrl = `https://zh.moegirl.org.cn/index.php?search=${encodeURIComponent(query)}`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
  };

  try {
    const res = await fetch(targetUrl, { headers });
    if (!res.ok) {
      return { success: false, error: `萌娘百科请求失败 (HTTP ${res.status})`, targetUrl, source: "moegirl" };
    }

    const finalUrl = res.url || targetUrl;
    const htmlText = await res.text();

    // Extract title from <h1 id="firstHeading"> or <title>
    const titleMatch = htmlText.match(/<h1[^>]*id=["']firstHeading["'][^>]*>([\s\S]*?)<\/h1>/i) || htmlText.match(/<title>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : query;
    title = title.replace(/ - 萌娘百科.*$/, "").trim();

    // Extract OGP description or meta description
    const descMatch = htmlText.match(/<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["']([^"']+)["']/i);
    let extractText = descMatch ? descMatch[1].trim() : "";

    // Extract OGP image
    const imgMatch = htmlText.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
    let thumbnailUrl = imgMatch ? imgMatch[1].trim() : "";

    return {
      success: true,
      source: "moegirl",
      query,
      targetUrl: finalUrl,
      title: title || query,
      extract: extractText,
      thumbnail: thumbnailUrl,
      results: [{ title: title || query, url: finalUrl }]
    };
  } catch (err) {
    console.error("[Background] Moegirl search error:", err);
    return { success: false, error: "萌娘百科网络请求失败，请检查网络连接", targetUrl, source: "moegirl" };
  }
}

/**
 * Fetch article HTML & OGP from ピクシブ百科事典 (Pixiv Dic)
 */
async function fetchPixivDic(query) {
  const directUrl = `https://dic.pixiv.net/a/${encodeURIComponent(query)}`;
  const searchUrl = `https://dic.pixiv.net/search?query=${encodeURIComponent(query)}`;
  const headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,zh-CN,zh;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  try {
    let res = await fetch(directUrl, { headers });
    let finalUrl = directUrl;

    if (!res.ok) {
      finalUrl = searchUrl;
      res = await fetch(searchUrl, { headers });
    }

    if (!res.ok) {
      return { success: false, error: `Pixiv百科 请求失败 (HTTP ${res.status})`, targetUrl: searchUrl, source: "pixiv" };
    }

    const htmlText = await res.text();
    finalUrl = res.url || finalUrl;

    // Extract OGP title
    const titleMatch = htmlText.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i) || htmlText.match(/<title>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace(/ - 【ピクシブ百科事典】.*$/, "").trim() : query;

    // Extract OGP description
    const descMatch = htmlText.match(/<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["']([^"']+)["']/i);
    let description = descMatch ? descMatch[1].trim() : "";

    // Extract OGP image
    const imgMatch = htmlText.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
    let imageUrl = imgMatch ? imgMatch[1].replace(/&amp;/g, "&").trim() : "";

    return {
      success: true,
      source: "pixiv",
      html: htmlText,
      query,
      targetUrl: finalUrl,
      title: title || query,
      extract: description,
      thumbnail: imageUrl
    };
  } catch (err) {
    console.error("[Background] Fetch Pixiv Dic error:", err);
    return { success: false, error: "Pixiv百科网络请求失败，请检查网络连接", targetUrl: searchUrl, source: "pixiv" };
  }
}


