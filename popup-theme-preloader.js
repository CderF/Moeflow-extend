/**
 * Moetran Plantation Helper - Popup Theme Preloader Script
 * Runs before initial paint in popup.html to apply data-mt-theme and avoid FOUC.
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

  // Listen to system OS theme changes when in 'system' mode
  if (window.matchMedia) {
    try {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
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
      // Ignore fallback errors
    }
  }
})();
