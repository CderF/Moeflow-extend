/**
 * Moetran API Service Module
 * Handles interactions with https://api.moetran.com
 */

const API_BASE_URL = "https://api.moetran.com";
export const TEAM_PLANTATION_ID = "6500669ca33c76075e705f00"; // 种植园汉化组 Team ID

/**
 * Get active auth token from chrome.cookies or chrome.storage
 */
async function getAuthToken() {
  // 1. Try reading from chrome.storage.local
  if (typeof chrome !== "undefined" && chrome.storage) {
    const { userToken } = await chrome.storage.local.get("userToken");
    if (userToken) return userToken;
  }

  // 2. Dynamic JWT token extraction from any open moetran.com tab via executeScript
  try {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.scripting) {
      const tabs = await chrome.tabs.query({ url: ["https://moetran.com/*", "https://*.moetran.com/*"] });
      if (tabs && tabs.length > 0) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            for (const key of ["token", "jwt", "auth_token", "access_token", "userToken"]) {
              const val = localStorage.getItem(key);
              if (val && val.includes("eyJ")) {
                const match = val.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
                if (match) return match[0];
              }
            }
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              const val = localStorage.getItem(k);
              if (val && typeof val === "string" && val.includes("eyJ")) {
                const match = val.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
                if (match) return match[0];
              }
            }
            return null;
          }
        });
        if (results && results[0] && results[0].result) {
          const token = results[0].result;
          if (chrome.storage) {
            await chrome.storage.local.set({ userToken: token });
          }
          return token;
        }
      }
    }
  } catch (e) {
    console.warn("[MoetranAPI] Tab scripting token extraction warning:", e);
  }

  // 3. Fallback to scanning cookies
  try {
    if (typeof chrome !== "undefined" && chrome.cookies) {
      const cookies = await chrome.cookies.getAll({ url: "https://moetran.com" });
      for (const c of cookies) {
        if (c.value && c.value.includes("eyJ")) {
          const match = c.value.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
          if (match) return match[0];
        }
      }
    }
  } catch (e) {
    console.warn("[MoetranAPI] Cookie access error:", e);
  }

  return null;
}

/**
 * Fetch helper with Authorization token & timeout protection (returns response json and headers)
 */
