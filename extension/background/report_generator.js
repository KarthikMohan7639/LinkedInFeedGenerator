// background/report_generator.js
// Monthly report aggregation and dispatch

import { getAllRows, appendRow } from "../api/sheets_api.js";
import { sendEmail } from "../api/gmail_api.js";
import { getMonthlyReportTemplate } from "../templates/email_templates.js";
import { isAuthenticated } from "../api/google_auth.js";
import {
  SHEETS, COL_WITH_EMAIL, EMAIL_STATUS, ACK_STATUS, REPORT_RECIPIENT, REPORT_CC
} from "../utils/constants.js";
import { isSameMonth, getCurrentMonthYear } from "../utils/date_utils.js";
import { logger } from "../utils/logger.js";

const MODULE = "report_generator";

/**
 * Generates and emails the monthly report.
 */
export async function generateAndSendMonthlyReport() {
  if (!(await isAuthenticated())) {
    logger.warn(MODULE, "generateAndSendMonthlyReport skipped – not authenticated");
    throw new Error("Not authenticated. Please open Options and click Authenticate with Google.");
  }
  logger.info(MODULE, "Generating monthly report...");

  try {
    const { month, year } = getCurrentMonthYear();
    const now = new Date();

    const [withEmailRows, withoutEmailRows] = await Promise.all([
      getAllRows(SHEETS.WITH_EMAIL),
      getAllRows(SHEETS.WITHOUT_EMAIL)
    ]);

    // Filter to current month only
    const monthWithEmail    = withEmailRows.filter(r => isSameMonth(r[COL_WITH_EMAIL.SCRAPED_AT], now));
    const monthWithoutEmail = withoutEmailRows.filter(r => {
      return isSameMonth(r[4], now); // col E = scrapedAt for without-email sheet
    });

    const reportData = {
      month,
      year,
      totalPosts:          monthWithEmail.length + monthWithoutEmail.length,
      postsWithEmail:      monthWithEmail.length,
      postsWithoutEmail:   monthWithoutEmail.length,
      emailsSent:          monthWithEmail.filter(r => r[COL_WITH_EMAIL.EMAIL_STATUS] === EMAIL_STATUS.SENT).length,
      emailsFailed:        monthWithEmail.filter(r => r[COL_WITH_EMAIL.EMAIL_STATUS] === EMAIL_STATUS.FAILED).length,
      repliesReceived:     monthWithEmail.filter(r => r[COL_WITH_EMAIL.ACKNOWLEDGED] === ACK_STATUS.YES).length,
      followupsSent:       monthWithEmail.reduce((sum, r) => sum + (parseInt(r[COL_WITH_EMAIL.FOLLOWUP_COUNT], 10) || 0), 0)
    };

    logger.info(MODULE, "Report data compiled", reportData);

    // Get configured recipient or use defaults
    const { reportRecipient = REPORT_RECIPIENT, reportCC = REPORT_CC } =
      await chrome.storage.sync.get(["reportRecipient", "reportCC"]);

    const subject = `Monthly LinkedIn Outreach Report – ${month} ${year}`;
    const html    = getMonthlyReportTemplate(reportData);

    await sendEmail(reportRecipient, subject, html, reportCC);

    // Save report data to monthly_report sheet
    await appendRow(SHEETS.MONTHLY_REPORT, [
      month,
      year,
      reportData.totalPosts,
      reportData.postsWithEmail,
      reportData.postsWithoutEmail,
      reportData.emailsSent,
      reportData.emailsFailed,
      reportData.repliesReceived,
      reportData.followupsSent,
      new Date().toISOString()
    ]);

    await chrome.storage.local.set({ lastReportSentAt: new Date().toISOString() });

    logger.info(MODULE, `Monthly report sent to ${reportRecipient} (CC: ${reportCC})`);
    return reportData;
  } catch (err) {
    logger.error(MODULE, "Monthly report generation failed", err.message);
    throw err;
  }
}
