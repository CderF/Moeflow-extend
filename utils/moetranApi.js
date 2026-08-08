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
  const pageSize = list.length || 20;

  // If total items exceed first page, fetch remaining pages to ensure 100% accurate count
  if (!isNaN(parsedTotal) && parsedTotal > allProjects.length && pageSize > 0) {
    const totalPages = Math.min(30, Math.ceil(parsedTotal / pageSize));
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
 * Lightweight variant: fetch only the first page of the user's project list.
 * Used by SYNC_RECENT_TO_FEISHU to obtain recent manga names without the
 * full multi-page iteration cost of getUserProjects().
 * @param {number} limit - Number of items to request (default: 20)
 * @returns {Array} First-page project list (no pagination metadata)
 */
export async function getUserProjectsFirstPage(limit = 20) {
  const { data: res } = await fetchWithAuthFull(`/v1/user/projects?page=1&limit=${limit}&word=`);
  let list = [];
  if (Array.isArray(res)) list = res;
  else if (Array.isArray(res.data)) list = res.data;
  else if (res.data && Array.isArray(res.data.list)) list = res.data.list;
  else if (res.data && Array.isArray(res.data.projects)) list = res.data.projects;
  else if (res.data && Array.isArray(res.data.rows)) list = res.data.rows;
  return list.slice(0, limit);
}

/**
 * Fetch projects belonging to 种植园汉化组 team (fetches all pages for 100% accurate total count)
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

  let allTeamProjects = [...list];
  const pageSize = list.length || 20;

  if (!isNaN(parsedTotal) && parsedTotal > allTeamProjects.length && pageSize > 0) {
    const totalPages = Math.min(30, Math.ceil(parsedTotal / pageSize));
    for (let p = 2; p <= totalPages; p++) {
      try {
        const nextQuery = new URLSearchParams({ page: p, limit }).toString();
        const { data: nextRes } = await fetchWithAuthFull(`/v1/teams/${teamId}/projects?${nextQuery}`);
        let nextList = [];
        if (Array.isArray(nextRes)) nextList = nextRes;
        else if (Array.isArray(nextRes.data)) nextList = nextRes.data;
        else if (nextRes.data && Array.isArray(nextRes.data.list)) nextList = nextRes.data.list;
        else if (nextRes.data && Array.isArray(nextRes.data.projects)) nextList = nextRes.data.projects;
        else if (nextRes.data && Array.isArray(nextRes.data.rows)) nextList = nextRes.data.rows;

        if (nextList.length > 0) {
          allTeamProjects = allTeamProjects.concat(nextList);
        } else {
          break;
        }
      } catch (e) {
        console.warn(`[MoetranAPI] Team projects page ${p} fetch warning:`, e);
        break;
      }
    }
  }

  allTeamProjects.totalTeamProjects = isNaN(parsedTotal) ? allTeamProjects.length : Math.max(parsedTotal, allTeamProjects.length);
  return allTeamProjects;
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

/**
 * Parse a chapter project name into a comparable structure.
 * 数字话数家族：纯数字（"70"、"38.5"）、标准章节（"第70话"、"12话"、"第5卷"，含日文 話/巻）、
 * 以及带文字后缀的变体（"第70话(修)"、"70话 下"）——后缀变体以数字前缀作为比较基准，
 * 且永远高于同话数的无后缀原名。全角数字先归一化为半角。
 * 其余含文字的名称（番外篇、番外篇2、特别篇 2024 ...）为文字话名，num 为 null，
 * 被选中时完整名称原样写入表格
 */
function parseChapterName(name) {
  if (!name || typeof name !== "string") return { num: null, suffixed: false };
  const trimmed = name.trim().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

  let match = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (match) return { num: parseFloat(match[1]), suffixed: false };
  match = trimmed.match(/^第\s*(\d+(?:\.\d+)?)\s*[话話卷巻回集]$/);
  if (match) return { num: parseFloat(match[1]), suffixed: false };
  match = trimmed.match(/^(\d+(?:\.\d+)?)\s*[话話卷巻回集]$/);
  if (match) return { num: parseFloat(match[1]), suffixed: false };
  // 带文字后缀的数字章节；后缀首字符不能是数字，避免把 "第70话2" 误当作 70 话的后缀版
  match = trimmed.match(/^第\s*(\d+(?:\.\d+)?)\s*[话話卷巻回集]\s*[^\d\s]/);
  if (match) return { num: parseFloat(match[1]), suffixed: true };
  match = trimmed.match(/^(\d+(?:\.\d+)?)\s*[话話卷巻回集]\s*[^\d\s]/);
  if (match) return { num: parseFloat(match[1]), suffixed: true };
  return { num: null, suffixed: false };
}

/**
 * Extract chapter number from project name (numeric prefix for suffixed variants);
 * returns null for text chapter names
 */
export function extractChapterNumber(name) {
  return parseChapterName(name).num;
}

/**
 * Determine single chapter status based on sentence counts
 * 待翻译: 翻译句数为 0（含无句数）; 翻译中: 翻译未完成; 待校对/校对中: 翻译完成后按校对进度; 已完成: 翻译与校对均 100%
 */
export function determineChapterStatus(sourceCount, translatedCount, checkedCount) {
  if (!translatedCount || translatedCount <= 0) {
    return "待翻译";
  }
  const translationProgress = sourceCount > 0 ? Math.min(100, Math.round((translatedCount / sourceCount) * 100)) : 0;
  const proofreadProgress = sourceCount > 0 ? Math.min(100, Math.round((checkedCount / sourceCount) * 100)) : 0;

  if (translationProgress < 100) {
    return "翻译中";
  }
  if (proofreadProgress < 100) {
    return checkedCount > 0 ? "校对中" : "待校对";
  }
  return "已完成";
}

/**
 * Extract Manga (project_set) name from a project object
 */
export function extractMangaName(proj) {
  if (!proj) return "未命名漫画";
  const projectSetObj = proj.project_set || proj.projectSet || {};
  if (projectSetObj.name) return projectSetObj.name.trim();

  let subName = proj.name || "未命名项目";
  const bracketMatch = subName.match(/^[\{\[\【\（](.+?)[\}\]\】\）]\s*(.+)$/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }
  const parts = subName.split(/\s*[\/\-_]\s*/);
  if (parts.length >= 2) {
    return parts[0].trim();
  }
  return subName;
}

/**
 * Parse project members into creator (图源) and participants (参与人员 list)
 * Member entries may nest user info under user/userInfo/user_info; role lives on the membership record
 */
export function extractProjectMembers(proj) {
  let creator = "";
  let participants = [];

  const rawMembers = proj.members || proj.userList || proj.users || [];
  if (Array.isArray(rawMembers)) {
    for (const rawEntry of rawMembers) {
      if (!rawEntry) continue;
      const uObj = (typeof rawEntry === "object")
        ? (rawEntry.user || rawEntry.userInfo || rawEntry.user_info || rawEntry)
        : {};
      const uName = (typeof rawEntry === "string")
        ? rawEntry
        : (uObj.name || uObj.username || uObj.nickname || rawEntry.name || rawEntry.username || rawEntry.nickname || "");
      if (!uName) continue;

      const rawRole = (typeof rawEntry === "object")
        ? (rawEntry.role?.name || rawEntry.role || rawEntry.projectRole || rawEntry.project_role || rawEntry.teamRole || rawEntry.type || "")
        : "";
      const roleStr = (typeof rawRole === "object") ? JSON.stringify(rawRole) : String(rawRole || "");
      const isCreator = !!(rawEntry.isCreator || rawEntry.is_creator) || /创建人|创建者|owner|creator/i.test(roleStr);

      if (isCreator) {
        if (!creator) creator = uName;
      } else {
        participants.push(uName);
      }
    }
  }

  if (!creator) {
    const cObj = proj.creator || proj.owner || proj.user || {};
    creator = cObj.name || cObj.username || cObj.nickname || "";
  }

  if (!creator && participants.length > 0) {
    creator = participants.shift();
  }

  // The 图源 occupies its own column; never duplicate them into 参与人员
  if (creator) {
    participants = participants.filter(p => p !== creator);
  }

  const formattedParticipants = [];
  for (let i = 0; i < Math.min(4, participants.length); i++) {
    let pName = participants[i];
    if (i === 3 && participants.length > 4) {
      pName = `${pName}等`;
    }
    formattedParticipants.push(pName);
  }

  return {
    creator: creator || "暂无",
    participants: formattedParticipants
  };
}

/**
 * Fetch creator & participants of a single project (图源 = 项目创建人).
 * Endpoint confirmed against moeflow-backend MemberListAPI:
 *   GET /v1/projects/{id}/users?page=1&limit=100
 * Returns user objects with a nested role ("创建人" / system_code "creator" marks the creator)
 * @param {string} projectId
 * @returns {{ creator: string, participants: string[] } | null}
 */
export async function getProjectMembers(projectId) {
  if (!projectId) return null;

  try {
    const res = await fetchWithAuth(`/v1/projects/${projectId}/users?page=1&limit=100`);
    let memberList = [];
    if (Array.isArray(res)) memberList = res;
    else if (Array.isArray(res.data)) memberList = res.data;
    else if (res.data && Array.isArray(res.data.list)) memberList = res.data.list;
    else if (res.data && Array.isArray(res.data.users)) memberList = res.data.users;
    else if (res.data && Array.isArray(res.data.members)) memberList = res.data.members;

    if (memberList.length > 0) {
      return extractProjectMembers({ members: memberList });
    }
  } catch (err) {
    console.warn(`[MoetranAPI] Fetch project members warning (${projectId}):`, err);
  }

  return null;
}

/**
 * Group projects list by Manga Name and compute Feishu Bitable row format
 *
 * Selection rules (confirmed with the team):
 *  - 未翻译集 = 翻译句数为 0 的章节; 进行集 = 翻译句数 > 0 的章节（含已完成）
 *  - 最新话数 = 未翻译集中话数最大者；无未翻译章节时取全部章节中话数最大者
 *  - 当前进行话数 = 进行集中话数最大者；进行集为空时回退到最新话数项目（状态=待翻译）
 *  - 集合内比较：纯数字集合按话数降序（带后缀名称永远高于同话数原名，再并列取创建时间最新）；
 *    纯文字集合取最近编辑时间（edit_time）最新者；数字文字同场按各自新近度键取最新者
 *    （文字=最近编辑时间，数字=创建时间）
 *  - 交叉钳制：当前进行候选超过最新候选时（均为数字比话数，其余比新近度键），
 *    最新话数与当前进行话数合并显示当前项目
 *  - 状态 = 当前进行话数项目的单话状态；图源/参与人员 = 当前进行话数项目的创建人与成员
 *  - 文字话名（番外篇、番外篇2、特别篇 2024 等）被选中为最新/当前进行时，完整名称原样写入表格
 *  - 平台项目状态（ProjectStatus: 0 进行中 / 1 已完结 / 2 计划完结 / 3 计划删除）：
 *    计划删除直接排除；已完结项目视为已关闭，不参与未翻译集与进行集，
 *    仅在整本漫画全部已完结时兜底参选（此时状态强制显示为已完成）
 *
 * @param {Array} projectsList
 * @param {Object|null} membersMap - Optional map: projectId -> { creator, participants[] }
 */
export function buildFeishuRowsFromProjects(projectsList = [], membersMap = null) {
  if (!Array.isArray(projectsList) || projectsList.length === 0) return [];

  const mangaMap = new Map();

  for (const proj of projectsList) {
    const mangaName = extractMangaName(proj);
    if (!mangaMap.has(mangaName)) {
      mangaMap.set(mangaName, []);
    }
    mangaMap.get(mangaName).push(proj);
  }

  const timeOf = (val) => {
    const t = new Date(val || 0).getTime();
    return isNaN(t) ? 0 : t;
  };

  // 新近度比较键：文字话名用最近编辑时间（edit_time），数字话数用创建时间
  const recencyOf = (c) => (c.chapterNum === null ? timeOf(c.updatedAt) : timeOf(c.createdAt));

  // 集合内选取规则（适用于最新/当前进行及全部兜底池）：
  const pickLatestChapter = (candidates) => {
    if (!candidates || candidates.length === 0) return null;
    const numeric = candidates.filter(c => c.chapterNum !== null);
    if (numeric.length === candidates.length) {
      // 纯数字集合：话数降序；带后缀名称永远高于同话数原名；再并列取创建时间最新
      numeric.sort((a, b) =>
        (b.chapterNum - a.chapterNum) ||
        ((b.suffixed ? 1 : 0) - (a.suffixed ? 1 : 0)) ||
        (timeOf(b.createdAt) - timeOf(a.createdAt))
      );
      return numeric[0];
    }
    if (numeric.length === 0) {
      // 纯文字集合：取最近编辑时间最新者；updatedAt 相同时以 createdAt 作为稳定二级键
      return [...candidates].sort((a, b) =>
        (timeOf(b.updatedAt) - timeOf(a.updatedAt)) ||
        (timeOf(b.createdAt) - timeOf(a.createdAt))
      )[0];
    }
    // 数字文字同场：数字章节永远优先于文字章节；数字集合内再按话数 / 新近度键选取
    numeric.sort((a, b) =>
      (b.chapterNum - a.chapterNum) ||
      ((b.suffixed ? 1 : 0) - (a.suffixed ? 1 : 0)) ||
      (timeOf(b.createdAt) - timeOf(a.createdAt))
    );
    return numeric[0];
  };

  const resultRows = [];

  for (const [mangaName, chapters] of mangaMap.entries()) {
    // moeflow-backend ProjectStatus: 0 WORKING / 1 FINISHED / 2 PLAN_FINISH / 3 PLAN_DELETE
    const PLATFORM_FINISHED = 1;
    const PLATFORM_PLAN_DELETE = 3;

    const parsedChapters = [];
    for (const c of chapters) {
      const platformStatus = Number(c.status);
      if (platformStatus === PLATFORM_PLAN_DELETE) continue; // 计划删除的项目不参与统计

      const { num: chapterNum, suffixed } = parseChapterName(c.name);
      const sourceCount = getProp(c, "sourceCount", "source_count") || 0;
      const translatedCount = getProp(c, "translatedSourceCount", "translated_source_count") || 0;
      const checkedCount = getProp(c, "checkedSourceCount", "checked_source_count") || 0;
      const status = determineChapterStatus(sourceCount, translatedCount, checkedCount);
      const createdAt = getProp(c, "createTime", "create_time") || getProp(c, "createdAt", "created_at") || "";
      const updatedAt = getProp(c, "updatedAt", "updated_at") || getProp(c, "editTime", "edit_time") || createdAt || new Date().toISOString();

      parsedChapters.push({
        proj: c,
        chapterNum,
        suffixed,
        status,
        createdAt,
        updatedAt,
        // 平台已完结的项目已关闭：不再是未开坑坑位，也不参与当前进行话数
        closed: platformStatus === PLATFORM_FINISHED
      });
    }

    if (parsedChapters.length === 0) continue; // 整本漫画的项目都在计划删除中

    const activeChapters = parsedChapters.filter(c => !c.closed);
    const untranslatedChapters = activeChapters.filter(c => c.status === "待翻译");
    const startedChapters = activeChapters.filter(c => c.status !== "待翻译");

    // 最新话数：未翻译集最大 ->（无未翻译）活跃集最大 ->（整本已完结）全量最大
    const latestObj = pickLatestChapter(untranslatedChapters)
      || pickLatestChapter(activeChapters)
      || pickLatestChapter(parsedChapters);
    // 当前进行话数：进行集最大 -> 回退到最新话数项目
    const currentObj = pickLatestChapter(startedChapters) || latestObj;
    const currentStatus = !currentObj ? "待翻译" : (currentObj.closed ? "已完成" : currentObj.status);

    // 交叉钳制：当前进行候选超过最新候选时，最新话数合并显示当前项目
    // （均为数字比话数；其余情况比新近度键——文字=最近编辑时间，数字=创建时间）
    const displayLatestObj = (() => {
      if (!latestObj || !currentObj || latestObj === currentObj) return latestObj;
      if (latestObj.chapterNum !== null && currentObj.chapterNum !== null) {
        return currentObj.chapterNum > latestObj.chapterNum ? currentObj : latestObj;
      }
      return recencyOf(currentObj) > recencyOf(latestObj) ? currentObj : latestObj;
    })();

    // Non-numeric chapter names pass through as raw text; the Feishu payload builder
    // adapts them to the actual column type (text column keeps the name, number column gets 0)
    const chapterValueOf = (obj) => {
      if (!obj) return 0;
      return obj.chapterNum !== null ? obj.chapterNum : String(obj.proj.name || "").trim();
    };

    const lastEditTimestamp = parsedChapters.reduce((max, c) => Math.max(max, timeOf(c.updatedAt)), 0) || Date.now();

    const targetProjectId = currentObj ? String(currentObj.proj.id || currentObj.proj._id || "") : "";
    const memberInfo = (membersMap && targetProjectId && membersMap[targetProjectId]) ? membersMap[targetProjectId] : null;

    resultRows.push({
      mangaName,
      latestChapter: chapterValueOf(displayLatestObj),
      currentChapter: chapterValueOf(currentObj),
      status: currentStatus,
      creator: memberInfo ? (memberInfo.creator || "") : "",
      participants: memberInfo && Array.isArray(memberInfo.participants) ? memberInfo.participants : [],
      membersLoaded: !!memberInfo,
      lastEditDate: lastEditTimestamp,
      targetProjectId
    });
  }

  return resultRows;
}
