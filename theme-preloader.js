/**
 * Moetran Plantation Helper - Theme Preloader Script
 * Runs at document_start to set data-mt-theme on html before initial paint (Anti-FOUC).
 */

(function () {
  function getEffectiveTheme(mode) {
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";
    // Default or 'system'
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

  // Initial fast check from chrome.storage.local
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["mt-theme-mode"], (result) => {
      const mode = result["mt-theme-mode"] || "system";
      applyTheme(mode);
    });
  } else {
    applyTheme("system");
  }

  // Listen to system OS theme changes
  if (window.matchMedia) {
    try {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = (e) => {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(["mt-theme-mode"], (res) => {
            const mode = res["mt-theme-mode"] || "system";
            if (mode === "system") {
              applyTheme("system");
            }
          });
        }
      };
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", onChange);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(onChange);
      }
    } catch (err) {
      // Media query listener unsupported fallback
    }
  }

  // Listen to extension storage changes across tabs
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes["mt-theme-mode"]) {
        const newMode = changes["mt-theme-mode"].newValue || "system";
        applyTheme(newMode);
      }
    });
  }
})();
