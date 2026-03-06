// background/email_classifier.js
// Processes email queue and sends follow-up emails

import { appendRow, getAllRows, findRowByPostUrl, updateRow } from "../api/sheets_api.js";
import { sendEmail, listReplies, getMessageDetail, parseSenderEmail } from "../api/gmail_api.js";
import { getOutreachTemplate, getFollowUpTemplate } from "../templates/email_templates.js";
import { isAuthenticated } from "../api/google_auth.js";
import {
  SHEETS, COL_WITH_EMAIL, COL_WITHOUT_EMAIL, EMAIL_STATUS, ACK_STATUS, EMAIL_TYPES
} from "../utils/constants.js";
import { formatDate, daysBetween } from "../utils/date_utils.js";
import { logger } from "../utils/logger.js";

const MODULE = "email_classifier";

const OUTREACH_SUBJECT = "Exciting Oil & Gas Opportunities in UAE – Kushi Consultancy";
const FOLLOWUP_SUBJECT = "Follow-Up: Oil & Gas Opportunities in UAE – Kushi Consultancy";

/**
 * Processes newly scraped posts: appends to sheets and sends initial emails.
 * @param {Array} posts - Array of LinkedInPost objects
 */
export async function classifyAndSavePosts(posts) {
  logger.info(MODULE, `Classifying ${posts.length} posts`);
  const emailQueue = [];

  for (const post of posts) {
    try {
      if (post.hasEmail) {
        const existingIdx = await findRowByPostUrl(SHEETS.WITH_EMAIL, post.postUrl);
        if (existingIdx === -1) {
          await appendRow(SHEETS.WITH_EMAIL, [
            post.postUrl,
            post.authorName,
            post.authorProfile,
            post.emails.join(", "),
            post.postText.substring(0, 500),
            post.scrapedAt,
            EMAIL_STATUS.PENDING,
            "",  // emailSentAt
            "",  // failureReason
            ACK_STATUS.PENDING,
            "",  // lastReplyText
            "",  // lastReplyAt
            "0", // followupCount
            "",  // lastFollowupSentAt
            (post.phones || []).join(", ")  // phones
          ]);
          emailQueue.push(post);
          logger.info(MODULE, `Saved post with email: ${post.authorName}`);
        } else {
          logger.debug(MODULE, `Duplicate post skipped (with email): ${post.postUrl}`);
        }
      } else {
        const existingIdx = await findRowByPostUrl(SHEETS.WITHOUT_EMAIL, post.postUrl);
        if (existingIdx === -1) {
          await appendRow(SHEETS.WITHOUT_EMAIL, [
            post.postUrl,
            post.authorName,
            post.authorProfile,
            post.postText.substring(0, 500),
            post.scrapedAt,
            (post.phones || []).join(", ")  // phones
          ]);
          logger.info(MODULE, `Saved post without email: ${post.authorName}`);
        } else {
          logger.debug(MODULE, `Duplicate post skipped (no email): ${post.postUrl}`);
        }
      }
    } catch (err) {
      logger.error(MODULE, `Failed to save post: ${post.postUrl}`, err.message);
    }
  }

  if (emailQueue.length > 0) {
    await processEmailQueue(emailQueue);
  }

  // Update stats in local storage
  try {
    const withEmailRows    = await getAllRows(SHEETS.WITH_EMAIL);
    const withoutEmailRows = await getAllRows(SHEETS.WITHOUT_EMAIL);
    await chrome.storage.local.set({
      statsWithEmail:    withEmailRows.length,
      statsWithoutEmail: withoutEmailRows.length,
      statsEmailsSent:   withEmailRows.filter(r => r[COL_WITH_EMAIL.EMAIL_STATUS] === EMAIL_STATUS.SENT).length,
      lastScrapeTime:    new Date().toISOString()
    });
  } catch (err) {
    logger.warn(MODULE, "Failed to update stats", err.message);
  }

  return { classified: posts.length, queued: emailQueue.length };
}

/**
 * Sends initial outreach emails for a batch of posts.
 * @param {Array} posts
 */
async function processEmailQueue(posts) {
  logger.info(MODULE, `Processing email queue: ${posts.length} posts`);

  for (const post of posts) {
    const rowIdx = await findRowByPostUrl(SHEETS.WITH_EMAIL, post.postUrl);
    if (rowIdx === -1) continue;

    const rows = await getAllRows(SHEETS.WITH_EMAIL);
    const row  = rows[rowIdx];

    // Skip if already processed
    if (row && row[COL_WITH_EMAIL.EMAIL_STATUS] !== EMAIL_STATUS.PENDING) {
      logger.debug(MODULE, `Skipping already-processed row for ${post.postUrl}`);
      continue;
    }

    // Send to the first email found (primary contact)
    const primaryEmail = post.emails[0];
    try {
      const result = await sendEmail(
        primaryEmail,
        OUTREACH_SUBJECT,
        getOutreachTemplate(post.authorName, post.postUrl)
      );

      await updateRow(SHEETS.WITH_EMAIL, rowIdx, {
        G: EMAIL_STATUS.SENT,
        H: new Date().toISOString(),
        I: "",
        J: ACK_STATUS.PENDING
      });

      await appendRow(SHEETS.EMAIL_LOG, [
        primaryEmail,
        post.authorName,
        OUTREACH_SUBJECT,
        EMAIL_TYPES.INITIAL,
        new Date().toISOString(),
        "Success",
        result.messageId
      ]);

      logger.info(MODULE, `Outreach email sent to ${primaryEmail} (${post.authorName})`);
    } catch (err) {
      await updateRow(SHEETS.WITH_EMAIL, rowIdx, {
        G: EMAIL_STATUS.FAILED,
        I: err.message
      });

      await appendRow(SHEETS.EMAIL_LOG, [
        primaryEmail,
        post.authorName,
        OUTREACH_SUBJECT,
        EMAIL_TYPES.INITIAL,
        new Date().toISOString(),
        "Failed",
        ""
      ]);

      logger.error(MODULE, `Failed to send outreach to ${primaryEmail}`, err.message);
    }
  }
}

