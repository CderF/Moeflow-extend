/**
 * Feishu (Lark) Bitable Integration Utility Module
 * Automates project progress status syncing to Feishu Bitable tables.
 */

const DEFAULT_APP_TOKEN = "F91nbenvPalOnnsHG2ocevX5nff";
const DEFAULT_TABLE_ID = "tblRiggk5q2y319A";

/**
 * Read Feishu credentials & target table settings from chrome.storage.local
 */
export async function getFeishuConfig() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    const { feishuConfig } = await chrome.storage.local.get("feishuConfig");
    return {
      appId: feishuConfig?.appId || "",
      appSecret: feishuConfig?.appSecret || "",
      appToken: feishuConfig?.appToken || DEFAULT_APP_TOKEN,
      tableId: feishuConfig?.tableId || DEFAULT_TABLE_ID
    };
  }
  return {
    appId: "",
    appSecret: "",
    appToken: DEFAULT_APP_TOKEN,
    tableId: DEFAULT_TABLE_ID
  };
}

/**
 * Save Feishu credentials to chrome.storage.local
 */
export async function saveFeishuConfig(config) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ feishuConfig: config });
    // Invalidate cached token on credential change
    await chrome.storage.local.remove("feishuTenantToken");
  }
}

/**
 * Fetch tenant_access_token using appId & appSecret
 */
export async function getFeishuTenantToken() {
  const config = await getFeishuConfig();
  if (!config.appId || !config.appSecret) {
    throw new Error("未配置飞书 App ID 和 App Secret，请先在插件 Popup 的飞书配置中保存凭证");
  }

  // 1. Check local cache
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    const { feishuTenantToken } = await chrome.storage.local.get("feishuTenantToken");
    if (feishuTenantToken && feishuTenantToken.expireTime > Date.now() + 60000) {
      return feishuTenantToken.token;
    }
  }

  // 2. Request new tenant_access_token
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      app_id: config.appId.trim(),
      app_secret: config.appSecret.trim()
    })
  });

  if (!response.ok) {
    throw new Error(`请求飞书鉴权接口失败 (HTTP ${response.status})`);
  }

  const resJson = await response.json();
  if (resJson.code !== 0 || !resJson.tenant_access_token) {
    throw new Error(`飞书 Token 获取失败 (错误码 ${resJson.code}): ${resJson.msg || "请检查 App ID 和 App Secret 是否填写正确"}`);
  }

  const token = resJson.tenant_access_token;
  const expireTime = Date.now() + ((resJson.expire || 7200) * 1000);

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({
      feishuTenantToken: { token, expireTime }
    });
  }

  return token;
}

/**
 * Fetch table fields schema to map and validate actual column names & types
 */
export async function getTableFields(token, appToken, tableId) {
  try {
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 0 || !data.data || !Array.isArray(data.data.items)) return null;

    return data.data.items; // List of { field_id, field_name, type }
  } catch (e) {
    console.warn("[FeishuSync] Failed to fetch table fields schema:", e);
    return null;
  }
}

/**
 * Create a missing field in Bitable
 */
export async function createTableField(token, appToken, tableId, fieldName, fieldType = 1) {
  try {
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        field_name: fieldName,
        type: fieldType
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.code === 0 && data.data && data.data.field) {
      return data.data.field;
    }
  } catch (e) {
    console.warn(`[FeishuSync] Create field '${fieldName}' warning:`, e);
  }
  return null;
}

/**
 * Auto-ensure all required 10 standard columns exist in the target Bitable table
 */
export async function ensureRequiredFieldsExist(token, appToken, tableId) {
  const existingFields = (await getTableFields(token, appToken, tableId)) || [];

  const requiredColumns = [
    { name: "漫画名", type: 1 },
    { name: "最新话数", type: 2 },
    { name: "当前进行话数", type: 2 },
    { name: "状态", type: 1 },
    { name: "图源", type: 1 },
    { name: "参与人员 1", type: 1 },
    { name: "参与人员 2", type: 1 },
    { name: "参与人员 3", type: 1 },
    { name: "参与人员 4", type: 1 },
    { name: "最后编辑日期", type: 5 }
  ];

  const existingNameSet = new Set(existingFields.map(f => f.field_name.replace(/\s+/g, "").toLowerCase()));

  for (const col of requiredColumns) {
    const cleanName = col.name.replace(/\s+/g, "").toLowerCase();
    if (!existingNameSet.has(cleanName)) {
      console.log(`[FeishuSync] Auto creating missing field: ${col.name}`);
      const newField = await createTableField(token, appToken, tableId, col.name, col.type);
      if (newField) {
        existingFields.push(newField);
        existingNameSet.add(cleanName);
      }
    }
  }

  return existingFields;
}

