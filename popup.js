import { getUserInfo, getUserProjects, calculateWorkStats } from "./utils/moetranApi.js";

document.addEventListener("DOMContentLoaded", () => {
  const btnRefresh = document.getElementById("btn-refresh-popup");
  const btnDashboard = document.getElementById("btn-open-dashboard");
  const btnCopyReport = document.getElementById("btn-copy-report");
  const copyBtnText = document.getElementById("copy-btn-text");
  const btnToggleDiag = document.getElementById("btn-toggle-diagnostic");
  const btnRunDiag = document.getElementById("btn-run-diagnostic");
  const diagBox = document.getElementById("diagnostic-panel-box");
  const diagArrow = document.getElementById("diagnostic-arrow");

  // Initial load
  loadStats();

  // Diagnostic toggle
  if (btnToggleDiag && diagBox) {
    btnToggleDiag.addEventListener("click", () => {
      const isHidden = diagBox.style.display === "none";
      diagBox.style.display = isHidden ? "flex" : "none";
      if (diagArrow) {
        if (isHidden) {
          diagArrow.classList.add("is-open");
        } else {
          diagArrow.classList.remove("is-open");
        }
      }
    });
  }

  if (btnRunDiag) {
    btnRunDiag.addEventListener("click", () => {
      runDiagnosticSuite();
    });
  }

  // Refresh handler
  btnRefresh.addEventListener("click", () => {
    btnRefresh.classList.add("is-refreshing");
    btnRefresh.disabled = true;

    chrome.runtime.sendMessage({ type: "FETCH_STATS" }, (res) => {
      btnRefresh.classList.remove("is-refreshing");
      btnRefresh.disabled = false;

      if (res && res.success && res.stats) {
        renderStats(res.stats, res.userProfile);
      } else {
        console.warn("Refresh stats error:", res ? res.error : "Unknown error");
        chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (cacheRes) => {
          if (cacheRes && cacheRes.stats && cacheRes.userProfile) {
            renderStats(cacheRes.stats, cacheRes.userProfile);
          } else {
            renderErrorState(res ? res.error : "未检测到登录状态");
          }
        });
      }
    });
  });

  // Open Dashboard handler
  btnDashboard.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://moetran.com/dashboard/projects" });
  });

  // Copy report handler
  btnCopyReport.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (res) => {
      if (res && res.stats) {
        const text = generateReportText(res.stats, res.userProfile);
        navigator.clipboard.writeText(text).then(() => {
          const targetElem = copyBtnText || btnCopyReport;
          const origText = targetElem.innerText;
          targetElem.innerText = "已复制简报！";
          setTimeout(() => {
            targetElem.innerText = origText;
          }, 2000);
        });
      }
    });
  });
});

function loadStats() {
  chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (res) => {
    if (res && res.stats && res.userProfile) {
      renderStats(res.stats, res.userProfile);
    } else {
      // Trigger fresh fetch
      chrome.runtime.sendMessage({ type: "FETCH_STATS" }, (fetchRes) => {
        if (fetchRes && fetchRes.success && fetchRes.stats) {
          renderStats(fetchRes.stats, fetchRes.userProfile);
        } else if (res && res.stats && res.userProfile) {
          renderStats(res.stats, res.userProfile);
        } else {
          renderErrorState(fetchRes ? fetchRes.error : "未检测到登录状态");
        }
      });
    }
  });
}