async function fetchWithAuthFull(endpoint, options = {}) {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("未获取到登录 Token，请先在浏览器中登录 moetran.com");
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    ...(options.headers || {})
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Moetran API error (${response.status}): ${response.statusText}`);
    }

    const resJson = await response.json();
    return { data: resJson, headers: response.headers };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("网络请求超时，请检查网络连接或稍后重试");
    }
    throw err;
  }
}

/**
 * Fetch helper with Authorization token & timeout protection (returns response json)
 */
async function fetchWithAuth(endpoint, options = {}) {
  const { data } = await fetchWithAuthFull(endpoint, options);
  return data;
}

/**
 * Convert remote avatar URL to Base64 Data URL to bypass referrer/CORS restrictions
 */
export async function fetchAvatarAsBase64(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== "string") return "";
  if (avatarUrl.startsWith("data:image/")) return avatarUrl;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(avatarUrl, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const blob = await response.blob();
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result || "");
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
      if (base64 && base64.startsWith("data:image/")) return base64;
    }
  } catch (err) {
    console.warn("[MoetranAPI] Failed to fetch avatar as Base64:", err);
  }

  return avatarUrl;
}

/**
 * Safely extract avatar URL string from user data object
 */
export function extractAvatarUrl(userData) {
  if (!userData) return "";
  let raw = userData.avatar || userData.avatar_url || userData.avatarUrl || userData.avatar_path || userData.avatarPath || userData.profile?.avatar || "";

  if (typeof raw === "object" && raw !== null) {
    raw = raw.url || raw.path || raw.src || raw.link || raw.full_url || raw.key || "";
  }

  if (typeof raw !== "string") return "";
  raw = raw.trim();
  if (!raw) return "";

  if (raw.startsWith("//")) {
    return "https:" + raw;
  }
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }

  const webBase = "https://moetran.com";
  return `${webBase}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

/**
 * Get current user information
 * Endpoint: /v1/user/info
 */
export async function getUserInfo() {
  try {
    const res = await fetchWithAuth("/v1/user/info");
    const userData = res.data?.user || res.data || res.user || res;
    
    if (userData && (userData.name || userData.username || userData.nickname || userData.email)) {
      const avatarUrl = extractAvatarUrl(userData);

      let avatarDataUrl = avatarUrl;
      if (avatarUrl && !avatarUrl.startsWith("data:image/")) {
        avatarDataUrl = await fetchAvatarAsBase64(avatarUrl);
      }

      const teamRole = userData.teamRole || userData.role?.name || (typeof userData.role === 'string' ? userData.role : '') || "";

      return {
        id: userData.id || userData._id,
        name: userData.name || userData.nickname || userData.username || userData.email || "尨译用户",
        email: userData.email || "",
        avatar: avatarDataUrl || avatarUrl || "",
        teamRole: teamRole ? normalizeTeamRole(teamRole) : ""
      };
    }
    return null;
  } catch (err) {
    console.warn("[MoetranAPI] Failed to get user info:", err);
    return null;
  }
}

/**
 * Normalize and map role string/code to the 5 official Moetran team roles:
 * "创建人", "管理员", "资深成员", "成员", "见习成员"
 */
export function normalizeTeamRole(roleVal) {
  if (!roleVal) return "成员";

  if (typeof roleVal === "object") {
    roleVal = roleVal.name || roleVal.title || roleVal.role || roleVal.type || roleVal.level || JSON.stringify(roleVal);
  }

  const str = String(roleVal).toLowerCase().trim();

  // Admin / 管理员 check first
  if (str.includes("管理员") || str.includes("admin") || str.includes("manager") || str === "2") {
    return "管理员";
  }
  // Creator / Owner / 创建人
  if (str.includes("创建人") || str.includes("创建者") || str.includes("owner") || str.includes("creator") || str === "1") {
    return "创建人";
  }
  // Senior / 资深成员
  if (str.includes("资深") || str.includes("senior") || str === "3") {
    return "资深成员";
  }
  // Trainee / 见习成员
  if (str.includes("见习") || str.includes("实习") || str.includes("trainee") || str.includes("intern") || str === "5") {
    return "见习成员";
  }
  // Member / 成员
  if (str.includes("成员") || str.includes("组员") || str.includes("member") || str === "4") {
    return "成员";
  }
  return "成员";
}

/**
 * Fetch team member role for 种植园汉化组 to find current user's official team role
 * Endpoint: /v1/teams/{teamId} or /v1/teams/{teamId}/members?page=1&limit=100
 */
export async function getPlantationTeamMemberRole(currentUserId) {
  // Option 1: Direct team detail query
  try {
    const teamRes = await fetchWithAuth(`/v1/teams/${TEAM_PLANTATION_ID}`);
    const teamData = teamRes.data || teamRes;
    if (teamData) {
      const myRole = teamData.myRole || teamData.userRole || teamData.role || teamData.my_role || teamData.user_role;
      if (myRole) {
        const rawName = typeof myRole === "object" ? (myRole.name || myRole.title || myRole.role) : myRole;
        if (rawName) return normalizeTeamRole(rawName);
      }
    }
  } catch (e) {
    console.warn("[MoetranAPI] Direct team info fetch warning:", e);
  }

  // Option 2: Team members list query
  try {
    const res = await fetchWithAuth(`/v1/teams/${TEAM_PLANTATION_ID}/members?page=1&limit=100`);
    let memberList = [];
    if (Array.isArray(res)) memberList = res;
    else if (Array.isArray(res.data)) memberList = res.data;
    else if (res.data && Array.isArray(res.data.list)) memberList = res.data.list;
    else if (res.data && Array.isArray(res.data.members)) memberList = res.data.members;

    if (memberList.length > 0) {
      const match = memberList.find(m => {
        const uObj = m.user || m.userInfo || m.user_info || {};
        const uId = uObj.id || uObj._id || m.userId || m.user_id || m.id || m._id;
        const uName = uObj.name || uObj.username || uObj.nickname || m.name || m.username;

        if (currentUserId && String(uId) === String(currentUserId)) return true;
        if (currentUserId && typeof currentUserId === "string" && uName && uName.toLowerCase() === currentUserId.toLowerCase()) return true;
        return false;
      });

      if (match) {
        const rawRole = match.role?.name || match.role || match.roleName || match.role_name || match.permission || match.type || match.level;
        if (rawRole) return normalizeTeamRole(rawRole);
      }
    }
  } catch (err) {
    console.warn("[MoetranAPI] Failed to fetch team member role:", err);
  }

  return null;
}

/**
 * Helper to check if a project belongs to 种植园汉化组
 */
export function isPlantationProject(proj) {
  if (!proj) return false;
  const teamObj = proj.team || {};
  const tId = teamObj.id || teamObj._id || getProp(proj, "teamId", "team_id");
  const tName = teamObj.name || "";

  if (String(tId) === String(TEAM_PLANTATION_ID)) return true;
  if (typeof tName === "string" && tName.includes("种植园")) return true;
  return false;
}

/**
 * Fetch user projects from dashboard (fetches all pages for exact all-time statistics)
 * Endpoint: /v1/user/projects
 */
export async function getUserProjects(page = 1, limit = 100, word = "") {
  const query = new URLSearchParams({
    page,
    limit,
    word
  }).toString();

  const { data: res, headers } = await fetchWithAuthFull(`/v1/user/projects?${query}`);
  let list = [];
  if (Array.isArray(res)) list = res;
  else if (Array.isArray(res.data)) list = res.data;
  else if (res.data && Array.isArray(res.data.list)) list = res.data.list;
  else if (res.data && Array.isArray(res.data.projects)) list = res.data.projects;
  else if (res.data && Array.isArray(res.data.rows)) list = res.data.rows;

  const headerTotal = headers.get("x-pagination-count") || headers.get("x-total-count") || headers.get("x-pagination-total");
  const parsedTotal = headerTotal ? parseInt(headerTotal, 10) : (res.total || res.data?.total || res.count || list.length);

  let allProjects = [...list];

  // If total items exceed first page, fetch remaining pages to ensure 100% accurate count
  if (!isNaN(parsedTotal) && parsedTotal > list.length && list.length > 0) {
    const totalPages = Math.min(10, Math.ceil(parsedTotal / limit)); // Cap at 10 pages for safety
    for (let p = 2; p <= totalPages; p++) {
      try {
        const nextQuery = new URLSearchParams({ page: p, limit, word }).toString();
        const { data: nextRes } = await fetchWithAuthFull(`/v1/user/projects?${nextQuery}`);
        let nextList = [];
        if (Array.isArray(nextRes)) nextList = nextRes;
        else if (Array.isArray(nextRes.data)) nextList = nextRes.data;
        else if (nextRes.data && Array.isArray(nextRes.data.list)) nextList = nextRes.data.list;
        else if (nextRes.data && Array.isArray(nextRes.data.projects)) nextList = nextRes.data.projects;
        else if (nextRes.data && Array.isArray(nextRes.data.rows)) nextList = nextRes.data.rows;

        if (nextList.length > 0) {
          allProjects = allProjects.concat(nextList);
        } else {
          break;
        }
      } catch (e) {
        console.warn(`[MoetranAPI] Page ${p} fetch warning:`, e);
        break;
      }
    }
  }

  // Attach all-time counts metadata
  allProjects.totalProjectsAllTime = isNaN(parsedTotal) ? allProjects.length : Math.max(parsedTotal, allProjects.length);
  allProjects.plantationProjectsAllTime = allProjects.filter(isPlantationProject).length;

  return allProjects;
}

/**
 * Fetch projects belonging to 种植园汉化组 team (default limit: 20 items)
 * Endpoint: /v1/teams/{teamId}/projects
 */
export async function getTeamProjects(teamId = TEAM_PLANTATION_ID, page = 1, limit = 100) {
  const query = new URLSearchParams({
    page,
    limit
  }).toString();

  const { data: res, headers } = await fetchWithAuthFull(`/v1/teams/${teamId}/projects?${query}`);
  let list = [];
  if (Array.isArray(res)) list = res;
  else if (Array.isArray(res.data)) list = res.data;
  else if (res.data && Array.isArray(res.data.list)) list = res.data.list;
  else if (res.data && Array.isArray(res.data.projects)) list = res.data.projects;
  else if (res.data && Array.isArray(res.data.rows)) list = res.data.rows;

  const headerTotal = headers.get("x-pagination-count") || headers.get("x-total-count") || headers.get("x-pagination-total");
  const parsedTotal = headerTotal ? parseInt(headerTotal, 10) : (res.total || res.data?.total || res.count || list.length);

  list.totalTeamProjects = isNaN(parsedTotal) ? list.length : Math.max(parsedTotal, list.length);
  return list;
}

/**
 * Helper to safely extract property regardless of snake_case or camelCase
 */
function getProp(obj, camelKey, snakeKey) {
  if (!obj) return undefined;
  if (obj[camelKey] !== undefined) return obj[camelKey];
  if (obj[snakeKey] !== undefined) return obj[snakeKey];
  return undefined;
}

/**
 * Format project title into "团队名 - 大项目名称 - 小项目名称"
 */
export function formatFullProjectTitle(proj, isPlantation = false) {
  const teamObj = proj.team || {};
  const teamName = teamObj.name || (isPlantation ? "种植园汉化组" : "个人项目");

  const projectSetObj = proj.project_set || proj.projectSet || {};
  let parentName = projectSetObj.name || proj.parentProject?.name || proj.parent_name || proj.group?.name || proj.category || "";
  let subName = proj.name || "未命名项目";

  // If no explicit parent project field, attempt smart parsing from proj.name
  if (!parentName) {
    // Check bracket pattern e.g. [大项目] 小项目 or 【大项目】小项目
    const bracketMatch = subName.match(/^[\{\[\【\（](.+?)[\}\]\】\）]\s*(.+)$/);
    if (bracketMatch) {
      parentName = bracketMatch[1].trim();
      subName = bracketMatch[2].trim();
    } else {
      // Check delimiter pattern e.g. 大项目 / 小项目 or 大项目 - 小项目
      const parts = subName.split(/\s*[\/\-_]\s*/);
      if (parts.length >= 2) {
        parentName = parts[0].trim();
        subName = parts.slice(1).join(" - ").trim();
      } else {
        parentName = subName;
      }
    }
  }

  return `${teamName} - ${parentName} - ${subName}`;
}

/**
 * Calculate combined work statistics for the user
 * @param {Array} projects - List of project objects
 */
export function calculateWorkStats(projects = []) {
  const allProjects = Array.isArray(projects) ? projects : [];
  const recentProjects = allProjects.slice(0, 20);
  
  let totalProjects = allProjects.totalProjectsAllTime !== undefined ? allProjects.totalProjectsAllTime : allProjects.length;
  let activeProjects = 0;
  let finishedProjects = 0;
  let totalSources = 0;
  let totalTranslated = 0;
  let totalChecked = 0;
  
  let plantationProjects = allProjects.plantationProjectsAllTime !== undefined ? 
    allProjects.plantationProjectsAllTime : 
    allProjects.filter(isPlantationProject).length;

  // Extract user's role in 种植园汉化组 team
  let plantationRole = "成员";
  const plantationItem = allProjects.find(isPlantationProject);
  if (plantationItem) {
    const teamObj = plantationItem.team || {};
    const tRoleObj = plantationItem.teamRole || plantationItem.team_role || teamObj.userRole || teamObj.role || {};
    const rName = typeof tRoleObj === 'string' ? tRoleObj : (tRoleObj.name || tRoleObj.title || '');
    if (rName && rName.trim()) {
      plantationRole = normalizeTeamRole(rName.trim());
    }
  }

  const projectList = recentProjects.map(proj => {
    const teamObj = proj.team || {};
    const isPlantation = isPlantationProject(proj);

    const sourceCount = getProp(proj, "sourceCount", "source_count") || getProp(proj, "targetCount", "target_count") || 0;
    const translatedCount = getProp(proj, "translatedSourceCount", "translated_source_count") || 0;
    const checkedCount = getProp(proj, "checkedSourceCount", "checked_source_count") || 0;

    totalSources += sourceCount;
    totalTranslated += translatedCount;
    totalChecked += checkedCount;

    const translationProgress = sourceCount > 0 ? Math.min(100, Math.round((translatedCount / sourceCount) * 100)) : 0;
    const proofreadProgress = sourceCount > 0 ? Math.min(100, Math.round((checkedCount / sourceCount) * 100)) : 0;

    // Both translation AND proofread progress must be 100% to count as finished
    const isFinished = (sourceCount > 0) && (translationProgress === 100) && (proofreadProgress === 100);
    if (isFinished) {
      finishedProjects++;
    } else {
      activeProjects++;
    }

    const roleObj = proj.role || {};
    const roleName = roleObj.name || "成员";
    const fullTitle = formatFullProjectTitle(proj, isPlantation);

    return {
      id: proj.id,
      name: proj.name,
      fullTitle,
      teamName: teamObj.name || (isPlantation ? "种植园汉化组" : "个人项目"),
      isPlantation,
      status: proj.status,
      role: roleName,
      sourceCount,
      translatedCount,
      checkedCount,
      translationProgress,
      proofreadProgress,
      updatedAt: getProp(proj, "updatedAt", "updated_at") || getProp(proj, "createTime", "create_time")
    };
  });

  const overallTranslationProgress = totalSources > 0 ? Math.min(100, Math.round((totalTranslated / totalSources) * 100)) : 0;
  const overallProofreadProgress = totalSources > 0 ? Math.min(100, Math.round((totalChecked / totalSources) * 100)) : 0;

  return {
    totalProjects,
    activeProjects,
    finishedProjects,
    plantationProjects,
    plantationRole,
    totalSources,
    totalTranslated,
    totalChecked,
    overallTranslationProgress,
    overallProofreadProgress,
    projectList,
    lastRefreshedAt: new Date().toISOString()
  };
}

/**
 * Format single project detail into standardized stats object
 */
export function formatSingleProjectStats(proj) {
  if (!proj) return null;
  const isPlantation = isPlantationProject(proj);
  const teamObj = proj.team || {};
  const teamName = teamObj.name || (isPlantation ? "种植园汉化组" : "个人项目");
  const fullTitle = formatFullProjectTitle(proj, isPlantation);

  const sourceCount = getProp(proj, "sourceCount", "source_count") || getProp(proj, "targetCount", "target_count") || 0;
  const translatedCount = getProp(proj, "translatedSourceCount", "translated_source_count") || 0;
  const checkedCount = getProp(proj, "checkedSourceCount", "checked_source_count") || 0;

  const translationProgress = sourceCount > 0 ? Math.min(100, Math.round((translatedCount / sourceCount) * 100)) : 0;
  const proofreadProgress = sourceCount > 0 ? Math.min(100, Math.round((checkedCount / sourceCount) * 100)) : 0;

  const isFinished = (sourceCount > 0) && (translationProgress === 100) && (proofreadProgress === 100);

  return {
    id: proj.id || proj._id,
    name: proj.name || "未命名项目",
    fullTitle,
    teamName,
    isPlantation,
    status: proj.status || (isFinished ? "finished" : "active"),
    isFinished,
    role: typeof proj.role === 'object' ? (proj.role?.name || "成员") : (proj.role || "成员"),
    sourceCount,
    translatedCount,
    checkedCount,
    translationProgress,
    proofreadProgress,
    updatedAt: getProp(proj, "updatedAt", "updated_at") || getProp(proj, "createTime", "create_time") || new Date().toISOString()
  };
}

/**
 * Fetch detailed stats for a single project by ID
 * @param {string} projectId
 */
export async function getSingleProjectDetail(projectId) {
  if (!projectId) return null;

  // 1. Try direct API fetch
  try {
    const res = await fetchWithAuth(`/v1/projects/${projectId}`);
    const projData = res.data || res.project || res;
    if (projData) {
      return formatSingleProjectStats(projData);
    }
  } catch (err) {
    console.warn(`[MoetranAPI] Failed to fetch project ${projectId} directly:`, err);
  }

  // 2. Fallback to searching user projects list
  try {
    const userProjects = await getUserProjects(1, 100);
    const match = userProjects.find(p => String(p.id || p._id) === String(projectId));
    if (match) {
      return formatSingleProjectStats(match);
    }
  } catch (err) {
    console.warn(`[MoetranAPI] Fallback user projects lookup failed:`, err);
  }

  return null;
}

/**
 * Generate brief report text for a single project
 */
export function generateSingleProjectReportText(projStats, userProfile) {
  if (!projStats) return "";
  const nameStr = userProfile && userProfile.name ? ` (${userProfile.name})` : "";
  const statusStr = projStats.isFinished ? "🏁 已完成" : "🟢 进行中";

  return `【🌱 种植园汉化组 - 当前项目简报${nameStr}】\n` +
         `------------------------------\n` +
         `📌 项目全称：${projStats.fullTitle}\n` +
         `🏷️ 项目状态：${statusStr}${projStats.isPlantation ? ' | 🌱 种植园项目' : ''}\n` +
         `📊 句子总数：${projStats.sourceCount} 句\n` +
         `📝 翻译进度：${projStats.translatedCount} / ${projStats.sourceCount} (${projStats.translationProgress}%)\n` +
         `🔍 校对进度：${projStats.checkedCount} / ${projStats.sourceCount} (${projStats.proofreadProgress}%)\n` +
         `------------------------------\n` +
         `发送自：种植园尨译助手 🚀`;
}

