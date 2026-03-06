// utils/date_utils.js
// Date/time helper functions

/**
 * Returns minutes until the next occurrence of a specific weekday and hour.
 * @param {number} targetDay - 0=Sun, 1=Mon, ..., 6=Sat
 * @param {number} targetHour - 0-23
 */
export function minutesUntilNextWeekday(targetDay = 1, targetHour = 9) {
  const now = new Date();
  const result = new Date(now);
  result.setHours(targetHour, 0, 0, 0);

  const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
  result.setDate(result.getDate() + daysUntil);

  return Math.max(1, Math.floor((result - now) / 60000));
}

/**
 * Returns minutes until end of current month (last day, 23:00).
 */
export function minutesUntilEndOfMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 0, 0, 0);
  return Math.max(1, Math.floor((lastDay - now) / 60000));
}

/**
 * Returns the average minute count in a month (~30.44 days).
 */
export function avgMonthInMinutes() {
  return Math.floor(30.44 * 24 * 60);
}

/**
 * Returns true if two date strings (ISO 8601) fall in the same calendar month/year.
 * @param {string} dateStr
 * @param {Date} referenceDate
 */
export function isSameMonth(dateStr, referenceDate = new Date()) {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    return d.getFullYear() === referenceDate.getFullYear() &&
           d.getMonth()    === referenceDate.getMonth();
  } catch {
    return false;
  }
}

/**
 * Returns Unix timestamp (seconds) from an ISO date string.
 * @param {string} isoString
 */
export function toUnixTimestamp(isoString) {
  return Math.floor(new Date(isoString).getTime() / 1000);
}

/**
 * Formats an ISO string to a human-readable date string.
 * @param {string} isoString
 */
export function formatDate(isoString) {
  if (!isoString) return "N/A";
  try {
    return new Date(isoString).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return isoString;
  }
}

/**
 * Returns ISO string for N days ago.
 * @param {number} days
 */
export function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Returns the number of days between two ISO strings.
 * @param {string} fromIso
 * @param {string} toIso
 */
export function daysBetween(fromIso, toIso = new Date().toISOString()) {
  const from = new Date(fromIso);
  const to   = new Date(toIso);
  return (to - from) / (1000 * 60 * 60 * 24);
}

/**
 * Returns the current month name and year as { month, year }.
 */
export function getCurrentMonthYear() {
  const now = new Date();
  return {
    month: now.toLocaleString("default", { month: "long" }),
    year:  now.getFullYear()
  };
}
