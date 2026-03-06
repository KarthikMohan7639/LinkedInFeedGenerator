// popup/popup.js
// Popup UI controller

const $ = id => document.getElementById(id);

// ─── State ────────────────────────────────────────────────────────────────

let isWorking = false;

// ─── DOM References ───────────────────────────────────────────────────────

const btnScrape    = $("btnScrape");
const btnFollowup  = $("btnFollowup");
const btnReplies   = $("btnReplies");
const btnReport    = $("btnReport");
const btnOptions   = $("btnOptions");
const btnAuth      = $("btnAuth");
const footerOptions= $("footerOptions");

const keywordInput  = $("keyword");
const scrapeText    = $("scrapeText");
const statusDot     = $("statusDot");
const statusText    = $("statusText");
const lastScrape    = $("lastScrape");
const authBanner    = $("authBanner");
const successBanner = $("successBanner");
const errorBanner   = $("errorBanner");
const footerStatus  = $("footerStatus");

const statWithEmail    = $("statWithEmail");
const statWithoutEmail = $("statWithoutEmail");
const statEmailsSent   = $("statEmailsSent");
const statFollowups    = $("statFollowups");

const linkWithEmail    = $("linkWithEmail");
const linkWithoutEmail = $("linkWithoutEmail");

// ─── Helpers ──────────────────────────────────────────────────────────────

function setStatus(state, text) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
  footerStatus.textContent = text;
}

function showBanner(type, message) {
  [authBanner, successBanner, errorBanner].forEach(b => b.classList.add("hidden"));
  if (type === "success") {
    successBanner.textContent = message;
    successBanner.classList.remove("hidden");
    setTimeout(() => successBanner.classList.add("hidden"), 4000);
  } else if (type === "error") {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    setTimeout(() => errorBanner.classList.add("hidden"), 6000);
  } else if (type === "auth") {
    authBanner.classList.remove("hidden");
  }
}

function setWorking(working, buttonEl, originalHtml) {
  isWorking = working;
  btnScrape.disabled   = working;
  btnFollowup.disabled = working;
  btnReplies.disabled  = working;
  btnReport.disabled   = working;

  if (working) {
    buttonEl.innerHTML = `<span class="spinner"></span> Working...`;
  } else {
    buttonEl.innerHTML = originalHtml;
  }
}

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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

// ─── Load Settings & Stats ────────────────────────────────────────────────

async function loadSettings() {
  const { searchKeyword, spreadsheetId } = await chrome.storage.sync.get([
    "searchKeyword", "spreadsheetId"
  ]);

  if (searchKeyword) keywordInput.value = searchKeyword;

  if (!spreadsheetId) {
    showBanner("auth");
  }

  // Build sheet links
  if (spreadsheetId) {
    const sheetBase = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    linkWithEmail.href    = sheetBase;
    linkWithoutEmail.href = sheetBase;
  }
}

async function loadStats() {
  try {
    const stats = await sendMessage("GET_STATS");
    if (stats) {
      statWithEmail.textContent    = stats.statsWithEmail    ?? "–";
      statWithoutEmail.textContent = stats.statsWithoutEmail ?? "–";
      statEmailsSent.textContent   = stats.statsEmailsSent   ?? "–";
      statFollowups.textContent    = stats.statsFollowupsSent ?? "–";
      if (stats.lastScrapeTime) {
        lastScrape.textContent = formatRelativeTime(stats.lastScrapeTime);
      }
    }
  } catch {
    // Non-critical – stats may not be available on first load
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────

btnScrape.addEventListener("click", async () => {
  if (isWorking) return;

  const keyword = keywordInput.value.trim();
  if (!keyword) {
    showBanner("error", "Please enter a search keyword.");
    return;
  }

  // Save keyword to storage
  await chrome.storage.sync.set({ searchKeyword: keyword });

  const originalHTML = btnScrape.innerHTML;
  setWorking(true, btnScrape, originalHTML);
  setStatus("running", "Scraping LinkedIn...");

  try {
    const result = await sendMessage("TRIGGER_SCRAPE", { keyword });
    setStatus("done", "Scrape triggered on LinkedIn tab");
    showBanner("success", `✓ Scraper injected! Check LinkedIn tab. ${result?.message || ""}`);

    // Refresh stats after a short delay
    setTimeout(loadStats, 5000);
  } catch (err) {
    setStatus("error", "Scrape failed");
    showBanner("error", `✗ ${err.message}`);
  } finally {
    setWorking(false, btnScrape, originalHTML);
  }
});

btnFollowup.addEventListener("click", async () => {
  if (isWorking) return;

  const originalHTML = btnFollowup.innerHTML;
  setWorking(true, btnFollowup, originalHTML);
  setStatus("running", "Sending follow-up emails...");

  try {
    const result = await sendMessage("SEND_FOLLOWUPS");
    setStatus("done", "Follow-ups sent");
    showBanner("success", `✓ Follow-up emails sent: ${result?.sent ?? 0}`);
    await loadStats();
  } catch (err) {
    setStatus("error", "Follow-up failed");
    showBanner("error", `✗ ${err.message}`);
  } finally {
    setWorking(false, btnFollowup, originalHTML);
  }
});

btnReplies.addEventListener("click", async () => {
  if (isWorking) return;

  const originalHTML = btnReplies.innerHTML;
  setWorking(true, btnReplies, originalHTML);
  setStatus("running", "Checking Gmail for replies...");

  try {
    const result = await sendMessage("CHECK_REPLIES");
    setStatus("done", "Replies checked");
    showBanner("success", `✓ Replies checked. Updated: ${result?.updated ?? 0} rows`);
    await loadStats();
  } catch (err) {
    setStatus("error", "Reply check failed");
    showBanner("error", `✗ ${err.message}`);
  } finally {
    setWorking(false, btnReplies, originalHTML);
  }
});

btnReport.addEventListener("click", async () => {
  if (isWorking) return;

  const originalHTML = btnReport.innerHTML;
  setWorking(true, btnReport, originalHTML);
  setStatus("running", "Generating monthly report...");

  try {
    await sendMessage("SEND_REPORT");
    setStatus("done", "Report sent");
    showBanner("success", "✓ Monthly report emailed to madhu@kushiconsultancy.com");
  } catch (err) {
    setStatus("error", "Report failed");
    showBanner("error", `✗ ${err.message}`);
  } finally {
    setWorking(false, btnReport, originalHTML);
  }
});

btnOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
footerOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

btnAuth.addEventListener("click", () => chrome.runtime.openOptionsPage());

// Save keyword on change
keywordInput.addEventListener("change", async () => {
  const keyword = keywordInput.value.trim();
  if (keyword) await chrome.storage.sync.set({ searchKeyword: keyword });
});

// ─── Init ─────────────────────────────────────────────────────────────────

(async () => {
  await loadSettings();
  await loadStats();
  setStatus("idle", "Idle");
})();
