# LinkedIn Data Feed Generator v2.0 — Working Manual

This manual explains how every feature works, the end-to-end workflow, and what happens behind the scenes.

---

## Table of Contents

1. [How the Extension Works](#how-the-extension-works)
2. [Popup — Main Interface](#popup--main-interface)
3. [Capturing LinkedIn Posts](#capturing-linkedin-posts)
4. [OCR Processing (Tesseract.js)](#ocr-processing-tesseractjs)
5. [Gallery — Viewing Captured Posts](#gallery--viewing-captured-posts)
6. [Google Sheets Integration](#google-sheets-integration)
7. [Email Outreach](#email-outreach)
8. [Follow-Up System](#follow-up-system)
9. [Reply Detection](#reply-detection)
10. [Monthly Reports](#monthly-reports)
11. [Automated Schedules](#automated-schedules)
12. [Options Page — All Settings](#options-page--all-settings)
13. [Technical Architecture](#technical-architecture)

---

## How the Extension Works

The extension uses a **screenshot + OCR** approach instead of directly scraping LinkedIn's DOM (which breaks frequently due to dynamic class names).

**High-level flow:**

```
LinkedIn Page → Screenshot Capture → Image Cropping → OCR (Tesseract.js) → Email/Phone Extraction → Google Sheets → Email Outreach
```

1. The content script scrolls through LinkedIn and locates post containers
2. Each post is screenshotted using Chrome's `captureVisibleTab` API
3. The screenshot is cropped to the exact post area in an offscreen document
4. Tesseract.js (bundled locally) runs OCR on the cropped image
5. Regex patterns extract email addresses and phone numbers from OCR text
6. Results are saved to the popup gallery AND written to Google Sheets
7. Posts with emails trigger automatic outreach emails via Gmail

---

## Popup — Main Interface

Click the extension icon in Chrome's toolbar to open the popup.

### Top Section

- **Search Keyword** — The keyword used to filter LinkedIn posts. Change it anytime; it auto-saves.
- **Capture LinkedIn Posts** button — Starts the capture process on the active LinkedIn tab.
- **Status bar** — Shows current state: Idle (green), Running (blue), Done (green), Error (red). Also shows last scrape timestamp.

### 📸 Gallery Tab

Displays a grid of captured post screenshots, each showing:
- Post screenshot thumbnail
- Author name
- Extracted emails (if any)
- Extracted phone numbers (if any)
- Capture timestamp

**Click any image** to open a full-size modal with:
- Large image preview
- Author name and profile link
- All extracted emails and phones
- Full OCR text output
- Capture timestamp

**Clear Gallery (🗑)** — Removes all stored images from local storage.

### 📊 Stats Tab

Four stat cards summarizing your data:
- **With Email** — Number of posts where emails were found (links to Google Sheet)
- **No Email** — Number of posts without emails (links to Google Sheet)
- **Emails Sent** — Total outreach + follow-up emails sent
- **Follow-ups** — Total follow-up emails sent

Three action buttons:
- **Send Follow-ups** — Manually trigger follow-up emails for contacts who haven't replied
- **Check Replies** — Manually poll Gmail for new replies from contacts
- **Generate Monthly Report** — Send the monthly summary report immediately

---

## Capturing LinkedIn Posts

### What You Need

- Be logged into LinkedIn in the active Chrome tab
- The tab URL must be `linkedin.com/feed/*` or `linkedin.com/search/*`

### Step-by-Step

1. Navigate to LinkedIn. You can use:
   - **Your feed:** `https://www.linkedin.com/feed/`
   - **A search:** Search for your keyword (e.g., "UAE Oil and Gas jobs") on LinkedIn
2. Open the extension popup
3. Adjust the **Search Keyword** if needed
4. Click **Capture LinkedIn Posts**
5. Watch the page — the extension will:
   - Scroll down 6 times to load more posts (takes ~12 seconds)
   - Scroll back to the top
   - Find all post containers matching the keyword
   - Screenshot each post one by one (up to **15 posts** per capture)
   - Each screenshot has an 800ms delay for rendering

### Post Detection Strategy

The content script uses a **3-stage strategy** to find posts:

| Stage | Method | What It Looks For |
|---|---|---|
| 1 | CSS selectors | `[data-urn*='activity']`, `.feed-shared-update-v2`, `article` elements |
| 2 | Semantic search | Large `<li>` elements inside `<main>` |
| 3 | Keyword scan | Large `<div>` blocks containing keyword text |

Posts are **filtered** by keyword relevance:
- Exact keyword match in text
- Strong domain words: "oil", "gas", "petroleum", "offshore", "onshore", "UAE", "dubai", "abu dhabi", "drilling", "pipeline"
- At least 2 keyword words matching

Posts are **deduplicated** — nested containers are removed to avoid capturing the same post twice.

### Auto-Capture on Search Pages

If you navigate to a LinkedIn search page containing "oil" or "uae" in the URL parameters, the scraper will **automatically trigger** without needing to click the popup button.

---

## OCR Processing (Tesseract.js)

The extension bundles **Tesseract.js v5.1.1** entirely offline — no internet connection needed for OCR.

### Bundled Files (in `lib/`)

| File | Size | Purpose |
|---|---|---|
| `tesseract.min.js` | 65 KB | Main Tesseract.js API |
| `worker.min.js` | 121 KB | Web Worker that runs OCR in a separate thread |
| `tesseract-core-simd-lstm.wasm.js` | 3.8 MB | WebAssembly OCR engine (SIMD + LSTM optimized) |
| `eng.traineddata.gz` | 2.9 MB | English language model (gzip compressed) |

### How OCR Works

1. The cropped post screenshot is sent to the **offscreen document** (`offscreen/offscreen.html`)
2. The image is **preprocessed** for better accuracy:
   - Converted to grayscale
   - Contrast increased by 1.5×
   - Binarized (each pixel becomes pure black or white)
3. Tesseract.js recognizes text from the processed image
4. Regex patterns extract:
   - **Email addresses** — standard email pattern matching
   - **Phone numbers** — various international formats, UAE numbers, etc.

### Performance Notes

- First OCR run takes longer (~3–5 seconds) as the WASM engine and language model are loaded
- Subsequent runs are faster (~1–2 seconds per image) as the worker stays warm
- OCR runs in a Web Worker thread, so the UI stays responsive
- SIMD+LSTM variant is optimized for modern Chrome (v91+)

---

## Gallery — Viewing Captured Posts

The Gallery is stored in `chrome.storage.local` and persists across browser sessions.

### Gallery Storage Format

Each gallery item contains:
- `imageDataUrl` — The cropped post screenshot (PNG base64)
- `authorName` — Post author's display name
- `authorProfile` — LinkedIn profile URL
- `postUrl` — Direct link to the post
- `emails` — Array of extracted email addresses
- `phones` — Array of extracted phone numbers
- `ocrText` — Full OCR output text
- `capturedAt` — ISO timestamp

### Storage Limits

`chrome.storage.local` has a 10 MB limit (or unlimited with `unlimitedStorage` permission). Each screenshot is typically 50–200 KB (PNG). With 15 captures per session, a single scrape uses ~1–3 MB.

**Clear the gallery** periodically if storage becomes a concern.

---

## Google Sheets Integration

### Sheet Structure

After initialization, your spreadsheet has 4 tabs:

#### `client with email`
Contacts where at least one email was detected.

| Column | Header | Description |
|---|---|---|
| A | postUrl | LinkedIn post URL |
| B | authorName | Post author's name |
| C | authorProfile | LinkedIn profile URL |
| D | emails | Comma-separated email addresses |
| E | postText | OCR-extracted text (first 500 chars) |
| F | scrapedAt | When the post was captured |
| G | emailStatus | `Pending` / `Sent` / `Failed` |
| H | emailSentAt | When outreach email was sent |
| I | failureReason | Error message if email failed |
| J | acknowledged | `Yes` / `No` / `Pending` |
| K | lastReplyText | Snippet of the client's reply |
| L | lastReplyAt | When the reply was received |
| M | followupCount | Number of follow-ups sent |
| N | lastFollowupSentAt | When the last follow-up was sent |
| O | phones | Comma-separated phone numbers |

#### `client without email`
Posts where no email was detected — logged for manual follow-up.

| Column | Header | Description |
|---|---|---|
| A | postUrl | LinkedIn post URL |
| B | authorName | Post author's name |
| C | authorProfile | LinkedIn profile URL |
| D | postText | OCR text (first 500 chars) |
| E | scrapedAt | When captured |
| F | phones | Comma-separated phone numbers |

#### `email_log`
Every email sent by the extension.

| Column | Header |
|---|---|
| A | recipient |
| B | subject |
| C | type (`initial` / `followup` / `report`) |
| D | sentAt |
| E | status (`Sent` / `Failed`) |
| F | messageId (Gmail message ID) |
| G | failureReason |

#### `monthly_report`
Auto-populated monthly summary rows.

---

## Email Outreach

When a captured post has email addresses:

1. The post is written to the `client with email` sheet with `emailStatus = Pending`
2. An outreach email is automatically composed using the **Initial Outreach template**
3. The email is sent via Gmail API from your authenticated account
4. On success: `emailStatus` → `Sent`, `emailSentAt` is recorded
5. On failure: `emailStatus` → `Failed`, `failureReason` is recorded
6. The send event is logged in the `email_log` tab

### Template Variables

| Variable | Replaced With |
|---|---|
| `{authorName}` | The post author's name |
| `{postUrl}` | The LinkedIn post URL |

You can customize the email template in **Options → Email Templates → Initial Outreach**.

---

## Follow-Up System

Follow-up emails are sent to contacts who:
- Have `emailStatus = Sent` (initial outreach was successful)
- Have `acknowledged ≠ Yes` (haven't replied yet)
- Last received an email more than **N days** ago (default: 7 days, configurable)

### Triggering Follow-Ups

- **Automatic:** The `weekly_followup` alarm fires every Monday at 9:00 AM
- **Manual:** Click **Send Follow-ups** in the popup's Stats tab

### Follow-Up Template Variables

| Variable | Replaced With |
|---|---|
| `{authorName}` | Contact's name |
| `{originalSentDate}` | When the first email was sent |
| `{followupCount}` | How many follow-ups have been sent |

Each follow-up increments the `followupCount` and updates `lastFollowupSentAt` in the sheet.

---

## Reply Detection

The extension polls Gmail to detect replies from contacts.

### How It Works

1. Searches Gmail for messages from known contact email addresses
2. If a reply is found:
   - `acknowledged` → `Yes`
   - `lastReplyText` → snippet of the reply
   - `lastReplyAt` → timestamp of the reply
3. Contacts marked as acknowledged will **not** receive further follow-ups

### Triggering Reply Detection

- **Automatic:** The `reply_poll` alarm fires every **60 minutes**
- **Manual:** Click **Check Replies** in the popup's Stats tab

---

## Monthly Reports

A summary report email is generated and sent monthly.

### What's in the Report

- Total posts captured
- Posts with emails vs. without
- Emails sent (initial + follow-ups)
- Reply rate
- Summary stats for the month

### Triggering Reports

- **Automatic:** The `monthly_report` alarm fires on the **last day of each month**
- **Manual:** Click **Generate Monthly Report** in the popup's Stats tab

### Recipients

- **To:** configurable (default: `madhu@kushiconsultancy.com`)
- **CC:** configurable (default: `kushi_head@outlook.com`)

Both can be changed in **Options → Email Settings**.

---

## Automated Schedules

The extension runs three background alarms:

| Alarm | Default Schedule | What It Does |
|---|---|---|
| `weekly_followup` | Every Monday, 9:00 AM | Sends follow-up emails to contacts without replies |
| `reply_poll` | Every 60 minutes | Checks Gmail for new replies from contacts |
| `monthly_report` | Last day of each month | Emails the monthly summary report |

Alarms are initialized when the extension is:
- First installed
- Chrome starts up
- Extension is reloaded

No manual setup is needed — alarms run automatically in the background.

---

## Options Page — All Settings

Access via: right-click extension icon → **Options**, or click ⚙ in the popup.

### Google Integration

| Field | Required | Description |
|---|---|---|
| Google OAuth Client ID | ✅ | From Google Cloud Console credentials |
| OAuth Redirect URI | Auto | Read-only, copy this to Cloud Console |
| Google Spreadsheet ID | ✅ | From your Google Sheet URL |
| Gmail Sender Address | Auto | Filled after authentication |

**Buttons:**
- **Authenticate with Google** — starts OAuth flow
- **Sign Out** — revokes access token and clears auth data

### Search Settings

| Field | Default | Description |
|---|---|---|
| LinkedIn Search Keyword | `UAE job positions Oil and gas onshore or offshore` | Used to filter captured posts |

### Email Settings

| Field | Default | Description |
|---|---|---|
| Follow-up Interval (days) | 7 | Wait period before sending a follow-up |
| Monthly Report Recipient | `madhu@kushiconsultancy.com` | Report email "To" address |
| Monthly Report CC | `kushi_head@outlook.com` | Report email "CC" address |

### Email Templates

Two sub-tabs with HTML editors:
- **Initial Outreach** — first contact email template
- **Follow-Up** — follow-up email template

Both support variable substitution (see [Email Outreach](#email-outreach) and [Follow-Up System](#follow-up-system) sections).

### Actions

| Button | What It Does |
|---|---|
| Initialize Sheets | Creates the 4 required tabs with proper headers in your spreadsheet |
| Send Test Email | Sends a test email to verify Gmail is working |
| Open Spreadsheet | Opens your Google Sheet in a new tab |

---

## Technical Architecture

### Component Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Extension                       │
│                                                          │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │  Popup   │◄──►│ Service Worker │◄──►│  Options     │  │
│  │ (popup/) │    │ (background/) │    │ (options/)   │  │
│  └──────────┘    └───────┬───────┘    └──────────────┘  │
│                          │                               │
│              ┌───────────┼───────────┐                   │
│              ▼           ▼           ▼                   │
│  ┌──────────────┐ ┌───────────┐ ┌────────────────────┐  │
│  │Content Script│ │ Offscreen │ │   Google APIs       │  │
│  │(linkedin_    │ │ Document  │ │ ┌──────┐ ┌──────┐  │  │
│  │ scraper.js)  │ │ (OCR via  │ │ │Sheets│ │Gmail │  │  │
│  │              │ │ Tesseract)│ │ └──────┘ └──────┘  │  │
│  └──────────────┘ └───────────┘ └────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              lib/ (Tesseract.js Bundle)            │   │
│  │  tesseract.min.js + worker.min.js + WASM + eng    │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Message Flow

All components communicate through `chrome.runtime.sendMessage`:

```
User clicks "Capture"
    → popup.js sends TRIGGER_SCRAPE
    → service_worker.js validates tab & injects trigger
    → linkedin_scraper.js scrolls, finds posts, captures screenshots
    → service_worker.js receives CAPTURE_POST_SCREENSHOT per post
    → service_worker.js sends image to offscreen doc for cropping
    → linkedin_scraper.js sends POSTS_CAPTURED with all screenshots
    → service_worker.js sends each image to offscreen doc for OCR
    → OCR text goes through email/phone regex extraction
    → Results saved to chrome.storage.local (gallery)
    → Results written to Google Sheets
    → Outreach emails sent for posts with emails
```

### Data Storage

| Storage | What's Stored |
|---|---|
| `chrome.storage.sync` | Settings (Client ID, Sheet ID, keyword, templates, email config) |
| `chrome.storage.local` | Gallery data (screenshots + OCR), auth tokens, stats, logs |

### Security

- OAuth tokens stored in `chrome.storage.local` (not `localStorage` or cookies)
- No credentials hardcoded in source code
- CSP: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`
- All Tesseract.js files bundled locally — no external CDN calls
- `web_accessible_resources` scoped to `lib/*` only
- Google API calls use HTTPS exclusively

---

## Quick Reference

### Keyboard Shortcut

None configured by default. You can add one at `chrome://extensions/shortcuts`.

### Supported LinkedIn Pages

- `https://www.linkedin.com/feed/*`
- `https://www.linkedin.com/search/*`

### Capture Limits

- **15 posts** per capture session
- **800ms** delay between captures
- **6 scroll cycles** to load posts
- **500 characters** max post text stored in sheets

### Supported Contact Formats

**Emails:** Standard email patterns (e.g., `name@domain.com`)

**Phones:** International formats including:
- `+971-XX-XXXXXXX` (UAE)
- `(XXX) XXX-XXXX` (US)
- `+XX XXXXXXXXXX` (international)
- Various dash/space/dot separated formats
