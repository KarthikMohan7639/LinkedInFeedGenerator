// background/service_worker.js
// Main orchestrator – entry point for the Chrome Extension service worker
// v2.0: Screenshot-based capture with OCR processing

import { initializeAlarms } from "./scheduler.js";
import {
  classifyAndSavePosts,
  sendFollowUpEmails,
  pollGmailForReplies
} from "./email_classifier.js";
import { generateAndSendMonthlyReport } from "./report_generator.js";
import { ensureSheetsExist } from "../api/sheets_api.js";
import { sendEmail } from "../api/gmail_api.js";
import { extractContactsFromText } from "../utils/ocr_processor.js";
import { ALARM_NAMES, SHEETS } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

const MODULE = "service_worker";

// ─── Offscreen Document Management ─────────────────────────────────────────

let offscreenCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenCreated) return;

  // Check if already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"]
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["DOM_PARSER"],
    justification: "OCR processing requires DOM access for canvas image manipulation"
  });
  offscreenCreated = true;
  logger.info(MODULE, "Offscreen document created for OCR");
}

// ─── Screenshot Cropping ────────────────────────────────────────────────────

/**
 * Crop a full-tab screenshot to just the post area using OffscreenCanvas.
 * Since service workers don't have DOM, we send to offscreen doc for cropping.
 */
async function sendToOffscreen(message) {
  await ensureOffscreenDocument();
  const offscreenClients = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"]
  });
  if (!offscreenClients.length) {
    throw new Error("Offscreen document not available");
  }
  // Use sendMessage to the offscreen document (it's the only other extension context
  // listening). We tag messages with _target so our own onMessage handler can skip them.
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      ...message,
      _target: "offscreen"
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function cropScreenshot(fullScreenshotDataUrl, rect) {
  return sendToOffscreen({
    type: "CROP_IMAGE",
    imageDataUrl: fullScreenshotDataUrl,
    rect
  });
}

/**
 * Run OCR on an image via the offscreen document.
 */
async function runOCRViaOffscreen(imageDataUrl) {
  return sendToOffscreen({
    type: "RUN_OCR",
    imageDataUrl
  }).then(response => response || "");
}

// ─── Extension Lifecycle ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info(MODULE, `Extension installed/updated: ${details.reason}`);

  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }

  await initializeAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  logger.info(MODULE, "Browser started – re-initializing alarms");
  await initializeAlarms();
});

// ─── Alarm Handler ─────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  logger.info(MODULE, `Alarm fired: ${alarm.name}`);

  switch (alarm.name) {
    case ALARM_NAMES.WEEKLY_FOLLOWUP:
      try {
        const count = await sendFollowUpEmails();
        logger.info(MODULE, `Weekly follow-up complete. Sent: ${count}`);
      } catch (err) {
        logger.error(MODULE, "Weekly follow-up alarm error", err.message);
      }
      break;

    case ALARM_NAMES.MONTHLY_REPORT:
      try {
        await generateAndSendMonthlyReport();
      } catch (err) {
        logger.error(MODULE, "Monthly report alarm error", err.message);
      }
      break;

    case ALARM_NAMES.REPLY_POLL:
      try {
        await pollGmailForReplies();
      } catch (err) {
        logger.error(MODULE, "Reply poll alarm error", err.message);
      }
      break;

    default:
      logger.warn(MODULE, `Unknown alarm: ${alarm.name}`);
  }
});

