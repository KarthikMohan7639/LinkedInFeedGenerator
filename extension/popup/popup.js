// popup/popup.js
// Popup UI controller with image gallery for captured LinkedIn posts

const $ = id => document.getElementById(id);

// ─── State ────────────────────────────────────────────────────────────────

let isWorking = false;

// ─── DOM References ───────────────────────────────────────────────────────

const btnScrape       = $("btnScrape");
const btnFollowup     = $("btnFollowup");
const btnReplies      = $("btnReplies");
const btnReport       = $("btnReport");
const btnOptions      = $("btnOptions");
const btnAuth         = $("btnAuth");
const btnClearGallery = $("btnClearGallery");
const footerOptions   = $("footerOptions");

const keywordInput   = $("keyword");
const scrapeText     = $("scrapeText");
const statusDot      = $("statusDot");
const statusText     = $("statusText");
const lastScrape     = $("lastScrape");
const authBanner     = $("authBanner");
const successBanner  = $("successBanner");
const errorBanner    = $("errorBanner");
const footerStatus   = $("footerStatus");

const statWithEmail    = $("statWithEmail");
const statWithoutEmail = $("statWithoutEmail");
const statEmailsSent   = $("statEmailsSent");
const statFollowups    = $("statFollowups");

const linkWithEmail    = $("linkWithEmail");
const linkWithoutEmail = $("linkWithoutEmail");

const galleryGrid    = $("galleryGrid");
const galleryCount   = $("galleryCount");
const galleryEmpty   = $("galleryEmpty");

// Modal
const imageModal   = $("imageModal");
const modalBackdrop = $("modalBackdrop");
const modalClose    = $("modalClose");
const modalImage    = $("modalImage");
const modalInfo     = $("modalInfo");

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
  if (btnFollowup) btnFollowup.disabled = working;
  if (btnReplies)  btnReplies.disabled  = working;
  if (btnReport)   btnReport.disabled   = working;

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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

// ─── Tab Switching ────────────────────────────────────────────────────────

document.querySelectorAll(".popup-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".popup-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".popup-tab-content").forEach(c => c.classList.add("hidden"));
    tab.classList.add("active");
    $(`tab-${tab.dataset.tab}`).classList.remove("hidden");
  });
});

// ─── Gallery ──────────────────────────────────────────────────────────────

function renderGallery(gallery) {
  // Clear existing cards (keep the empty state element)
  const cards = galleryGrid.querySelectorAll(".gallery-card");
  cards.forEach(c => c.remove());

  if (!gallery || gallery.length === 0) {
    galleryEmpty.classList.remove("hidden");
    galleryCount.textContent = "No captures yet";
    return;
  }

  galleryEmpty.classList.add("hidden");
  galleryCount.textContent = `${gallery.length} post${gallery.length !== 1 ? "s" : ""} captured`;

  gallery.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "gallery-card";

    const emailsHtml = item.emails && item.emails.length > 0
      ? `<div class="gallery-contact has-data">📧 ${escapeHtml(item.emails.join(", "))}</div>`
      : `<div class="gallery-contact">📧 No email found</div>`;

    const phonesHtml = item.phones && item.phones.length > 0
      ? `<div class="gallery-contact has-data">📱 ${escapeHtml(item.phones.join(", "))}</div>`
      : `<div class="gallery-contact">📱 No phone found</div>`;

    const timeStr = item.capturedAt ? formatRelativeTime(item.capturedAt) : "";

    card.innerHTML = `
      <img class="gallery-card-image" src="${item.imageDataUrl}" alt="Post screenshot"
           data-idx="${idx}" loading="lazy">
      <div class="gallery-card-body">
        <div class="gallery-card-author">
          👤 ${escapeHtml(item.authorName || "Unknown")}
        </div>
        <div class="gallery-card-contacts">
          ${emailsHtml}
          ${phonesHtml}
        </div>
        ${timeStr ? `<div class="gallery-card-time">${timeStr}</div>` : ""}
      </div>
    `;

    // Click image to open modal
    const imgEl = card.querySelector(".gallery-card-image");
    imgEl.addEventListener("click", () => openModal(item));

    galleryGrid.appendChild(card);
  });
}

function openModal(item) {
  modalImage.src = item.imageDataUrl;

  const emailStr = item.emails?.length ? item.emails.join(", ") : "None";
  const phoneStr = item.phones?.length ? item.phones.join(", ") : "None";

  modalInfo.innerHTML = `
    <div><strong>Author:</strong> ${escapeHtml(item.authorName || "Unknown")}</div>
    <div><strong>Emails:</strong> ${escapeHtml(emailStr)}</div>
    <div><strong>Phones:</strong> ${escapeHtml(phoneStr)}</div>
    ${item.ocrText ? `<div style="margin-top:6px;"><strong>OCR Text:</strong> ${escapeHtml(item.ocrText.substring(0, 200))}${item.ocrText.length > 200 ? "..." : ""}</div>` : ""}
  `;

  imageModal.classList.remove("hidden");
}

function closeModal() {
  imageModal.classList.add("hidden");
  modalImage.src = "";
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

async function loadGallery() {
  try {
    const result = await sendMessage("GET_GALLERY");
    if (result?.gallery) {
      renderGallery(result.gallery);
    }
  } catch {
    // Gallery may not exist yet
  }
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

  if (spreadsheetId) {
    const sheetBase = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}`;
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
    // Non-critical
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

  await chrome.storage.sync.set({ searchKeyword: keyword });

  const originalHTML = btnScrape.innerHTML;
  setWorking(true, btnScrape, originalHTML);
  setStatus("running", "Capturing LinkedIn posts...");

  try {
    const result = await sendMessage("TRIGGER_SCRAPE", { keyword });
    setStatus("done", "Capture started on LinkedIn tab");
    showBanner("success", `✓ Screenshot capture started! Check LinkedIn tab.`);

    // Poll for gallery updates every 5 seconds for up to 90 seconds
    let pollCount = 0;
    const maxPolls = 18;
    const pollInterval = setInterval(async () => {
      pollCount++;
      try {
        await loadGallery();
        await loadStats();
      } catch { /* ignore */ }
      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        setStatus("idle", "Idle");
      }
    }, 5000);
  } catch (err) {
    setStatus("error", "Capture failed");
    showBanner("error", `✗ ${err.message}`);
  } finally {
    setWorking(false, btnScrape, originalHTML);
  }
});

btnClearGallery.addEventListener("click", async () => {
  try {
    await sendMessage("CLEAR_GALLERY");
    renderGallery([]);
    showBanner("success", "✓ Gallery cleared");
  } catch (err) {
    showBanner("error", `✗ ${err.message}`);
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
  await loadGallery();
  setStatus("idle", "Idle");
})();
