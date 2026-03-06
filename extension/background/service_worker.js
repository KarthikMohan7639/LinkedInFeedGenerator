// background/service_worker.js
// Main orchestrator – entry point for the Chrome Extension service worker

import { initializeAlarms } from "./scheduler.js";
import {
  classifyAndSavePosts,
  sendFollowUpEmails,
  pollGmailForReplies
} from "./email_classifier.js";
import { generateAndSendMonthlyReport } from "./report_generator.js";
import { ensureSheetsExist } from "../api/sheets_api.js";
import { sendEmail } from "../api/gmail_api.js";
import { ALARM_NAMES, SHEETS } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

const MODULE = "service_worker";

// ─── Extension Lifecycle ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  logger.info(MODULE, `Extension installed/updated: ${details.reason}`);

  if (details.reason === "install") {
    // Open options page on fresh install
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
  logger.debug(MODULE, `Message received: ${message.type}`, { from: sender.id || "popup" });

  // Must return true to use async sendResponse
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

    // Triggered by popup "Scrape Now" button
    case "TRIGGER_SCRAPE": {
      const { keyword } = message;
      // Inject content script into the active LinkedIn tab
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

      return { message: "Scraper injected into LinkedIn tab" };
    }

    // Sent by content script after scraping
    case "POSTS_SCRAPED": {
      const posts = message.payload || [];
      if (!Array.isArray(posts) || posts.length === 0) {
        return { classified: 0, queued: 0 };
      }

      // Ensure sheets and headers are set up
      await ensureSheetsExist([
        SHEETS.WITH_EMAIL,
        SHEETS.WITHOUT_EMAIL,
        SHEETS.EMAIL_LOG,
        SHEETS.MONTHLY_REPORT
      ]);

      const result = await classifyAndSavePosts(posts);
      return result;
    }

    // Manual send follow-ups from popup
    case "SEND_FOLLOWUPS": {
      const count = await sendFollowUpEmails();
      return { sent: count };
    }

    // Manual check for replies from popup
    case "CHECK_REPLIES": {
      const count = await pollGmailForReplies();
      return { updated: count };
    }

    // Send monthly report manually
    case "SEND_REPORT": {
      const report = await generateAndSendMonthlyReport();
      return report;
    }

    // Quick Gmail connectivity test — no Sheets calls
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

    // Get current live stats for popup display
    case "GET_STATS": {
      const stats = await chrome.storage.local.get([
        "statsWithEmail", "statsWithoutEmail", "statsEmailsSent",
        "statsFollowupsSent", "lastScrapeTime", "lastReportSentAt"
      ]);
      return stats;
    }

    // Initialize / re-check sheets
    case "INIT_SHEETS": {
      await ensureSheetsExist([
        SHEETS.WITH_EMAIL,
        SHEETS.WITHOUT_EMAIL,
        SHEETS.EMAIL_LOG,
        SHEETS.MONTHLY_REPORT
      ]);
      return { initialized: true };
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * This function is injected into the LinkedIn page to call the scraper.
 * It must be a standalone function (no closure over SW variables).
 * @param {string|null} keyword
 */
function triggerScraperOnPage(keyword) {
  // Signal the content script to run
  window.dispatchEvent(new CustomEvent("linkedin_scraper_trigger", {
    detail: { keyword }
  }));
}