function renderErrorState(errorMessage = "未检测到登录状态") {
  const userNameElem = document.getElementById("user-name-text");
  const userAvatarElem = document.getElementById("user-avatar-text");
  const container = document.getElementById("project-list-container");

  if (userNameElem) userNameElem.innerText = "未登录 Moetran 账号";
  if (userAvatarElem) {
    userAvatarElem.innerHTML = `
      <svg class="sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 2l-2 2m-2-2l2 2M3 7v6h6"></path>
        <circle cx="7.5" cy="7.5" r="4.5"></circle>
      </svg>
    `;
  }

  document.getElementById("stat-total-projects").innerText = "0";
  document.getElementById("stat-plantation-projects").innerText = "种植园 0 个";
  document.getElementById("stat-translated-count").innerText = "0";
  document.getElementById("stat-translation-rate").innerText = "完成率 0%";
  document.getElementById("stat-checked-count").innerText = "0";
  document.getElementById("stat-checked-rate").innerText = "完成率 0%";
  document.getElementById("stat-active-projects").innerText = "0";
  document.getElementById("stat-finished-projects").innerText = "进行中 / 已完成 0";

  container.innerHTML = `
    <div style="text-align:center; padding: 20px 14px; background: var(--sf-card-bg); border-radius: 14px; border: 1px solid var(--sf-border); box-shadow: var(--sf-shadow);">
      <div style="font-size: 13px; font-weight: 600; color: var(--sf-text-primary); margin-bottom: 4px;">${errorMessage}</div>
      <div style="font-size: 11px; color: var(--sf-text-secondary); margin-bottom: 12px; line-height: 1.5;">
        请先在浏览器中打开并登录 <b style="color:var(--sf-blue);">moetran.com</b> 网页。
      </div>
      <button id="btn-login-now" class="btn btn-primary" style="margin: 0 auto; width: fit-content; padding: 8px 16px;">
        <svg class="sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
        </svg>
        打开 Moetran 网页登录
      </button>
    </div>
  `;

  const btnLogin = document.getElementById("btn-login-now");
  if (btnLogin) {
    btnLogin.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://moetran.com/login" });
    });
  }
}

function renderStats(stats, userProfile) {
  const userNameElem = document.getElementById("user-name-text");
  const userAvatarElem = document.getElementById("user-avatar-text");

  if (userProfile && userProfile.name) {
    userNameElem.innerText = userProfile.name;
    userAvatarElem.innerHTML = `<img src="img/icon.png" alt="Icon" />`;
  } else {
    userNameElem.innerText = "未登录 / 游客";
    userAvatarElem.innerHTML = `<img src="img/icon.png" alt="Icon" />`;
  }

  document.getElementById("stat-total-projects").innerText = stats.totalProjects || 0;
  document.getElementById("stat-plantation-projects").innerText = `种植园 ${stats.plantationProjects || 0} 个`;
  
  document.getElementById("stat-translated-count").innerText = stats.totalTranslated || 0;
  document.getElementById("stat-translation-rate").innerText = `完成率 ${stats.overallTranslationProgress || 0}%`;
  
  document.getElementById("stat-checked-count").innerText = stats.totalChecked || 0;
  document.getElementById("stat-checked-rate").innerText = `完成率 ${stats.overallProofreadProgress || 0}%`;
  
  document.getElementById("stat-active-projects").innerText = `${stats.activeProjects || 0}`;
  document.getElementById("stat-finished-projects").innerText = `进行中 / 已完成 ${stats.finishedProjects || 0}`;

  if (stats.lastRefreshedAt) {
    const timeStr = new Date(stats.lastRefreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById("last-sync-label").innerText = `更新于 ${timeStr}`;
  }

  // Render project list
  const container = document.getElementById("project-list-container");
  if (!stats.projectList || stats.projectList.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--sf-text-tertiary); padding:16px 0; font-size:12px;">暂无参与的项目数据</div>`;
    return;
  }

  container.innerHTML = stats.projectList.map(proj => {
    const displayTitle = proj.fullTitle || `${proj.teamName || '个人项目'} - ${proj.name}`;
    return `
    <div class="project-item">
      <div class="project-header">
        <span class="project-name" title="${displayTitle}">${displayTitle}</span>
        ${proj.isPlantation ? '<span class="p-tag p-tag-plantation">🌱 种植园</span>' : ''}
      </div>

      <div class="progress-group">
        <div class="progress-label">
          <span>翻译进度 (${proj.translatedCount}/${proj.sourceCount})</span>
          <span>${proj.translationProgress}%</span>
        </div>
        <div class="progress-bg">
          <div class="progress-fill" style="width: ${proj.translationProgress}%;"></div>
        </div>
      </div>

      <div class="progress-group">
        <div class="progress-label">
          <span>校对进度 (${proj.checkedCount}/${proj.sourceCount})</span>
          <span>${proj.proofreadProgress}%</span>
        </div>
        <div class="progress-bg">
          <div class="progress-fill progress-fill-proofread" style="width: ${proj.proofreadProgress}%;"></div>
        </div>
      </div>
    </div>
  `;
  }).join("");
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

