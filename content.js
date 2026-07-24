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

  // Convert avatar URL to Base64 in page context for 100% anti-hotlinking protection
  const sendProfileMessage = () => {
    if (token || (userProfile && (userProfile.name || userProfile.avatar))) {
      safeSendMessage({ type: "STORE_TOKEN", token, userProfile }, (res) => {
        if (res && res.success) {
          console.log("[种植园尨译助手] Auth token & user profile synced from page.");
        }
      });
    }
  };

  if (userProfile && userProfile.avatar && !userProfile.avatar.startsWith("data:image/")) {
    const rawAvatarUrl = userProfile.avatar;
    fetch(rawAvatarUrl)
      .then(res => res.ok ? res.blob() : null)
      .then(blob => {
        if (!blob) return null;
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result || null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      })
      .then(base64 => {
        if (base64 && base64.startsWith("data:image/")) {
          userProfile.avatar = base64;
        } else {
          try {
            const avatarImg = document.querySelector('img[src*="avatar"], header img, .avatar img, [class*="avatar"] img');
            if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
              const canvas = document.createElement("canvas");
              canvas.width = avatarImg.naturalWidth;
              canvas.height = avatarImg.naturalHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(avatarImg, 0, 0);
              const dataUrl = canvas.toDataURL("image/png");
              if (dataUrl && dataUrl.startsWith("data:image/")) {
                userProfile.avatar = dataUrl;
              }
            }
          } catch (e) {}
        }
        sendProfileMessage();
      })
      .catch(() => sendProfileMessage());
  } else {
    sendProfileMessage();
  }
}

/**
 * Safely send a message to the background script, handling disconnected extension context.
 */
function safeSendMessage(message, callback) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message;
          // Suppress benign warning when tab is closed/navigated before async response completes
          if (!errMsg.includes("message channel closed")) {
            console.warn("[种植园尨译助手] 消息发送警告:", errMsg);
          }
          if (callback) callback(null);
        } else {
          if (callback) callback(res);
        }
      });
    } catch (e) {
      console.warn("[种植园尨译助手] 扩展上下文已失效:", e);
      if (callback) callback(null);
    }
  } else {
    if (callback) callback(null);
  }
}

