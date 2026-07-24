/**
 * Background Service Worker (Manifest V3)
 * Handles background statistics sync, message handling, and token management.
 */

import { getUserInfo, getUserProjects, calculateWorkStats, getPlantationTeamMemberRole, normalizeTeamRole, TEAM_PLANTATION_ID } from "./utils/moetranApi.js";

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