/**
 * Weekly job: sends follow-up emails to clients who haven't acknowledged.
 */
export async function sendFollowUpEmails() {
  if (!(await isAuthenticated())) {
    logger.warn(MODULE, "sendFollowUpEmails skipped – not authenticated");
    return 0;
  }
  logger.info(MODULE, "Running weekly follow-up job");

  const { followupIntervalDays = 7 } = await chrome.storage.sync.get("followupIntervalDays");
  const rows = await getAllRows(SHEETS.WITH_EMAIL);
  let followupsSent = 0;

  for (let i = 0; i < rows.length; i++) {
    const row          = rows[i];
    const emailStatus  = row[COL_WITH_EMAIL.EMAIL_STATUS];
    const acknowledged = row[COL_WITH_EMAIL.ACKNOWLEDGED];
    const lastFollowup = row[COL_WITH_EMAIL.LAST_FOLLOWUP_AT];
    const emailSentAt  = row[COL_WITH_EMAIL.EMAIL_SENT_AT];
    const followupCount = parseInt(row[COL_WITH_EMAIL.FOLLOWUP_COUNT] || "0", 10);
    const authorName   = row[COL_WITH_EMAIL.AUTHOR_NAME];
    const emails       = row[COL_WITH_EMAIL.EMAILS];

    if (emailStatus !== EMAIL_STATUS.SENT)  continue;
    if (acknowledged === ACK_STATUS.YES)    continue;
    if (!emails)                            continue;

    // Check if enough time has passed
    const lastActionDate = lastFollowup || emailSentAt;
    if (!lastActionDate) continue;

    const daysSince = daysBetween(lastActionDate);
    if (daysSince < followupIntervalDays) continue;

    const primaryEmail = emails.split(",")[0].trim();
    const sentDateFormatted = formatDate(emailSentAt);

    try {
      const result = await sendEmail(
        primaryEmail,
        FOLLOWUP_SUBJECT,
        getFollowUpTemplate(authorName, sentDateFormatted, followupCount + 1)
      );

      await updateRow(SHEETS.WITH_EMAIL, i, {
        M: String(followupCount + 1),
        N: new Date().toISOString()
      });

      await appendRow(SHEETS.EMAIL_LOG, [
        primaryEmail,
        authorName,
        FOLLOWUP_SUBJECT,
        EMAIL_TYPES.FOLLOWUP,
        new Date().toISOString(),
        "Success",
        result.messageId
      ]);

      followupsSent++;
      logger.info(MODULE, `Follow-up #${followupCount + 1} sent to ${primaryEmail}`);
    } catch (err) {
      logger.error(MODULE, `Follow-up failed for ${primaryEmail}`, err.message);
    }
  }

  logger.info(MODULE, `Follow-up job complete. Sent: ${followupsSent}`);
  await chrome.storage.local.set({ statsFollowupsSent: followupsSent });
  return followupsSent;
}

/**
 * Polls Gmail inbox for replies from known clients and updates sheet.
 */
export async function pollGmailForReplies() {
  if (!(await isAuthenticated())) {
    logger.warn(MODULE, "pollGmailForReplies skipped – not authenticated");
    return 0;
  }
  logger.info(MODULE, "Polling Gmail for client replies");

  try {
    const { lastReplyCheck } = await chrome.storage.local.get("lastReplyCheck");
    const sinceIso = lastReplyCheck || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const replies = await listReplies(sinceIso);
    if (replies.length === 0) {
      logger.debug(MODULE, "No new replies found");
      await chrome.storage.local.set({ lastReplyCheck: new Date().toISOString() });
      return 0;
    }

    const rows = await getAllRows(SHEETS.WITH_EMAIL);
    let updatedCount = 0;

    for (const reply of replies) {
      try {
        const detail      = await getMessageDetail(reply.id);
        const senderEmail = parseSenderEmail(detail.from).toLowerCase();

        const matchIdx = rows.findIndex(r => {
          const cellEmails = (r[COL_WITH_EMAIL.EMAILS] || "").toLowerCase();
          return cellEmails.includes(senderEmail);
        });

        if (matchIdx !== -1) {
          const row = rows[matchIdx];
          // Only update if not already acknowledged
          if (row[COL_WITH_EMAIL.ACKNOWLEDGED] !== ACK_STATUS.YES) {
            await updateRow(SHEETS.WITH_EMAIL, matchIdx, {
              J: ACK_STATUS.YES,
              K: detail.snippet.substring(0, 200),
              L: detail.receivedAt
            });
            updatedCount++;
            logger.info(MODULE, `Reply logged from ${senderEmail}`, { snippet: detail.snippet });
          }
        }
      } catch (err) {
        logger.warn(MODULE, `Failed to process reply ${reply.id}`, err.message);
      }
    }

    await chrome.storage.local.set({ lastReplyCheck: new Date().toISOString() });
    logger.info(MODULE, `Reply poll complete. Updated: ${updatedCount}/${replies.length}`);
    return updatedCount;
  } catch (err) {
    logger.error(MODULE, "pollGmailForReplies failed", err.message);
    return 0;
  }
}
