// options/options.js
// Options page controller

const $ = id => document.getElementById(id);

// ─── Settings Keys ────────────────────────────────────────────────────────

const SYNC_KEYS = [
  "clientId", "spreadsheetId", "senderEmail", "searchKeyword",
  "followupIntervalDays", "reportRecipient", "reportCC",
  "outreachTemplate", "followupTemplate"
];

// ─── DOM Refs ────────────────────────────────────────────────────────────

const clientId           = $("clientId");
const redirectUri        = $("redirectUri");
const btnCopyRedirect    = $("btnCopyRedirect");
const spreadsheetId      = $("spreadsheetId");
const senderEmail        = $("senderEmail");
const searchKeyword      = $("searchKeyword");
const followupIntervalDays = $("followupIntervalDays");
const reportRecipient    = $("reportRecipient");
const reportCC           = $("reportCC");
const outreachTemplate   = $("outreachTemplate");
const followupTemplate   = $("followupTemplate");

const btnSave            = $("btnSave");
const btnAuthenticate    = $("btnAuthenticate");
const btnSignOut         = $("btnSignOut");
const btnInitSheets      = $("btnInitSheets");
const btnTestEmail       = $("btnTestEmail");
const btnOpenSheet       = $("btnOpenSheet");

const saveSuccess        = $("saveSuccess");
const saveError          = $("saveError");
const authStatus         = $("authStatus");
const authUser           = $("authUser");
const authUserEmail      = $("authUserEmail");

// ─── Alert Helpers ────────────────────────────────────────────────────────

function showAlert(el, message, duration = 5000) {
  el.textContent = message;
  el.classList.remove("hidden");
  if (duration > 0) setTimeout(() => el.classList.add("hidden"), duration);
}

function hideAll() {
  [saveSuccess, saveError, authStatus].forEach(el => el.classList.add("hidden"));
}

// ─── Tab Switching ────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    tab.classList.add("active");
    $(`tab-${tab.dataset.tab}`).classList.remove("hidden");
  });
});

// ─── Load Settings ────────────────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.sync.get(SYNC_KEYS);

  // Show the redirect URI so the user can register it in Google Cloud Console
  redirectUri.value = chrome.identity.getRedirectURL();

  // Copy button
  btnCopyRedirect.addEventListener("click", () => {
    navigator.clipboard.writeText(redirectUri.value).then(() => {
      const orig = btnCopyRedirect.textContent;
      btnCopyRedirect.textContent = "Copied!";
      setTimeout(() => { btnCopyRedirect.textContent = orig; }, 2000);
    });
  });

  if (data.clientId)             clientId.value             = data.clientId;
  if (data.spreadsheetId)        spreadsheetId.value        = data.spreadsheetId;
  if (data.senderEmail)          senderEmail.value          = data.senderEmail;
  if (data.searchKeyword)        searchKeyword.value        = data.searchKeyword;
  if (data.followupIntervalDays) followupIntervalDays.value = data.followupIntervalDays;
  if (data.reportRecipient)      reportRecipient.value      = data.reportRecipient;
  if (data.reportCC)             reportCC.value             = data.reportCC;
  if (data.outreachTemplate)     outreachTemplate.value     = data.outreachTemplate;
  if (data.followupTemplate)     followupTemplate.value     = data.followupTemplate;

  // Show auth state
  if (data.senderEmail) {
    authUserEmail.textContent = data.senderEmail;
    authUser.classList.remove("hidden");
  }

  // Update sheet link
  if (data.spreadsheetId) {
    btnOpenSheet.href = `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`;
  }
}

// ─── Save Settings ────────────────────────────────────────────────────────

async function saveSettings() {
  hideAll();

  const cid = clientId.value.trim();
  if (!cid) {
    showAlert(saveError, "✗ Google Client ID is required.", 0);
    clientId.focus();
    return;
  }

  const sid = spreadsheetId.value.trim();
  if (!sid) {
    showAlert(saveError, "✗ Spreadsheet ID is required.", 0);
    spreadsheetId.focus();
    return;
  }

  const settings = {
    clientId:             cid,
    spreadsheetId:        sid,
    searchKeyword:        searchKeyword.value.trim() || "UAE job positions Oil and gas onshore or offshore",
    followupIntervalDays: parseInt(followupIntervalDays.value, 10) || 7,
    reportRecipient:      reportRecipient.value.trim() || "madhu@kushiconsultancy.com",
    reportCC:             reportCC.value.trim()        || "kushi_head@outlook.com",
    outreachTemplate:     outreachTemplate.value.trim(),
    followupTemplate:     followupTemplate.value.trim()
  };

  await chrome.storage.sync.set(settings);

  // Update sheet link
  btnOpenSheet.href = `https://docs.google.com/spreadsheets/d/${sid}`;

  showAlert(saveSuccess, "✓ Settings saved successfully!");
}