// 2. Inject In-Page Floating Widget — Main Capsule + Sub-Capsule Menu
function initFloatingWidget() {
  if (document.getElementById("mt-floating-widget-root")) return;

  const iconUrl      = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("img/icon.png")       : "";
  const iconWhiteUrl = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("img/icon-white.png") : "";

  const container = document.createElement("div");
  container.id = "mt-floating-widget-root";
  container.innerHTML = `
    <button class="mt-floating-trigger" id="mt-floating-trigger-btn">
      <div class="mt-icon-box">
        <img class="mt-icon-light" src="${iconUrl}" alt="Icon" />
        <img class="mt-icon-dark"  src="${iconWhiteUrl}" alt="Icon" />
      </div>
      <span id="mt-floating-btn-text">种植园尨译助手</span>
    </button>

    <!-- Sub-capsule menu: populated by JS from SUB_ACTIONS array -->
    <div class="mt-sub-menu" id="mt-sub-menu"></div>

    <!-- Level-2 Theme Options Menu (Horizontal Pill Group) -->
    <div class="mt-level2-menu" id="mt-theme-level2-menu">
      <button class="mt-level2-capsule" data-theme-mode="system" id="mt-theme-opt-system">
        <span class="mt-level2-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z"/></svg>
        </span>
        <span>跟随系统</span>
        <span class="mt-checkmark-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </span>
      </button>
      <button class="mt-level2-capsule" data-theme-mode="dark" id="mt-theme-opt-dark">
        <span class="mt-level2-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </span>
        <span>强制深色</span>
        <span class="mt-checkmark-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </span>
      </button>
      <button class="mt-level2-capsule" data-theme-mode="light" id="mt-theme-opt-light">
        <span class="mt-level2-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </span>
        <span>强制浅色</span>
        <span class="mt-checkmark-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </span>
      </button>
    </div>


    <!-- Stats modal: kept as-is, triggered via the stats sub-capsule -->
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
  const subMenu    = document.getElementById("mt-sub-menu");
  const modalBox   = document.getElementById("mt-stat-modal-box");
  const closeBtn   = document.getElementById("mt-modal-close-btn");
  const refreshBtn = document.getElementById("mt-refresh-btn");
  const copyBtn    = document.getElementById("mt-copy-report-btn");

  // --- Level-2 Theme Sub-capsule Manager ---
  const level2ThemeMenu = document.getElementById("mt-theme-level2-menu");

  function updateLevel2Checkmark(mode) {
    if (!level2ThemeMenu) return;
    const options = level2ThemeMenu.querySelectorAll(".mt-level2-capsule");
    options.forEach((opt) => {
      if (opt.getAttribute("data-theme-mode") === mode) {
        opt.classList.add("mt-selected");
      } else {
        opt.classList.remove("mt-selected");
      }
    });
  }

  function setSelectedThemeMode(mode) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ "mt-theme-mode": mode }, () => {
        updateLevel2Checkmark(mode);
      });
    } else {
      updateLevel2Checkmark(mode);
    }
  }

  function positionLevel2Menu(themeL1Btn, level2Menu) {
    if (!themeL1Btn || !level2Menu) return;
    const btnRect = themeL1Btn.getBoundingClientRect();
    const GAP = 8;
    const btnCenterX = btnRect.left + btnRect.width / 2;
    const isRightHalf = btnCenterX > window.innerWidth / 2;

    level2Menu.classList.remove("mt-side-left", "mt-side-right");

    if (isRightHalf) {
      // Main capsule on right -> expand to LEFT
      level2Menu.style.right = (window.innerWidth - btnRect.left + GAP) + "px";
      level2Menu.style.left = "auto";
      level2Menu.classList.add("mt-side-left");
    } else {
      // Main capsule on left -> expand to RIGHT
      level2Menu.style.left = (btnRect.right + GAP) + "px";
      level2Menu.style.right = "auto";
      level2Menu.classList.add("mt-side-right");
    }

    // Vertically align Level 2 with themeL1Btn
    const l2Height = level2Menu.offsetHeight || 36;
    const topPos = btnRect.top + (btnRect.height - l2Height) / 2;
    level2Menu.style.top = Math.max(8, Math.min(topPos, window.innerHeight - l2Height - 8)) + "px";
    level2Menu.style.bottom = "auto";
  }

  function openThemeLevel2Menu(themeL1Btn, level2Menu) {
    positionLevel2Menu(themeL1Btn, level2Menu);
    void level2Menu.offsetHeight; // Force reflow
    level2Menu.classList.add("mt-open");
    if (themeL1Btn) themeL1Btn.classList.add("mt-active-l1");
  }

  function closeThemeLevel2Menu(level2Menu) {
    if (!level2Menu) return;
    level2Menu.classList.remove("mt-open");
    const themeL1Btn = document.getElementById("mt-action-theme");
    if (themeL1Btn) themeL1Btn.classList.remove("mt-active-l1");
  }

  function toggleThemeLevel2Menu(themeL1Btn, level2Menu) {
    if (!level2Menu) return;
    const isOpen = level2Menu.classList.contains("mt-open");
    if (isOpen) {
      closeThemeLevel2Menu(level2Menu);
    } else {
      openThemeLevel2Menu(themeL1Btn, level2Menu);
    }
  }

  // --- Sub-actions configuration (data-driven for easy future extension) ---
  const openStatsPanel = () => {
    positionModal(triggerBtn, modalBox);
    modalBox.classList.add("mt-active");
    loadAndRenderStats();
  };

  const SUB_ACTIONS = [
    {
      id: "mt-action-theme",
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>`,
      label: "切换主题",
      handler: (btn) => toggleThemeLevel2Menu(btn, level2ThemeMenu),
    },
    {
      id: "mt-action-jdict",
      // Book icon — dictionary / reference
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
      label: "日语辞書",
      handler: () => console.log("[MT] TODO: 日语辞書查询"),
    },
    {
      id: "mt-action-stats",
      // Bar-chart icon — project stats
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
      label: "当前项目统计",
      handler: openStatsPanel,
    },
  ];

  // Build sub-capsule buttons from SUB_ACTIONS
  SUB_ACTIONS.forEach((action) => {
    const btn = document.createElement("button");
    btn.className = "mt-sub-capsule";
    btn.id = action.id;
    btn.innerHTML = `<span class="mt-sub-capsule-icon">${action.icon}</span><span class="mt-sub-capsule-label">${action.label}</span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // For Level 1 theme button, keep subMenu open so Level 2 can be displayed side-by-side
      if (action.id !== "mt-action-theme") {
        closeSubMenu(triggerBtn, subMenu);
      }
      action.handler(btn);
    });
    subMenu.appendChild(btn);
  });

  // Bind click listeners on Level 2 option pills
  if (level2ThemeMenu) {
    const opts = level2ThemeMenu.querySelectorAll(".mt-level2-capsule");
    opts.forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const mode = opt.getAttribute("data-theme-mode") || "system";
        setSelectedThemeMode(mode);
      });
    });
  }

  // Initialize active checkmark state from storage
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["mt-theme-mode"], (res) => {
      const mode = res["mt-theme-mode"] || "system";
      updateLevel2Checkmark(mode);
    });

    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes["mt-theme-mode"]) {
          const newMode = changes["mt-theme-mode"].newValue || "system";
          updateLevel2Checkmark(newMode);
        }
      });
    }
  } else {
    updateLevel2Checkmark("system");
  }



  // --- Position Initialization ---
  triggerBtn.style.left = (window.innerWidth - 200) + 'px';
  triggerBtn.style.top  = (window.innerHeight - 60) + 'px';
  chrome.storage.local.get('mt-widget-pos', (data) => {
    requestAnimationFrame(() => {
      const btnW = triggerBtn.offsetWidth  || 150;
      const btnH = triggerBtn.offsetHeight || 44;
      if (data && data['mt-widget-pos']) {
        const pos = data['mt-widget-pos'];
        triggerBtn.style.left = Math.max(0, Math.min(pos.left, window.innerWidth  - btnW)) + 'px';
        triggerBtn.style.top  = Math.max(0, Math.min(pos.top,  window.innerHeight - btnH)) + 'px';
      } else {
        triggerBtn.style.left = (window.innerWidth  - btnW - 24) + 'px';
        triggerBtn.style.top  = (window.innerHeight - btnH - 24) + 'px';
      }
    });
  });

  // --- Drag Behavior ---
  const drag = initDragBehavior(triggerBtn, subMenu, modalBox);

  // --- Main capsule click: toggle sub-capsule menu ---
  triggerBtn.addEventListener("click", () => {
    if (drag.wasDragging()) return;
    const isOpen = subMenu.classList.contains("mt-open");
    // Always close stats modal when toggling the menu
    modalBox.classList.remove("mt-active");
    if (isOpen) {
      closeSubMenu(triggerBtn, subMenu);
    } else {
      openSubMenu(triggerBtn, subMenu);
    }
  });

  // --- Close everything when clicking outside the widget ---
  document.addEventListener("click", (e) => {
    const isInsideWidget = triggerBtn.contains(e.target) ||
                           subMenu.contains(e.target) ||
                           (level2ThemeMenu && level2ThemeMenu.contains(e.target)) ||
                           (modalBox && modalBox.contains(e.target));
    console.log(`[Test Log] [Ext Click] Target: <${e.target.tagName} class="${e.target.className}">, isInsideWidget: ${isInsideWidget}`);
    if (!isInsideWidget) {
      closeSubMenu(triggerBtn, subMenu);
      if (modalBox && modalBox.classList.contains("mt-active")) modalBox.classList.remove("mt-active");
    }
  }, true);

  // --- Stats modal controls ---
  closeBtn.addEventListener("click", () => {
    modalBox.classList.remove("mt-active");
  });

  refreshBtn.addEventListener("click", () => {
    refreshBtn.innerHTML = `
      <svg class="mt-sf-icon" style="animation: sf-spin 1s infinite linear;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
        <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M2.5 16l1 1A10 10 0 0 0 22 12.5"/>
      </svg>
      刷新中
    `;
    safeSendMessage({ type: "FETCH_STATS" }, (res) => {
      refreshBtn.innerHTML = `
        <svg class="mt-sf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
          <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M2.5 16l1 1A10 10 0 0 0 22 12.5"/>
        </svg>
        刷新
      `;
      if (res && res.stats) renderStatsInModal(res.stats, res.userProfile);
    });
  });

  copyBtn.addEventListener("click", () => {
    safeSendMessage({ type: "GET_CACHED_STATS" }, (res) => {
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



/**
 * Handles drag-and-drop for the floating trigger button via Pointer Events.
 * Accepts subMenu to close it when a drag starts.
 * Uses a 5 px movement threshold to distinguish drag from click.
 * Persists the final position to chrome.storage.local on pointerup.
 * Returns { wasDragging() } so callers can suppress accidental click events.
 */
function initDragBehavior(triggerBtn, subMenu, modalBox) {
  const DRAG_THRESHOLD = 5;
  let startX, startY, startLeft, startTop;
  let isPointerDown    = false; // true only between pointerdown → pointerup
  let isDragging       = false;
  let dragJustHappened = false;

  triggerBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    startX       = e.clientX;
    startY       = e.clientY;
    startLeft    = parseFloat(triggerBtn.style.left) || 0;
    startTop     = parseFloat(triggerBtn.style.top)  || 0;
    isPointerDown    = true;
    isDragging       = false;
    dragJustHappened = false;
    triggerBtn.setPointerCapture(e.pointerId);
  });

  triggerBtn.addEventListener('pointermove', (e) => {
    // Guard: only process when the pointer was explicitly pressed down on this element
    if (!isPointerDown || !triggerBtn.hasPointerCapture(e.pointerId)) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!isDragging) {
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        isDragging       = true;
        dragJustHappened = true;
        triggerBtn.classList.add('mt-dragging');
        closeSubMenu(triggerBtn, subMenu);    // close menu on drag start
        modalBox.classList.remove('mt-active'); // close stats modal on drag start
      }
      return;
    }

    const btnW    = triggerBtn.offsetWidth;
    const btnH    = triggerBtn.offsetHeight;
    const newLeft = Math.max(0, Math.min(startLeft + dx, window.innerWidth  - btnW));
    const newTop  = Math.max(0, Math.min(startTop  + dy, window.innerHeight - btnH));
    triggerBtn.style.left = newLeft + 'px';
    triggerBtn.style.top  = newTop  + 'px';
  });

  const onRelease = () => {
    if (isDragging) {
      const left = parseFloat(triggerBtn.style.left);
      const top  = parseFloat(triggerBtn.style.top);
      chrome.storage.local.set({ 'mt-widget-pos': { left, top } });
    }
    triggerBtn.classList.remove('mt-dragging');
    isPointerDown = false;
    isDragging    = false;
  };

  triggerBtn.addEventListener('pointerup',     onRelease);
  triggerBtn.addEventListener('pointercancel', onRelease); // handles Escape / focus-loss

  // Clamp button within viewport on window resize
  window.addEventListener('resize', () => {
    const btnW    = triggerBtn.offsetWidth;
    const btnH    = triggerBtn.offsetHeight;
    const curLeft = parseFloat(triggerBtn.style.left) || 0;
    const curTop  = parseFloat(triggerBtn.style.top)  || 0;
    const cl = Math.max(0, Math.min(curLeft, window.innerWidth  - btnW));
    const ct = Math.max(0, Math.min(curTop,  window.innerHeight - btnH));
    if (cl !== curLeft) triggerBtn.style.left = cl + 'px';
    if (ct !== curTop)  triggerBtn.style.top  = ct + 'px';
  });

  return {
    wasDragging() {
      if (dragJustHappened) {
        dragJustHappened = false;
        return true;
      }
      return false;
    }
  };
}

/**
 * Dynamically positions the stat modal relative to the trigger button.
 *
 * Horizontal rule:
 *   Button in RIGHT half of screen → right-align modal (extends leftward, always visible)
 *   Button in LEFT  half of screen → left-align  modal (extends rightward, always visible)
 *
 * Vertical rule:
 *   Prefer above the button; fall back to below if insufficient space above.
 *
 * Also sets transform-origin so the open/close animation radiates from the correct corner.
 */
function positionModal(triggerBtn, modalBox) {
  const btnRect = triggerBtn.getBoundingClientRect();
  const GAP = 8;

  // Horizontal alignment
  const btnCenterX  = btnRect.left + btnRect.width / 2;
  const isRightHalf = btnCenterX > window.innerWidth / 2;

  if (isRightHalf) {
    modalBox.style.left  = 'auto';
    modalBox.style.right = (window.innerWidth - btnRect.right) + 'px';
  } else {
    modalBox.style.right = 'auto';
    modalBox.style.left  = btnRect.left + 'px';
  }

  // Vertical alignment
  const modalEstH  = Math.min(520, window.innerHeight - 48);
  const spaceAbove = btnRect.top;
  const originX    = isRightHalf ? 'right' : 'left';

  if (spaceAbove >= modalEstH + GAP) {
    // Enough room above → place above
    modalBox.style.bottom = (window.innerHeight - btnRect.top + GAP) + 'px';
    modalBox.style.top    = 'auto';
    modalBox.style.transformOrigin = `${originX} bottom`;
  } else {
    // Fall back to below
    modalBox.style.top    = (btnRect.bottom + GAP) + 'px';
    modalBox.style.bottom = 'auto';
    modalBox.style.transformOrigin = `${originX} top`;
  }
}

/**
 * Opens the sub-capsule menu.
 * Sets the expansion direction class, positions it, then adds mt-open to
 * trigger the CSS spring + stagger animation.
 * A forced reflow between positioning and adding mt-open ensures the initial
 * transform is applied before the transition begins.
 */
function openSubMenu(triggerBtn, subMenu) {
  const direction = getSubMenuDirection(triggerBtn);

  // Apply direction class first (sets the initial transform offset)
  subMenu.classList.remove('mt-direction-up', 'mt-direction-down');
  subMenu.classList.add(`mt-direction-${direction}`);

  positionSubMenu(triggerBtn, subMenu, direction);

  // Force reflow so the browser registers the initial transform before transition
  void subMenu.offsetHeight;

  subMenu.classList.add('mt-open');
  triggerBtn.classList.add('mt-menu-open');

  const btnText = document.getElementById('mt-floating-btn-text');
  if (btnText) btnText.textContent = '关闭';
}

/**
 * Closes the sub-capsule menu and restores the main capsule label.
 */
function closeSubMenu(triggerBtn, subMenu) {
  const btn = triggerBtn || document.getElementById('mt-floating-trigger-btn');
  const menu = subMenu || document.getElementById('mt-sub-menu');

  if (menu) menu.classList.remove('mt-open');
  if (btn) btn.classList.remove('mt-menu-open');

  const level2ThemeMenu = document.getElementById('mt-theme-level2-menu');
  if (level2ThemeMenu) {
    level2ThemeMenu.classList.remove("mt-open");
    const themeL1Btn = document.getElementById("mt-action-theme");
    if (themeL1Btn) themeL1Btn.classList.remove("mt-active-l1");
  }

  const btnText = document.getElementById('mt-floating-btn-text');
  if (btnText) btnText.textContent = '种植园尨译助手';
}

/**
 * Determines whether the sub-menu should expand upward or downward based on
 * the vertical center of the main capsule relative to the viewport.
 * @returns {'up' | 'down'}
 */
function getSubMenuDirection(triggerBtn) {
  const btnRect  = triggerBtn.getBoundingClientRect();
  const btnCenterY = btnRect.top + btnRect.height / 2;
  return btnCenterY > window.innerHeight / 2 ? 'up' : 'down';
}

/**
 * Positions the sub-menu container (fixed) relative to the trigger button.
 *
 * Vertical: places above or below the trigger with an 8 px gap.
 * Horizontal: mirrors positionModal logic (right-aligned if button is in
 *   right half of screen, left-aligned otherwise), clamped 2 px from edges.
 *
 * @param {'up'|'down'} direction
 */
function positionSubMenu(triggerBtn, subMenu, direction) {
  const btnRect  = triggerBtn.getBoundingClientRect();
  const GAP  = 8;
  const EDGE = 2;

  // Vertical
  if (direction === 'up') {
    subMenu.style.bottom = (window.innerHeight - btnRect.top + GAP) + 'px';
    subMenu.style.top    = 'auto';
  } else {
    subMenu.style.top    = (btnRect.bottom + GAP) + 'px';
    subMenu.style.bottom = 'auto';
  }

  // Horizontal (same anchor logic as positionModal)
  const btnCenterX  = btnRect.left + btnRect.width / 2;
  const isRightHalf = btnCenterX > window.innerWidth / 2;

  if (isRightHalf) {
    const rightDist = window.innerWidth - btnRect.right;
    subMenu.style.right = Math.max(EDGE, rightDist) + 'px';
    subMenu.style.left  = 'auto';
  } else {
    subMenu.style.left  = Math.max(EDGE, btnRect.left) + 'px';
    subMenu.style.right = 'auto';
  }
}

function loadAndRenderStats() {
  safeSendMessage({ type: "GET_CACHED_STATS" }, (res) => {
    if (res && res.stats) {
      renderStatsInModal(res.stats, res.userProfile);
    } else {
      safeSendMessage({ type: "FETCH_STATS" }, (fetchRes) => {
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