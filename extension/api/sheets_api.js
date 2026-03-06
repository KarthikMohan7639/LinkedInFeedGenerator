// api/sheets_api.js
// Google Sheets API v4 CRUD operations

import { authFetch } from "./google_auth.js";
import { SHEETS_BASE_URL, MAX_RETRY_ATTEMPTS, RETRY_DELAY_MS } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

const MODULE = "sheets_api";

async function getSpreadsheetId() {
  const { spreadsheetId } = await chrome.storage.sync.get("spreadsheetId");
  if (!spreadsheetId) throw new Error("Spreadsheet ID not configured. Please set it in Options.");
  return spreadsheetId;
}

/**
 * Retries an async operation with exponential backoff.
 */
async function withRetry(fn, attempts = MAX_RETRY_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      const delay = RETRY_DELAY_MS * Math.pow(2, i);
      logger.warn(MODULE, `Retry ${i + 1}/${attempts} after ${delay}ms`, err.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Appends a row to a named sheet.
 * @param {string} sheetName
 * @param {Array} rowValues
 */
export async function appendRow(sheetName, rowValues) {
  return withRetry(async () => {
    const id  = await getSpreadsheetId();
    const url = `${SHEETS_BASE_URL}/${id}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const resp = await authFetch(url, {
      method: "POST",
      body: JSON.stringify({ values: [rowValues] })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`appendRow failed (${resp.status}): ${err}`);
    }

    logger.debug(MODULE, `Row appended to "${sheetName}"`);
    return await resp.json();
  });
}

/**
 * Gets all rows from a named sheet.
 * @param {string} sheetName
 * @returns {Promise<Array[]>} 2D array of values
 */
export async function getAllRows(sheetName) {
  return withRetry(async () => {
    const id  = await getSpreadsheetId();
    const url = `${SHEETS_BASE_URL}/${id}/values/${encodeURIComponent(sheetName)}`;

    const resp = await authFetch(url);
    if (!resp.ok) {
      if (resp.status === 400) {
        // Sheet may not exist yet
        return [];
      }
      const err = await resp.text();
      throw new Error(`getAllRows failed (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    // Skip header row (row index 0)
    const rows = (data.values || []).slice(1);
    logger.debug(MODULE, `Fetched ${rows.length} rows from "${sheetName}"`);
    return rows;
  });
}

/**
 * Updates specific cells in a row using a column-letter → value map.
 * @param {string} sheetName
 * @param {number} rowIndex - 1-based row index in the sheet (accounting for header)
 * @param {Object} columnMap - e.g., { G: "Sent", H: "2026-03-04T10:00:00Z" }
 */
export async function updateRow(sheetName, rowIndex, columnMap) {
  return withRetry(async () => {
    const id = await getSpreadsheetId();
    // rowIndex from getAllRows is 0-based in the data array; sheet row = rowIndex + 2 (1 for header + 1 for 1-based)
    const sheetRow = rowIndex + 2;

    const data = Object.entries(columnMap).map(([col, value]) => ({
      range: `${sheetName}!${col}${sheetRow}`,
      values: [[value]]
    }));

    const url = `${SHEETS_BASE_URL}/${id}/values:batchUpdate`;
    const resp = await authFetch(url, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`updateRow failed (${resp.status}): ${err}`);
    }

    logger.debug(MODULE, `Row ${sheetRow} updated in "${sheetName}"`, columnMap);
    return await resp.json();
  });
}

/**
 * Finds the index (0-based, data-array index) of a row by postUrl (Column A).
 * @param {string} sheetName
 * @param {string} postUrl
 * @returns {Promise<number>} index in data array, or -1 if not found
 */
export async function findRowByPostUrl(sheetName, postUrl) {
  const rows = await getAllRows(sheetName);
  return rows.findIndex(row => row[0] === postUrl);
}

/**
 * Ensures all required sheets exist by checking the spreadsheet metadata.
 * Creates missing sheets.
 * @param {string[]} sheetNames
 */
export async function ensureSheetsExist(sheetNames) {
  return withRetry(async () => {
    const id      = await getSpreadsheetId();
    const metaUrl = `${SHEETS_BASE_URL}/${id}?fields=sheets.properties.title`;
    const resp    = await authFetch(metaUrl);

    if (!resp.ok) throw new Error(`Failed to fetch spreadsheet metadata: ${resp.status}`);

    const meta     = await resp.json();
    const existing = (meta.sheets || []).map(s => s.properties.title);

    const missing = sheetNames.filter(n => !existing.includes(n));
    if (missing.length === 0) return;

    const requests = missing.map(title => ({
      addSheet: { properties: { title } }
    }));

    const batchUrl = `${SHEETS_BASE_URL}/${id}:batchUpdate`;
    const batchResp = await authFetch(batchUrl, {
      method: "POST",
      body: JSON.stringify({ requests })
    });

    if (!batchResp.ok) {
      const err = await batchResp.text();
      throw new Error(`ensureSheetsExist failed: ${err}`);
    }

    logger.info(MODULE, "Created missing sheets", missing);

    // Add headers to newly created sheets
    for (const name of missing) {
      await addSheetHeaders(name);
    }
  });
}

async function addSheetHeaders(sheetName) {
  const headers = {
    "client with email": [
      "postUrl", "authorName", "authorProfile", "emails",
      "postText", "scrapedAt", "emailStatus", "emailSentAt",
      "failureReason", "acknowledged", "lastReplyText",
      "lastReplyAt", "followupCount", "lastFollowupSentAt", "phones"
    ],
    "client without email": [
      "postUrl", "authorName", "authorProfile", "postText", "scrapedAt", "phones"
    ],
    "email_log": [
      "recipientEmail", "authorName", "subject", "type",
      "sentAt", "status", "gmailMessageId"
    ],
    "monthly_report": [
      "month", "year", "totalPosts", "postsWithEmail", "postsWithoutEmail",
      "emailsSent", "emailsFailed", "repliesReceived", "followupsSent", "generatedAt"
    ]
  };

  if (headers[sheetName]) {
    const id  = await getSpreadsheetId();
    const url = `${SHEETS_BASE_URL}/${id}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED`;
    await authFetch(url, {
      method: "POST",
      body: JSON.stringify({ values: [headers[sheetName]] })
    });
    logger.debug(MODULE, `Headers added to "${sheetName}"`);
  }
}
