// api/google_auth.js
// Google OAuth 2.0 token management via chrome.identity.launchWebAuthFlow
// The client ID is stored in chrome.storage.sync and set via the Options page.

import { logger } from "../utils/logger.js";

const MODULE = "google_auth";

const TOKEN_KEY  = "gAccessToken";
const EXPIRY_KEY = "gTokenExpiry";

/**
 * Returns true if a valid (non-expired) token is cached in local storage.
 * Safe to call from any context including service workers.
 */
export async function isAuthenticated() {
  const { [TOKEN_KEY]: token, [EXPIRY_KEY]: expiry } =
    await chrome.storage.local.get([TOKEN_KEY, EXPIRY_KEY]);
  return !!(token && expiry && Date.now() < expiry - 60_000);
}

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "email",
  "profile"
].join(" ");

async function fetchNewToken(interactive) {
  const { clientId } = await chrome.storage.sync.get("clientId");
  if (!clientId) {
    throw new Error("Google Client ID not configured. Please add it in the Options page.");
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    `https://accounts.google.com/o/oauth2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES)}`;

  const redirectUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (url) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(url);
      }
    });
  });

  const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
  const token = params.get("access_token");
  const expiresIn = parseInt(params.get("expires_in") || "3600", 10);

  if (!token) throw new Error("No access token received from Google.");

  await chrome.storage.local.set({
    [TOKEN_KEY]:  token,
    [EXPIRY_KEY]: Date.now() + expiresIn * 1000
  });

  return token;
}

/**
 * Gets a valid OAuth2 access token. Uses a cached token when possible.
 * Pass interactive=false (or omit) when calling from a service worker —
 * launchWebAuthFlow requires a foreground user gesture.
 * @param {boolean} interactive - Whether to open the auth UI if no cached token
 * @returns {Promise<string>} access token
 */
export async function getAuthToken(interactive = false) {
  const { [TOKEN_KEY]: cached, [EXPIRY_KEY]: expiry } =
    await chrome.storage.local.get([TOKEN_KEY, EXPIRY_KEY]);

  // Use cached token if it's valid for at least 1 more minute
  if (cached && expiry && Date.now() < expiry - 60_000) {
    logger.debug(MODULE, "Using cached token");
    return cached;
  }

  if (!interactive) {
    throw new Error(
      "Authentication required. Please open the extension Options page and click Authenticate with Google."
    );
  }

  logger.debug(MODULE, "Fetching new token via launchWebAuthFlow");
  try {
    return await fetchNewToken(true);
  } catch (err) {
    logger.error(MODULE, "getAuthToken failed", err.message);
    throw err;
  }
}

/**
 * Revokes the cached token from Google's servers and clears local storage.
 */
export async function revokeToken() {
  try {
    const { [TOKEN_KEY]: token } = await chrome.storage.local.get(TOKEN_KEY);
    if (token) {
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
      await chrome.storage.local.remove([TOKEN_KEY, EXPIRY_KEY]);
    }
    logger.info(MODULE, "Token revoked successfully");
  } catch (err) {
    logger.warn(MODULE, "Token revoke failed (may already be expired)", err.message);
  }
}

/**
 * Clears the cached token. The next call to getAuthToken() will prompt the
 * user to re-authenticate via the Options page.
 */
export async function refreshToken() {
  await chrome.storage.local.remove([TOKEN_KEY, EXPIRY_KEY]);
  // Cannot do interactive auth from service worker context.
  // Throw a clear error so the UI can prompt re-authentication.
  throw new Error(
    "Session expired. Please open the extension Options page and click Authenticate with Google."
  );
}

/**
 * Gets the authenticated user's email address.
 * @returns {Promise<string>}
 */
export async function getAuthenticatedEmail() {
  const { senderEmail } = await chrome.storage.sync.get("senderEmail");
  if (senderEmail) return senderEmail;

  // Try non-interactive only (safe for service worker context)
  const token = await getAuthToken(false);
  const resp = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Failed to get user info: ${resp.status}`);
  const data = await resp.json();
  await chrome.storage.sync.set({ senderEmail: data.email });
  logger.info(MODULE, "Authenticated email retrieved", data.email);
  return data.email;
}

/**
 * Makes an authenticated fetch request, retrying once on 401 with a fresh token.
 * @param {string} url
 * @param {object} options - fetch options
 * @returns {Promise<Response>}
 */
export async function authFetch(url, options = {}) {
  let token = await getAuthToken(false);  // non-interactive; safe from service worker
  const makeRequest = async (t) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json"
      }
    });
  };

  let resp = await makeRequest(token);

  if (resp.status === 401) {
    logger.warn(MODULE, "Token expired – clearing cache. User must re-authenticate.");
    await chrome.storage.local.remove([TOKEN_KEY, EXPIRY_KEY]);
    throw new Error(
      "Session expired. Please open the extension Options page and click Authenticate with Google."
    );
  }

  return resp;
}
