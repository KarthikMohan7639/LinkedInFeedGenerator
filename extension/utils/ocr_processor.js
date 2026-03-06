// utils/ocr_processor.js
// OCR processing using OffscreenCanvas and basic image-to-text extraction.
// Since Tesseract.js cannot run in a service worker (no DOM), we use a
// lightweight approach: the OCR is performed in an offscreen document.
// This module provides helpers to extract emails and phones from OCR text.

import { logger } from "./logger.js";

const MODULE = "ocr_processor";

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Extract email addresses from text.
 */
export function extractEmails(text) {
  const matches = text.match(EMAIL_REGEX);
  return matches ? [...new Set(matches.map(e => e.toLowerCase()))] : [];
}

/**
 * Extract phone numbers from text.
 * Matches labeled numbers (Contact:, Mobile:, Tel:, etc.) and standalone 10-15 digit numbers.
 */
export function extractPhones(text) {
  const phones = new Set();

  // Labeled: Contact/Mobile/Tel/Phone/Call/WhatsApp followed by number
  const labeledRe = /(?:contact|mobile|tel|ph(?:one)?|call|whatsapp)[:\s#.+]*(\+?[\d][\d\s\-]{6,15}\d)/gi;
  let m;
  while ((m = labeledRe.exec(text)) !== null) {
    const digits = m[1].replace(/[\s\-]/g, "");
    if (digits.length >= 8 && digits.length <= 15) phones.add(digits);
  }

  // Standalone 10-13 digit sequences
  const standaloneRe = /(\+?\d{10,13})(?!\d)/g;
  while ((m = standaloneRe.exec(text)) !== null) {
    const digits = m[1].replace(/[\s\-]/g, "");
    if (digits.length >= 10 && digits.length <= 13) phones.add(digits);
  }

  return [...phones];
}

/**
 * Process OCR text to extract contacts.
 * @param {string} ocrText - Raw text from OCR
 * @returns {{ emails: string[], phones: string[], rawText: string }}
 */
export function extractContactsFromText(ocrText) {
  const emails = extractEmails(ocrText);
  const phones = extractPhones(ocrText);
  logger.debug(MODULE, `Extracted: ${emails.length} emails, ${phones.length} phones`);
  return { emails, phones, rawText: ocrText };
}

/**
 * Process a captured post: run OCR via the offscreen document, then extract contacts.
 * @param {string} imageDataUrl - base64 data URL of the screenshot
 * @returns {Promise<{ emails: string[], phones: string[], rawText: string }>}
 */
export async function processImageOCR(imageDataUrl) {
  try {
    // Request OCR from the offscreen document
    const ocrText = await chrome.runtime.sendMessage({
      type: "RUN_OCR",
      imageDataUrl
    });

    if (!ocrText || typeof ocrText !== "string") {
      logger.warn(MODULE, "OCR returned no text");
      return { emails: [], phones: [], rawText: "" };
    }

    return extractContactsFromText(ocrText);
  } catch (err) {
    logger.error(MODULE, "OCR processing failed", err.message);
    return { emails: [], phones: [], rawText: "" };
  }
}
