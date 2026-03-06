// utils/logger.js
// Structured logging utility

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LEVEL = LOG_LEVELS.DEBUG;

function formatMessage(level, module, message, data) {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] [${module}] ${message}${data ? " | " + JSON.stringify(data) : ""}`;
}

async function persist(level, module, message, data) {
  try {
    const entry = { ts: new Date().toISOString(), level, module, message, data: data || null };
    const { logs = [] } = await chrome.storage.local.get("logs");
    logs.push(entry);
    // Keep last 500 log entries
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    await chrome.storage.local.set({ logs });
  } catch {
    // Silently fail log persistence
  }
}

export const logger = {
  debug(module, message, data) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.debug(formatMessage("DEBUG", module, message, data));
    }
  },
  info(module, message, data) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      console.info(formatMessage("INFO", module, message, data));
      persist("INFO", module, message, data);
    }
  },
  warn(module, message, data) {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(formatMessage("WARN", module, message, data));
      persist("WARN", module, message, data);
    }
  },
  error(module, message, data) {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      console.error(formatMessage("ERROR", module, message, data));
      persist("ERROR", module, message, data);
    }
  },
  async getLogs() {
    const { logs = [] } = await chrome.storage.local.get("logs");
    return logs;
  },
  async clearLogs() {
    await chrome.storage.local.set({ logs: [] });
  }
};