// ─── Google Auth ──────────────────────────────────────────────────────────

async function sendMessage(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success === false) {
        reject(new Error(response.error || "Unknown error"));
      } else {
        resolve(response?.data);
      }
    });
  });
}

// Shared helper: exchange clientId → access token via launchWebAuthFlow
async function acquireToken(cid, interactive = true) {
  const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "email", "profile"
  ].join(" ");
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    `https://accounts.google.com/o/oauth2/auth` +
    `?client_id=${encodeURIComponent(cid)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES)}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      try {
        const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
        const token = params.get("access_token");
        const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
        if (!token) throw new Error("No access_token in OAuth response");
        resolve({ token, expiresIn });
      } catch (e) { reject(e); }
    });
  });
}

btnAuthenticate.addEventListener("click", async () => {
  hideAll();

  // Ensure clientId is saved before attempting auth
  const cid = clientId.value.trim();
  if (!cid) {
    showAlert(saveError, "✗ Please enter your Google Client ID first.", 0);
    clientId.focus();
    return;
  }

  const originalHTML = btnAuthenticate.innerHTML;
  btnAuthenticate.innerHTML = `<span class="spinner"></span> Authenticating...`;
  btnAuthenticate.disabled  = true;

  try {
    const { token, expiresIn } = await acquireToken(cid);

    // Cache token in local storage for the service worker
    await chrome.storage.local.set({
      gAccessToken:  token,
      gTokenExpiry:  Date.now() + expiresIn * 1000
    });

    // Fetch the user's email
    const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const userInfo = await resp.json();

    if (userInfo.email) {
      senderEmail.value = userInfo.email;
      await chrome.storage.sync.set({ senderEmail: userInfo.email });
      authUserEmail.textContent = userInfo.email;
      authUser.classList.remove("hidden");
      showAlert(authStatus, `✓ Authenticated as ${userInfo.email}`);
    }
  } catch (err) {
    showAlert(saveError, `✗ Authentication failed: ${err.message}`, 0);
  } finally {
    btnAuthenticate.innerHTML = originalHTML;
    btnAuthenticate.disabled  = false;
  }
});

btnSignOut.addEventListener("click", async () => {
  try {
    const { gAccessToken } = await chrome.storage.local.get("gAccessToken");
    if (gAccessToken) {
      // Best-effort revoke
      fetch(`https://accounts.google.com/o/oauth2/revoke?token=${gAccessToken}`).catch(() => {});
      await chrome.storage.local.remove(["gAccessToken", "gTokenExpiry"]);
    }
    senderEmail.value = "";
    await chrome.storage.sync.remove("senderEmail");
    authUser.classList.add("hidden");
    showAlert(authStatus, "Signed out from Google.");
  } catch (err) {
    showAlert(saveError, `Sign out error: ${err.message}`);
  }
});

// ─── Sheet Initialization ─────────────────────────────────────────────────

btnInitSheets.addEventListener("click", async () => {
  hideAll();
  const originalHTML = btnInitSheets.innerHTML;
  btnInitSheets.innerHTML = `<span class="spinner"></span>`;
  btnInitSheets.disabled  = true;

  try {
    await sendMessage("INIT_SHEETS");
    showAlert(authStatus, "✓ Sheets initialized (headers added to all tabs).");
  } catch (err) {
    showAlert(saveError, `✗ ${err.message}`, 0);
  } finally {
    btnInitSheets.innerHTML = originalHTML;
    btnInitSheets.disabled  = false;
  }
});

// ─── Test Email ───────────────────────────────────────────────────────────

btnTestEmail.addEventListener("click", async () => {
  hideAll();
  const originalHTML = btnTestEmail.innerHTML;
  btnTestEmail.innerHTML = `<span class="spinner"></span>`;
  btnTestEmail.disabled  = true;

  const recipient = reportRecipient.value.trim() || "madhu@kushiconsultancy.com";

  try {
    await sendMessage("SEND_TEST_EMAIL", { recipient });
    showAlert(authStatus, `✓ Test email sent to ${recipient}`);
  } catch (err) {
    showAlert(saveError, `✗ Test email failed: ${err.message}`, 0);
  } finally {
    btnTestEmail.innerHTML = originalHTML;
    btnTestEmail.disabled  = false;
  }
});

// ─── Save Button ──────────────────────────────────────────────────────────

btnSave.addEventListener("click", async () => {
  hideAll();
  const originalHTML = btnSave.innerHTML;
  btnSave.innerHTML = `<span class="spinner"></span> Saving...`;
  btnSave.disabled  = true;

  try {
    await saveSettings();
  } finally {
    btnSave.innerHTML = originalHTML;
    btnSave.disabled  = false;
  }
});

// Also save when Enter pressed in inputs
document.querySelectorAll("input").forEach(input => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnSave.click();
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────

loadSettings();