// ─── Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Skip messages targeted at the offscreen document to avoid routing conflicts
  if (message._target === "offscreen") return false;

  logger.debug(MODULE, `Message received: ${message.type}`, { from: sender.id || "popup" });

  handleMessage(message, sender)
    .then(result => sendResponse({ success: true, data: result }))
    .catch(err  => {
      logger.error(MODULE, `Message handler error for ${message.type}`, err.message);
      sendResponse({ success: false, error: err.message });
    });

  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {

    // ── Screenshot Capture (called by content script per-post) ──
    case "CAPTURE_POST_SCREENSHOT": {
      const tabId = sender.tab?.id;
      if (!tabId) throw new Error("No tab ID for screenshot");

      // Capture the entire visible tab
      const fullScreenshot = await chrome.tabs.captureVisibleTab(null, {
        format: "png"
      });

      // Crop to the post's bounding rect
      const { rect } = message;
      if (rect && rect.width > 0 && rect.height > 0) {
        try {
          const cropped = await cropScreenshot(fullScreenshot, rect);
          return { imageDataUrl: cropped };
        } catch (err) {
          logger.warn(MODULE, "Crop failed, returning full screenshot", err.message);
          return { imageDataUrl: fullScreenshot };
        }
      }

      return { imageDataUrl: fullScreenshot };
    }

    // ── Posts Captured (sent by content script with all screenshots) ──
    case "POSTS_CAPTURED": {
      const capturedPosts = message.payload || [];
      if (!Array.isArray(capturedPosts) || capturedPosts.length === 0) {
        return { processed: 0, withEmail: 0, withoutEmail: 0 };
      }

      logger.info(MODULE, `Processing ${capturedPosts.length} captured posts`);

      // Store images for popup gallery
      const galleryItems = [];
      const processedPosts = [];

      for (const post of capturedPosts) {
        try {
          // Run OCR on each image
          let ocrText = "";
          try {
            ocrText = await runOCRViaOffscreen(post.imageDataUrl);
          } catch (err) {
            logger.warn(MODULE, `OCR failed for post ${post.postIndex}`, err.message);
          }

          // Extract contacts from OCR text
          const contacts = extractContactsFromText(ocrText);

          // Resolve author name — fallback to profile URL slug if DOM extraction failed
          let authorName = post.authorName || "Unknown";
          if (authorName === "Unknown" && post.authorProfile) {
            try {
              const profilePath = new URL(post.authorProfile).pathname;
              const slug = profilePath.split("/").filter(Boolean).pop();
              if (slug && slug !== "in" && slug !== "company" && slug !== "posts") {
                authorName = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
              }
            } catch { /* ignore */ }
          }

          const processedPost = {
            postUrl: post.postUrl,
            authorName,
            authorProfile: post.authorProfile,
            postText: contacts.rawText.substring(0, 500),
            emails: contacts.emails,
            phones: contacts.phones,
            hasEmail: contacts.emails.length > 0,
            scrapedAt: post.capturedAt,
            imageDataUrl: post.imageDataUrl
          };

          processedPosts.push(processedPost);

          galleryItems.push({
            postIndex: post.postIndex,
            postUrl: post.postUrl,
            authorName,
            authorProfile: post.authorProfile,
            imageDataUrl: post.imageDataUrl,
            emails: contacts.emails,
            phones: contacts.phones,
            ocrText: contacts.rawText.substring(0, 300),
            capturedAt: post.capturedAt
          });

          logger.info(MODULE,
            `Post ${post.postIndex}: ${post.authorName} | ` +
            `Emails: ${contacts.emails.join(", ") || "none"} | ` +
            `Phones: ${contacts.phones.join(", ") || "none"}`
          );
        } catch (err) {
          logger.error(MODULE, `Failed to process post ${post.postIndex}`, err.message);
        }
      }

      // Store gallery data for popup display
      await chrome.storage.local.set({
        capturedGallery: galleryItems,
        lastCaptureTime: new Date().toISOString()
      });

      // Save to sheets (reuse existing classifier)
      if (processedPosts.length > 0) {
        try {
          await ensureSheetsExist([
            SHEETS.WITH_EMAIL,
            SHEETS.WITHOUT_EMAIL,
            SHEETS.EMAIL_LOG,
            SHEETS.MONTHLY_REPORT
          ]);
          await classifyAndSavePosts(processedPosts);
        } catch (err) {
          logger.error(MODULE, "Failed to save to sheets", err.message);
        }
      }

      // Update stats
      await chrome.storage.local.set({
        lastScrapeTime: new Date().toISOString()
      });

      return {
        processed: processedPosts.length,
        withEmail: processedPosts.filter(p => p.hasEmail).length,
        withoutEmail: processedPosts.filter(p => !p.hasEmail).length
      };
    }

    // ── Legacy: Direct DOM scraping results (backward compat) ──
    case "POSTS_SCRAPED": {
      const posts = message.payload || [];
      if (!Array.isArray(posts) || posts.length === 0) {
        return { classified: 0, queued: 0 };
      }

      await ensureSheetsExist([
        SHEETS.WITH_EMAIL, SHEETS.WITHOUT_EMAIL,
        SHEETS.EMAIL_LOG, SHEETS.MONTHLY_REPORT
      ]);

      const result = await classifyAndSavePosts(posts);
      return result;
    }

    // ── Trigger Scrape from Popup ──
    case "TRIGGER_SCRAPE": {
      const { keyword } = message;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) throw new Error("No active tab found");

      const tab = tabs[0];
      if (!tab.url?.includes("linkedin.com")) {
        throw new Error("Please navigate to LinkedIn before scraping.");
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: triggerScraperOnPage,
        args: [keyword || null]
      });

      return { message: "Screenshot capture started on LinkedIn tab" };
    }

    // ── Get Captured Gallery for Popup ──
    case "GET_GALLERY": {
      const { capturedGallery = [], lastCaptureTime } =
        await chrome.storage.local.get(["capturedGallery", "lastCaptureTime"]);
      return { gallery: capturedGallery, lastCaptureTime };
    }

    // ── Clear Gallery ──
    case "CLEAR_GALLERY": {
      await chrome.storage.local.remove(["capturedGallery"]);
      return { cleared: true };
    }

    // ── Follow-ups ──
    case "SEND_FOLLOWUPS": {
      const count = await sendFollowUpEmails();
      return { sent: count };
    }

    // ── Check Replies ──
    case "CHECK_REPLIES": {
      const count = await pollGmailForReplies();
      return { updated: count };
    }

    // ── Monthly Report ──
    case "SEND_REPORT": {
      const report = await generateAndSendMonthlyReport();
      return report;
    }

    // ── Test Email ──
    case "SEND_TEST_EMAIL": {
      const { reportRecipient = "madhu@kushiconsultancy.com", senderEmail } =
        await chrome.storage.sync.get(["reportRecipient", "senderEmail"]);
      const to = message.recipient || reportRecipient;
      const subject = "LinkedIn Feed Generator – Gmail Connection Test";
      const html = `<p>Your Gmail integration is working correctly.</p>
        <p>Sent from: <strong>${senderEmail || "(not set)"}</strong><br>
        Sent at: ${new Date().toLocaleString()}</p>`;
      await sendEmail(to, subject, html);
      return { to };
    }

    // ── Stats ──
    case "GET_STATS": {
      const stats = await chrome.storage.local.get([
        "statsWithEmail", "statsWithoutEmail", "statsEmailsSent",
        "statsFollowupsSent", "lastScrapeTime", "lastReportSentAt"
      ]);
      return stats;
    }

    // ── Init Sheets ──
    case "INIT_SHEETS": {
      await ensureSheetsExist([
        SHEETS.WITH_EMAIL, SHEETS.WITHOUT_EMAIL,
        SHEETS.EMAIL_LOG, SHEETS.MONTHLY_REPORT
      ]);
      return { initialized: true };
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * Injected into the LinkedIn page to trigger the content script.
 */
function triggerScraperOnPage(keyword) {
  window.dispatchEvent(new CustomEvent("linkedin_scraper_trigger", {
    detail: { keyword }
  }));
}
