// background/scheduler.js
// Manages chrome.alarms for weekly follow-ups and monthly reports

import {
  minutesUntilNextWeekday,
  minutesUntilEndOfMonth,
  avgMonthInMinutes
} from "../utils/date_utils.js";
import { ALARM_NAMES, REPLY_POLL_INTERVAL_MINUTES } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

const MODULE = "scheduler";

/**
 * Initializes all scheduled alarms. Safe to call on extension install and startup.
 * Clears existing alarms first to avoid duplicates.
 */
export async function initializeAlarms() {
  // Clear existing alarms
  await chrome.alarms.clearAll();

  // Weekly follow-up: fires every Monday at 09:00 AM
  chrome.alarms.create(ALARM_NAMES.WEEKLY_FOLLOWUP, {
    delayInMinutes: minutesUntilNextWeekday(1, 9), // next Monday 09:00
    periodInMinutes: 7 * 24 * 60                   // every 7 days
  });

  // Monthly report: fires on last day of current month at 23:00
  chrome.alarms.create(ALARM_NAMES.MONTHLY_REPORT, {
    delayInMinutes: minutesUntilEndOfMonth(),
    periodInMinutes: avgMonthInMinutes()
  });

  // Reply poll: checks Gmail inbox every hour (delay=60 so first fire aligns with period)
  chrome.alarms.create(ALARM_NAMES.REPLY_POLL, {
    delayInMinutes: REPLY_POLL_INTERVAL_MINUTES,
    periodInMinutes: REPLY_POLL_INTERVAL_MINUTES
  });

  logger.info(MODULE, "All alarms initialized", {
    weeklyFollowup: `${minutesUntilNextWeekday(1, 9)} min until next`,
    monthlyReport:  `${minutesUntilEndOfMonth()} min until next`,
    replyPoll:      `every ${REPLY_POLL_INTERVAL_MINUTES} min`
  });
}

/**
 * Returns the status of all active alarms.
 * @returns {Promise<Array>}
 */
export async function getAlarmStatus() {
  return new Promise((resolve) => {
    chrome.alarms.getAll((alarms) => resolve(alarms));
  });
}
