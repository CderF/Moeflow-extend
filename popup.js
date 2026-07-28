import { getUserInfo, getUserProjects, calculateWorkStats } from "./utils/moetranApi.js";

document.addEventListener("DOMContentLoaded", () => {
  const btnRefresh = document.getElementById("btn-refresh-popup");
  const btnSyncFeishu = document.getElementById("btn-sync-feishu");
  const syncBtnText = document.getElementById("sync-feishu-btn-text");
  const btnCopyReport = document.getElementById("btn-copy-report");
  const copyBtnText = document.getElementById("copy-btn-text");
  const btnToggleDiag = document.getElementById("btn-toggle-diagnostic");
  const btnRunDiag = document.getElementById("btn-run-diagnostic");
  const diagBox = document.getElementById("diagnostic-panel-box");
  const diagArrow = document.getElementById("diagnostic-arrow");

  // Initial load
  loadStats();

  // Real-time Theme Storage Synchronization
  function getEffectiveTheme(mode) {
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";
    const isSysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return isSysDark ? "dark" : "light";
  }

  function applyTheme(mode) {
    const theme = getEffectiveTheme(mode);
    if (document.documentElement) {
      document.documentElement.setAttribute("data-mt-theme", theme);
      document.documentElement.setAttribute("data-mt-mode", mode || "system");
    }
  }

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes["mt-theme-mode"]) {
        applyTheme(changes["mt-theme-mode"].newValue);
      }
    });
  }

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

    if (chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({ type: "FETCH_STATS" }, (res) => {
        if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
        btnRefresh.classList.remove("is-refreshing");
        btnRefresh.disabled = false;

        if (res && res.success && res.stats) {
          renderStats(res.stats, res.userProfile);
        } else {
          console.warn("Refresh stats error:", res ? res.error : "Unknown error");
          chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (cacheRes) => {
            if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
            if (cacheRes && cacheRes.stats && cacheRes.userProfile) {
              renderStats(cacheRes.stats, cacheRes.userProfile);
            } else {
              renderErrorState(res ? res.error : "未检测到登录状态");
            }
          });
        }
      });
    } else {
      btnRefresh.classList.remove("is-refreshing");
      btnRefresh.disabled = false;
    }
  });

  // Feishu Settings Elements & Handlers
  const btnToggleFeishuConfig = document.getElementById("btn-toggle-feishu-config");
  const feishuConfigBox = document.getElementById("feishu-config-box");
  const feishuConfigArrow = document.getElementById("feishu-config-arrow");
  const inputAppId = document.getElementById("feishu-app-id");
  const inputAppSecret = document.getElementById("feishu-app-secret");
  const btnSaveFeishuCfg = document.getElementById("btn-save-feishu-cfg");
  const btnBulkSyncPlantation = document.getElementById("btn-bulk-sync-plantation");
  const feishuCfgStatus = document.getElementById("feishu-cfg-status");

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
    chrome.runtime.sendMessage({ type: "GET_FEISHU_CONFIG" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.success && res.config) {
        if (inputAppId && res.config.appId) inputAppId.value = res.config.appId;
        if (inputAppSecret && res.config.appSecret) inputAppSecret.value = res.config.appSecret;
      }
    });
  }

  if (btnToggleFeishuConfig && feishuConfigBox) {
    btnToggleFeishuConfig.addEventListener("click", () => {
      const isHidden = feishuConfigBox.style.display === "none";
      feishuConfigBox.style.display = isHidden ? "flex" : "none";
      if (feishuConfigArrow) {
        if (isHidden) feishuConfigArrow.classList.add("is-open");
        else feishuConfigArrow.classList.remove("is-open");
      }
    });
  }

  if (btnSaveFeishuCfg) {
    btnSaveFeishuCfg.addEventListener("click", () => {
      const appId = inputAppId ? inputAppId.value.trim() : "";
      const appSecret = inputAppSecret ? inputAppSecret.value.trim() : "";

      btnSaveFeishuCfg.disabled = true;
      if (feishuCfgStatus) feishuCfgStatus.textContent = "保存中...";

      chrome.runtime.sendMessage({
        type: "SAVE_FEISHU_CONFIG",
        config: { appId, appSecret }
      }, (res) => {
        btnSaveFeishuCfg.disabled = false;
        if (res && res.success) {
          if (feishuCfgStatus) feishuCfgStatus.textContent = "✅ 配置已成功保存！";
          setTimeout(() => { if (feishuCfgStatus) feishuCfgStatus.textContent = ""; }, 3000);
        } else {
          if (feishuCfgStatus) feishuCfgStatus.textContent = "❌ 保存失败: " + (res?.error || "未知错误");
        }
      });
    });
  }

  if (btnSyncFeishu) {
    btnSyncFeishu.addEventListener("click", () => {
      btnSyncFeishu.disabled = true;
      if (syncBtnText) syncBtnText.textContent = "正在同步...";

      chrome.runtime.sendMessage({ type: "SYNC_RECENT_TO_FEISHU" }, (res) => {
        btnSyncFeishu.disabled = false;
        if (res && res.success) {
          if (syncBtnText) syncBtnText.textContent = `已更新 ${res.syncedCount || 0} 个漫画`;
          setTimeout(() => { if (syncBtnText) syncBtnText.textContent = "更新进度"; }, 3500);
        } else {
          if (syncBtnText) syncBtnText.textContent = "同步失败";
          alert("同步到飞书失败: " + (res?.error || "未知错误，请先检查飞书配置凭证"));
          setTimeout(() => { if (syncBtnText) syncBtnText.textContent = "更新进度"; }, 3500);
        }
      });
    });
  }

  if (btnBulkSyncPlantation) {
    btnBulkSyncPlantation.addEventListener("click", () => {
      if (!confirm("确定抓取种植园汉化组的所有项目全量同步到飞书表格吗？")) return;

      btnBulkSyncPlantation.disabled = true;
      if (feishuCfgStatus) feishuCfgStatus.textContent = "正在抓取全量项目并导入飞书...";

      chrome.runtime.sendMessage({ type: "BULK_SYNC_PLANTATION_TO_FEISHU" }, (res) => {
        btnBulkSyncPlantation.disabled = false;
        if (res && res.success) {
          if (feishuCfgStatus) feishuCfgStatus.textContent = `🎉 成功完成初始全量导入！共同步 ${res.syncedCount || 0} 个漫画项目`;
        } else {
          if (feishuCfgStatus) feishuCfgStatus.textContent = "❌ 全量导入失败: " + (res?.error || "未知错误");
        }
      });
    });
  }

  // Project item card click delegation
  const projectListContainer = document.getElementById("project-list-container");
  if (projectListContainer) {
    projectListContainer.addEventListener("click", (e) => {
      const card = e.target.closest(".clickable-project-card");
      if (!card) return;
      const projId = card.getAttribute("data-project-id");
      if (!projId) return;

      const targetUrl = `https://moetran.com/dashboard/projects/${projId}`;
      if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.query({ url: ["https://moetran.com/*", "https://*.moetran.com/*"] }, (tabs) => {
          if (tabs && tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { url: targetUrl, active: true }, () => {
              if (chrome.windows) {
                chrome.windows.update(tabs[0].windowId, { focused: true });
              }
            });
          } else {
            chrome.tabs.create({ url: targetUrl });
          }
        });
      } else {
        window.open(targetUrl, "_blank");
      }
    });
  }

  // Copy report handler
  btnCopyReport.addEventListener("click", () => {
    if (chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn(chrome.runtime.lastError.message);
          return;
        }
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
    }
  });
});