/**
 * Query existing records in Bitable to find row by manga name or locate an unused empty row
 */
export async function findRecordTarget(token, appToken, tableId, mangaName) {
  if (!mangaName) return { matchRecordId: null, emptyRecordId: null };

  try {
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) return { matchRecordId: null, emptyRecordId: null };
    const data = await res.json();
    if (data.code !== 0 || !data.data || !Array.isArray(data.data.items)) return { matchRecordId: null, emptyRecordId: null };

    const items = data.data.items;
    const cleanTarget = mangaName.trim().toLowerCase();

    let matchRecordId = null;
    let emptyRecordId = null;

    for (const item of items) {
      const fields = item.fields || {};
      const keys = Object.keys(fields);

      if (keys.length === 0 && !emptyRecordId) {
        emptyRecordId = item.record_id;
      }

      for (const [key, val] of Object.entries(fields)) {
        if (key.includes("漫画") || key.includes("项目") || key === "漫画名" || key === "名称") {
          let strVal = "";
          if (typeof val === "string") strVal = val;
          else if (Array.isArray(val) && val[0]) strVal = String(val[0].text || val[0]);
          else if (val && typeof val === "object" && val.text) strVal = String(val.text);

          if (strVal.trim().toLowerCase() === cleanTarget) {
            matchRecordId = item.record_id;
            break;
          }
        }
      }
      if (matchRecordId) break;
    }

    return { matchRecordId, emptyRecordId };
  } catch (err) {
    console.warn("[FeishuSync] Failed to search record target:", err);
    return { matchRecordId: null, emptyRecordId: null };
  }
}

/**
 * Backward compatible export helper
 */
export async function findRecordByMangaName(token, appToken, tableId, mangaName) {
  const { matchRecordId } = await findRecordTarget(token, appToken, tableId, mangaName);
  return matchRecordId;
}

/**
 * Build dynamic Bitable fields payload matching real table schema
 */
