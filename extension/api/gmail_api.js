// api/gmail_api.js
// Gmail API v1 – send emails and detect replies

import { authFetch, getAuthenticatedEmail } from "./google_auth.js";
import { GMAIL_BASE_URL } from "../utils/constants.js";
import { toUnixTimestamp } from "../utils/date_utils.js";
import { logger } from "../utils/logger.js";

const MODULE = "gmail_api";

/**
 * Encodes a string to base64url format (required by Gmail API).
 * @param {string} str
 */
function toBase64Url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Builds a MIME email message string.
 * @param {object} params
 * @param {string} params.from
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.htmlBody
 * @param {string} [params.cc]
 */
function buildMimeMessage({ from, to, subject, htmlBody, cc }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    htmlBody
  ].filter(l => l !== null);

  return lines.join("\r\n");
}

/**
 * Sends an email via Gmail API.
 * @param {string} to - recipient email
 * @param {string} subject
 * @param {string} htmlBody
 * @param {string} [cc] - optional CC address
 * @returns {Promise<{ messageId: string, success: boolean }>}
 */
export async function sendEmail(to, subject, htmlBody, cc = null) {
  const from = await getAuthenticatedEmail();
  const mime = buildMimeMessage({ from, to, subject, htmlBody, cc });
  const raw  = toBase64Url(mime);

  const resp = await authFetch(`${GMAIL_BASE_URL}/messages/send`, {
    method: "POST",
    body: JSON.stringify({ raw })
  });

  if (!resp.ok) {
    const err = await resp.text();
    logger.error(MODULE, `sendEmail failed to ${to}`, err);
    throw new Error(`Gmail send failed (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  logger.info(MODULE, `Email sent to ${to}`, { messageId: data.id, subject });
  return { messageId: data.id, success: true };
}

/**
 * Lists messages in inbox that are replies after a given timestamp.
 * @param {string} sinceIso - ISO 8601 timestamp
 * @returns {Promise<Array>} array of { id, threadId }
 */
export async function listReplies(sinceIso) {
  const unixTs = toUnixTimestamp(sinceIso);
  const query  = encodeURIComponent(`in:inbox after:${unixTs}`);
  const url    = `${GMAIL_BASE_URL}/messages?q=${query}&maxResults=50`;

  const resp = await authFetch(url);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`listReplies failed (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  logger.debug(MODULE, `Found ${(data.messages || []).length} potential replies`);
  return data.messages || [];
}

/**
 * Fetches message detail snippet and headers.
 * @param {string} messageId
 * @returns {Promise<{ from: string, snippet: string, receivedAt: string, threadId: string }>}
 */
export async function getMessageDetail(messageId) {
  const url  = `${GMAIL_BASE_URL}/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Date`;
  const resp = await authFetch(url);

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`getMessageDetail failed (${resp.status}): ${err}`);
  }

  const data    = await resp.json();
  const headers = data.payload?.headers || [];

  const fromHeader = headers.find(h => h.name === "From")?.value || "";
  const dateHeader = headers.find(h => h.name === "Date")?.value  || "";

  let receivedAt;
  try {
    receivedAt = new Date(dateHeader).toISOString();
  } catch {
    receivedAt = new Date().toISOString();
  }

  return {
    from:       fromHeader,
    snippet:    data.snippet || "",
    receivedAt,
    threadId:   data.threadId
  };
}

/**
 * Extracts email address from a "From" header value like "John Doe <john@example.com>".
 * @param {string} fromHeader
 * @returns {string}
 */
export function parseSenderEmail(fromHeader) {
  const match = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].toLowerCase().trim() : fromHeader.toLowerCase().trim();
}
