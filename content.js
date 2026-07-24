/**
 * Moetran Plantation Helper - Content Script
 * Injected into https://moetran.com/dashboard/*
 */

console.log("[种植园尨译助手] Content script loaded on Moetran Dashboard.");

function syncAuthToken() {
  let token = null;
  const jwtRegex = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/;

  const scanStorage = (storage) => {
    try {
      if (!storage) return null;
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        const val = storage.getItem(k);
        if (val && typeof val === "string" && val.includes("eyJ")) {
          const match = val.match(jwtRegex);
          if (match) return match[0];
        }
      }
    } catch (e) {}
    return null;
  };

  token = scanStorage(localStorage) || scanStorage(sessionStorage);

  if (!token) {
    const cookies = document.cookie.split(";");
    for (const c of cookies) {
      if (c.includes("eyJ")) {
        const match = c.match(jwtRegex);
        if (match) {
          token = match[0];
          break;
        }
      }
    }
  }

  // 2. User profile extraction from localStorage or DOM
  let userProfile = null;
  try {
    const rawUser = localStorage.getItem("user") || localStorage.getItem("userInfo") || localStorage.getItem("user_info");
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      userProfile = {
        name: parsed.name || parsed.nickname || parsed.username || parsed.email || "",
        avatar: parsed.avatar || parsed.avatar_url || parsed.avatarUrl || ""
      };
    }
  } catch (e) {
    // Ignore JSON parse error
  }

  // Fallback to DOM elements if userProfile avatar or name missing
  if (!userProfile || !userProfile.avatar || !userProfile.name) {
    const avatarImg = document.querySelector('img[src*="avatar"], header img, .avatar img, [class*="avatar"] img');
    const nameElem = document.querySelector('.user-name, .username, header [class*="name"], .user-info span');
    
    if (avatarImg || nameElem) {
      userProfile = {
        name: (userProfile && userProfile.name) ? userProfile.name : (nameElem ? nameElem.innerText.trim() : ""),
        avatar: (userProfile && userProfile.avatar) ? userProfile.avatar : (avatarImg ? avatarImg.src : "")
      };
    }
  }

  if (token || (userProfile && (userProfile.name || userProfile.avatar))) {
    chrome.runtime.sendMessage({ type: "STORE_TOKEN", token, userProfile }, (res) => {
      if (res && res.success) {
        console.log("[种植园尨译助手] Auth token & user profile synced from page.");
      }
    });
  }
}

// 2. Inject In-Page Floating Stat Badge Widget (iOS Dynamic Island & Capsule Style)
function initFloatingWidget() {
  if (document.getElementById("mt-floating-widget-root")) return;

  const iconUrl = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("img/icon.png") : "";
  const iconWhiteUrl = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("img/icon-white.png") : "";

  const container = document.createElement("div");
  container.id = "mt-floating-widget-root";
  container.innerHTML = `
    <button class="mt-floating-trigger" id="mt-floating-trigger-btn">
      <div class="mt-icon-box">
        <img class="mt-icon-light" src="${iconUrl}" alt="Icon" />
        <img class="mt-icon-dark" src="${iconWhiteUrl}" alt="Icon White" />
      </div>
      <span id="mt-floating-btn-text">种植园助手</span>
    </button>

    <div class="mt-stat-modal" id="mt-stat-modal-box">
      <div class="mt-modal-header">
        <div class="mt-modal-title">
          <span id="mt-modal-title-text">
            <svg class="mt-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
            </svg>
            种植园汉化组 - 工作统计
          </span>
        </div>
        <button class="mt-modal-close" id="mt-modal-close-btn">&times;</button>
      </div>

      <div class="mt-modal-body" id="mt-modal-body-content">
        <div style="text-align:center; padding: 24px 0; color:var(--mt-text-sub); font-size: 13px;">
          加载统计数据中...
        </div>
      </div>

      <div class="mt-modal-footer">
        <button class="mt-btn mt-btn-secondary" id="mt-refresh-btn">
          <svg class="mt-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
            <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M2.5 16l1 1A10 10 0 0 0 22 12.5"/>
          </svg>
          刷新
        </button>
        <button class="mt-btn mt-btn-primary" id="mt-copy-report-btn">
          <svg class="mt-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
          </svg>
          复制简报
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  const triggerBtn = document.getElementById("mt-floating-trigger-btn");
  const modalBox = document.getElementById("mt-stat-modal-box");
  const closeBtn = document.getElementById("mt-modal-close-btn");
  const refreshBtn = document.getElementById("mt-refresh-btn");
  const copyBtn = document.getElementById("mt-copy-report-btn");

  // Toggle modal visibility
  triggerBtn.addEventListener("click", () => {
    modalBox.classList.toggle("mt-active");
    if (modalBox.classList.contains("mt-active")) {
      loadAndRenderStats();
    }
  });

  closeBtn.addEventListener("click", () => {
    modalBox.classList.remove("mt-active");
  });

  // Auto-close modal when clicking anywhere outside on the webpage
  document.addEventListener("click", (e) => {
    if (modalBox.classList.contains("mt-active")) {
      if (!container.contains(e.target)) {
        modalBox.classList.remove("mt-active");
      }
    }
  });


  refreshBtn.addEventListener("click", () => {
    refreshBtn.innerHTML = `
      <svg class="mt-sf-icon" style="animation: sf-spin 1s infinite linear;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
        <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M2.5 16l1 1A10 10 0 0 0 22 12.5"/>
      </svg>
      刷新中
    `;
    chrome.runtime.sendMessage({ type: "FETCH_STATS" }, (res) => {
      refreshBtn.innerHTML = `
        <svg class="mt-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
          <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M2.5 16l1 1A10 10 0 0 0 22 12.5"/>
        </svg>
        刷新
      `;
      if (res && res.stats) {
        renderStatsInModal(res.stats, res.userProfile);
      }
    });
  });

  copyBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (res) => {
      if (res && res.stats) {
        const text = generateReportText(res.stats, res.userProfile);
        navigator.clipboard.writeText(text).then(() => {
          const orig = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg class="mt-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            已复制！
          `;
          setTimeout(() => { copyBtn.innerHTML = orig; }, 2000);
        });
      }
    });
  });
}

