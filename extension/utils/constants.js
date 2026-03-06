// utils/constants.js
// App-wide constants for LinkedIn Data Feed Generator

export const SEARCH_KEYWORD = "UAE job positions Oil and gas onshore or offshore";

export const SHEETS = {
  WITH_EMAIL:    "client with email",
  WITHOUT_EMAIL: "client without email",
  EMAIL_LOG:     "email_log",
  MONTHLY_REPORT: "monthly_report"
};

export const EMAIL_STATUS = {
  PENDING: "Pending",
  SENT:    "Sent",
  FAILED:  "Failed"
};

export const ACK_STATUS = {
  YES:     "Yes",
  NO:      "No",
  PENDING: "Pending"
};

export const EMAIL_TYPES = {
  INITIAL:  "initial",
  FOLLOWUP: "followup",
  REPORT:   "report"
};

export const ALARM_NAMES = {
  WEEKLY_FOLLOWUP: "weekly_followup",
  MONTHLY_REPORT:  "monthly_report",
  REPLY_POLL:      "reply_poll"
};

// Column indices (0-based) for "client with email" sheet
export const COL_WITH_EMAIL = {
  POST_URL:          0,  // A
  AUTHOR_NAME:       1,  // B
  AUTHOR_PROFILE:    2,  // C
  EMAILS:            3,  // D
  POST_TEXT:         4,  // E
  SCRAPED_AT:        5,  // F
  EMAIL_STATUS:      6,  // G
  EMAIL_SENT_AT:     7,  // H
  FAILURE_REASON:    8,  // I
  ACKNOWLEDGED:      9,  // J
  LAST_REPLY_TEXT:   10, // K
  LAST_REPLY_AT:     11, // L
  FOLLOWUP_COUNT:    12, // M
  LAST_FOLLOWUP_AT:  13, // N
  PHONES:            14  // O
};

// Column indices (0-based) for "client without email" sheet
export const COL_WITHOUT_EMAIL = {
  POST_URL:       0, // A
  AUTHOR_NAME:    1, // B
  AUTHOR_PROFILE: 2, // C
  POST_TEXT:      3, // D
  SCRAPED_AT:     4, // E
  PHONES:         5  // F
};

// Column indices (0-based) for "email_log" sheet
export const COL_EMAIL_LOG = {
  RECIPIENT_EMAIL: 0, // A
  AUTHOR_NAME:     1, // B
  SUBJECT:         2, // C
  TYPE:            3, // D
  SENT_AT:         4, // E
  STATUS:          5, // F
  MESSAGE_ID:      6  // G
};

export const SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
export const GMAIL_BASE_URL  = "https://gmail.googleapis.com/gmail/v1/users/me";

export const REPORT_RECIPIENT = "madhu@kushiconsultancy.com";
export const REPORT_CC        = "kushi_head@outlook.com";

export const FOLLOWUP_INTERVAL_DAYS = 7;
export const REPLY_POLL_INTERVAL_MINUTES = 60; // check every hour

export const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

export const MAX_POST_TEXT_LENGTH = 500;
export const MAX_RETRY_ATTEMPTS   = 3;
export const RETRY_DELAY_MS       = 2000;