function loadStats() {
  if (chrome.runtime && chrome.runtime.id) {
    chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (res) => {
      if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
      if (res && res.stats && res.userProfile) {
        renderStats(res.stats, res.userProfile);
      } else {
        // Trigger fresh fetch
        chrome.runtime.sendMessage({ type: "FETCH_STATS" }, (fetchRes) => {
          if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
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
  } else {
    renderErrorState("扩展上下文已失效，请刷新页面");
  }
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
    const roleText = userProfile.teamRole || stats.plantationRole || "成员";
    userNameElem.innerHTML = `
      <span>${userProfile.name}</span>
      <span class="user-role-badge">${roleText}</span>
    `;
    const avatarSrc = userProfile.avatar && typeof userProfile.avatar === "string" ? userProfile.avatar.trim() : "";
    if (avatarSrc) {
      userAvatarElem.innerHTML = `<img src="${avatarSrc}" alt="Avatar" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      const imgElem = userAvatarElem.querySelector('img');
      if (imgElem) {
        imgElem.addEventListener("error", function() {
          userAvatarElem.innerHTML = `<img class="icon-light" src="img/icon.png" alt="Icon" /><img class="icon-dark" src="img/icon-white.png" alt="Icon White" />`;
        }, { once: true });
      }
    } else {
      userAvatarElem.innerHTML = `<img class="icon-light" src="img/icon.png" alt="Icon" /><img class="icon-dark" src="img/icon-white.png" alt="Icon White" />`;
    }
  } else {
    userNameElem.innerText = "未登录 / 游客";
    userAvatarElem.innerHTML = `<img class="icon-light" src="img/icon.png" alt="Icon" /><img class="icon-dark" src="img/icon-white.png" alt="Icon White" />`;
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
    <div class="project-item clickable-project-card" data-project-id="${proj.id}" title="点击在网页中打开该项目：${displayTitle}">
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

function runDiagnosticSuite() {
  const diagBox = document.getElementById("diagnostic-panel-box");
  if (!diagBox) return;
  
  let output = diagBox.querySelector(".diag-output");
  if (!output) {
    output = document.createElement("div");
    output.className = "diag-output";
    output.style.marginTop = "10px";
    output.style.fontSize = "11px";
    output.style.color = "var(--sf-text-secondary)";
    output.style.wordBreak = "break-all";
    diagBox.appendChild(output);
  }
  
  output.innerHTML = "正在运行诊断...<br>";
  
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
    chrome.runtime.sendMessage({ type: "GET_CACHED_STATS" }, (res) => {
      if (chrome.runtime.lastError) {
        output.innerHTML += `<span style="color:var(--sf-red)">错误: ${chrome.runtime.lastError.message}</span><br>`;
        return;
      }
      if (res && res.stats) {
        output.innerHTML += `<span style="color:var(--sf-green)">缓存状态: 正常 (${res.stats.totalProjects}个项目)</span><br>`;
      } else {
        output.innerHTML += `<span style="color:var(--sf-orange)">缓存状态: 无数据</span><br>`;
      }
      
      if (res && res.userProfile) {
        output.innerHTML += `<span style="color:var(--sf-green)">用户状态: 已获取 (${res.userProfile.name})</span><br>`;
      } else {
        output.innerHTML += `<span style="color:var(--sf-orange)">用户状态: 未获取</span><br>`;
      }
      
      output.innerHTML += "诊断完成。";
    });
  } else {
    output.innerHTML += `<span style="color:var(--sf-red)">扩展上下文失效，请刷新页面。</span><br>`;
  }
}