function loadAndRenderStats() {
  chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (res) => {
    if (res && res.stats) {
      renderStatsInModal(res.stats, res.userProfile);
    } else {
      chrome.runtime.sendMessage({ type: "FETCH_STATS" }, (fetchRes) => {
        if (fetchRes && fetchRes.stats) {
          renderStatsInModal(fetchRes.stats, fetchRes.userProfile);
        }
      });
    }
  });
}

function renderStatsInModal(stats, userProfile) {
  const body = document.getElementById("mt-modal-body-content");
  const titleText = document.getElementById("mt-modal-title-text");
  if (!body) return;

  const titleName = (userProfile && userProfile.name) ? userProfile.name : "种植园汉化组";
  titleText.innerHTML = `
    <svg class="mt-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
    </svg>
    ${titleName} - 工作统计
  `;

  body.innerHTML = `
    <div class="mt-stats-grid">
      <div class="mt-stat-card">
        <span class="mt-stat-label">参与项目总数</span>
        <span class="mt-stat-value">${stats.totalProjects || 0}</span>
      </div>
      <div class="mt-stat-card">
        <span class="mt-stat-label">种植园项目</span>
        <span class="mt-stat-value" style="color: var(--mt-sf-blue);">${stats.plantationProjects || 0}</span>
      </div>
      <div class="mt-stat-card">
        <span class="mt-stat-label">已完成/进行中</span>
        <span class="mt-stat-value" style="color: var(--mt-sf-green);">${stats.finishedProjects || 0}/${stats.activeProjects || 0}</span>
      </div>
      <div class="mt-stat-card">
        <span class="mt-stat-label">翻译完成度</span>
        <span class="mt-stat-value" style="color: #AF52DE;">${stats.overallTranslationProgress || 0}%</span>
      </div>
    </div>

    <div class="mt-progress-wrapper">
      <div class="mt-progress-header">
        <span>总体翻译完成度 (${stats.totalTranslated || 0}/${stats.totalSources || 0})</span>
        <span>${stats.overallTranslationProgress || 0}%</span>
      </div>
      <div class="mt-progress-bar-bg">
        <div class="mt-progress-bar-fill" style="width: ${stats.overallTranslationProgress || 0}%;"></div>
      </div>
    </div>

    <div class="mt-progress-wrapper">
      <div class="mt-progress-header">
        <span>总体校对完成度 (${stats.totalChecked || 0}/${stats.totalSources || 0})</span>
        <span>${stats.overallProofreadProgress || 0}%</span>
      </div>
      <div class="mt-progress-bar-bg">
        <div class="mt-progress-bar-fill mt-progress-bar-proofread" style="width: ${stats.overallProofreadProgress || 0}%;"></div>
      </div>
    </div>
  `;
}

function generateReportText(stats, userProfile) {
  const nameStr = userProfile && userProfile.name ? ` (${userProfile.name})` : "";
  return `【🌱 种植园汉化组 - 个人工作简报${nameStr}】\n` +
         `------------------------------\n` +
         `📊 参与项目总数：${stats.totalProjects} 个 (种植园项目 ${stats.plantationProjects} 个)\n` +
         `🟢 进行中项目：${stats.activeProjects} | 🏁 已完成项目：${stats.finishedProjects}\n` +
         `📝 翻译总句数：${stats.totalTranslated} / ${stats.totalSources} (${stats.overallTranslationProgress}%)\n` +
         `🔍 校对总句数：${stats.totalChecked} / ${stats.totalSources} (${stats.overallProofreadProgress}%)\n` +
         `------------------------------\n` +
         `发送自：种植园尨译助手 🚀`;
}

// Execute on load
syncAuthToken();
initFloatingWidget();