export function buildSmartFieldsPayload(rowData, actualFields = null) {
  const defaultPayload = {
    "漫画名": String(rowData.mangaName || "").trim(),
    "最新话数": Number(rowData.latestChapter) || 0,
    "当前进行话数": Number(rowData.currentChapter) || 0,
    "状态": String(rowData.status || "待翻译"),
    "图源": String(rowData.creator || ""),
    "参与人员 1": String(rowData.participants[0] || ""),
    "参与人员 2": String(rowData.participants[1] || ""),
    "参与人员 3": String(rowData.participants[2] || ""),
    "参与人员 4": String(rowData.participants[3] || ""),
    "最后编辑日期": new Date(rowData.lastEditDate || Date.now()).getTime()
  };

  if (!actualFields || !Array.isArray(actualFields) || actualFields.length === 0) {
    return defaultPayload;
  }

  const matchedPayload = {};

  const canonicalMap = [
    { key: "mangaName", aliases: ["漫画名", "漫画名称", "漫画", "项目名称", "项目名"], typeDefault: 1 },
    { key: "latestChapter", aliases: ["最新话数", "最新话", "上传最新话数"], typeDefault: 2 },
    { key: "currentChapter", aliases: ["当前进行话数", "进行中话数", "当前话数", "进行话数"], typeDefault: 2 },
    { key: "status", aliases: ["状态", "进度状态", "目前状态", "项目状态"], typeDefault: 1 },
    { key: "creator", aliases: ["图源", "创建人", "图源担当"], typeDefault: 1 },
    { key: "p1", aliases: ["参与人员 1", "参与人员1", "参与人员一"], typeDefault: 1 },
    { key: "p2", aliases: ["参与人员 2", "参与人员2", "参与人员二"], typeDefault: 1 },
    { key: "p3", aliases: ["参与人员 3", "参与人员3", "参与人员三"], typeDefault: 1 },
    { key: "p4", aliases: ["参与人员 4", "参与人员4", "参与人员四"], typeDefault: 1 },
    { key: "date", aliases: ["最后编辑日期", "编辑日期", "更新日期", "最后更新时间"], typeDefault: 5 }
  ];

  const getValueForCanonicalKey = (cKey) => {
    switch (cKey) {
      case "mangaName": return String(rowData.mangaName || "").trim();
      case "latestChapter": return Number(rowData.latestChapter) || 0;
      case "currentChapter": return Number(rowData.currentChapter) || 0;
      case "status": return String(rowData.status || "待翻译");
      case "creator": return String(rowData.creator || "");
      case "p1": return String(rowData.participants[0] || "");
      case "p2": return String(rowData.participants[1] || "");
      case "p3": return String(rowData.participants[2] || "");
      case "p4": return String(rowData.participants[3] || "");
      case "date": {
        const d = new Date(rowData.lastEditDate || Date.now());
        return isNaN(d.getTime()) ? Date.now() : d.getTime();
      }
      default: return "";
    }
  };

  for (const fieldSchema of actualFields) {
    const fname = fieldSchema.field_name;
    const ftype = fieldSchema.type;
    const fnameClean = fname.replace(/\s+/g, "").toLowerCase();

    for (const cGroup of canonicalMap) {
      const isMatch = cGroup.aliases.some(alias => {
        const aliasClean = alias.replace(/\s+/g, "").toLowerCase();
        return fnameClean === aliasClean;
      });

      if (isMatch) {
        let val = getValueForCanonicalKey(cGroup.key);
        if (ftype === 2) {
          val = Number(val) || 0;
        } else if (ftype === 5) {
          if (typeof val === "string") {
            const parsed = new Date(val).getTime();
            val = isNaN(parsed) ? Date.now() : parsed;
          }
        } else if (ftype === 1) {
          val = String(val);
        }
        matchedPayload[fname] = val;
        break;
      }
    }
  }

  return Object.keys(matchedPayload).length > 0 ? matchedPayload : defaultPayload;
}

/**
 * Upsert a single manga status row to Feishu Bitable
 * @param {Object} rowData - Formatted row data object
 */
export async function syncMangaToFeishu(rowData) {
  if (!rowData || !rowData.mangaName) {
    throw new Error("缺少有效的漫画数据，无法同步到飞书");
  }

  const token = await getFeishuTenantToken();
  const config = await getFeishuConfig();
  const { appToken, tableId } = config;

  if (!appToken || !tableId) {
    throw new Error("缺少 app_token 或 table_id，请检查设置");
  }

  // Ensure missing standard columns are automatically created first
  const actualFields = await ensureRequiredFieldsExist(token, appToken, tableId);
  const fieldsPayload = buildSmartFieldsPayload(rowData, actualFields);

  // Search for matching row or unused empty row
  const { matchRecordId, emptyRecordId } = await findRecordTarget(token, appToken, tableId, rowData.mangaName);
  const targetRecordId = matchRecordId || emptyRecordId;

  if (targetRecordId) {
    // Update existing or overwrite pre-allocated empty row
    const updateUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${targetRecordId}`;
    const res = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({ fields: fieldsPayload })
    });

    const resJson = await res.json();
    if (resJson.code !== 0) {
      throw new Error(`飞书更新记录失败 (错误码 ${resJson.code}): ${resJson.msg || "未知错误"}`);
    }
    return { action: "updated", recordId: targetRecordId, mangaName: rowData.mangaName };
  } else {
    // Insert new row if no empty rows left
    const insertUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
    const res = await fetch(insertUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({ fields: fieldsPayload })
    });

    const resJson = await res.json();
    if (resJson.code !== 0) {
      throw new Error(`飞书新增记录失败 (错误码 ${resJson.code}): ${resJson.msg || "未知错误"}`);
    }
    return { action: "created", recordId: resJson.data?.record?.record_id, mangaName: rowData.mangaName };
  }
}
