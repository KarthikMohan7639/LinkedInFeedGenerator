# LinkedIn Data Feed Generator – Chrome Extension

A Chrome Extension that scrapes LinkedIn posts for UAE Oil & Gas job opportunities, classifies them by email presence, manages outreach via Gmail, tracks replies, and sends monthly reports — all backed by Google Sheets.

---

## Quick Setup Guide

### Step 1 – Load the Extension into Chrome

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder inside `LinkedInDataFeedGenerator`
5. Note the **Extension ID** shown under the extension name — you will need it in Step 2

### Step 2 – Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g., `LinkedIn Feed Generator`)
3. Enable these APIs:
   - **Google Sheets API**
   - **Gmail API**
4. In the left sidebar go to **APIs & Services** → **Google Auth Platform**
   - If you see _"Google Auth Platform not configured yet"_, click **Get started**
   - **App name**: `LinkedIn Data Feed Generator`
   - **User support email**: your Gmail address
   - Click **Next**
   - **Audience**: select **External** *(this option appears on the second screen of the wizard)*
   - Click **Next**
   - **Contact information**: enter your email
   - Click **Next** then **Continue** → **Create**
   - Back on the Google Auth Platform page, click **Publish app** if prompted (moves it from Testing to Production, or keep it in Testing and add yourself as a test user under **Audience** → **Add users**)
5. Go to **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: `LinkedIn Feed Generator`
   - Under **Authorised redirect URIs** click **Add URI** and paste the **OAuth Redirect URI** shown in the extension's Options page (it looks like `https://<extension-id>.chromiumapp.org/`)
     > To find it: reload the extension in `chrome://extensions`, open the Options page — the Redirect URI is displayed with a **Copy** button
   - Click **Create** and copy the generated **Client ID** (ends in `.apps.googleusercontent.com`)

### Step 3 – Create a Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← THIS PART →  /edit
   ```

### Step 4 – Configure via Options Page

1. Right-click the extension icon → **Options** (or click the ⚙ icon in the popup)
2. Under **Google Integration**, fill in:
   - **Google OAuth Client ID** – paste the Client ID from Step 2
   - **Google Spreadsheet ID** – paste the ID from Step 3
3. Click **Save Settings**
4. Click **Authenticate with Google** → sign in with your Gmail account
   - Your Gmail address will be auto-filled in the **Gmail Sender Address** field
5. Click **Initialize Sheets** to create all tabs with headers

---

## How to Use

### Scraping LinkedIn Posts

1. Navigate to `linkedin.com/feed` or search for:
   ```
   UAE job positions Oil and gas onshore or offshore
   ```
2. Click the extension icon
3. Click **Scrape LinkedIn Now**
4. The extension will:
   - Scroll through posts to load more
   - Filter posts matching the keyword
   - Classify by email presence
   - Save to Google Sheets
   - Automatically send outreach emails

### Automated Actions (Background)

| Action | Schedule | Trigger |
|---|---|---|
| Follow-up emails | Every Monday 09:00 | Clients with no reply after 7 days |
| Reply detection | Every hour | Polls Gmail inbox |
| Monthly report | Last day of month | Emails report to madhu@kushiconsultancy.com |

### Manual Actions (Popup)

| Button | Action |
|---|---|
| Scrape LinkedIn Now | Inject scraper into active LinkedIn tab |
| Send Follow-ups | Manually trigger weekly follow-up job |
| Check Replies | Manually poll Gmail for client replies |
| Generate Monthly Report | Send report immediately |

---

## Google Sheet Structure

After initialization, your spreadsheet will have 4 tabs:

### `client with email`
| Column | Name | Description |
|---|---|---|
| A | postUrl | LinkedIn post URL |
| B | authorName | Post author's name |
| C | authorProfile | LinkedIn profile URL |
| D | emails | Email addresses found |
| E | postText | Post content (first 500 chars) |
| F | scrapedAt | When scraped |
| G | emailStatus | Pending / Sent / Failed |
| H | emailSentAt | When outreach email was sent |
| I | failureReason | Failure message if failed |
| J | acknowledged | Yes / No / Pending |
| K | lastReplyText | Snippet of client reply |
| L | lastReplyAt | When reply was received |
| M | followupCount | Number of follow-ups sent |
| N | lastFollowupSentAt | When last follow-up was sent |

### `client without email`
Posts without detectable email addresses for reference.

### `email_log`
Full log of every email sent with status and Gmail message ID.

### `monthly_report`
Auto-populated monthly summary rows.

---

## Project Structure

```
LinkedInDataFeedGenerator/
├── manifest.json               ← Extension config
├── generate_icons.html         ← Utility to regenerate icons if needed
├── README.md
│
├── assets/                     ← Icon files (already generated)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
├── background/                 ← Service Worker (runs in background)
│   ├── service_worker.js       ← Main orchestrator & message router
│   ├── scheduler.js            ← chrome.alarms management
│   ├── email_classifier.js     ← Email sending, follow-ups, reply detection
│   └── report_generator.js     ← Monthly report builder
│
├── content/
│   └── linkedin_scraper.js     ← Injected into LinkedIn, scrapes post DOM
│
├── popup/                      ← Extension popup (click toolbar icon)
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
│
├── options/                    ← Settings page
│   ├── options.html
│   ├── options.js
│   └── options.css
│
├── api/                        ← Google API wrappers
│   ├── google_auth.js          ← OAuth 2.0 (launchWebAuthFlow; client ID stored in Options)
│   ├── sheets_api.js           ← Google Sheets v4 CRUD
│   └── gmail_api.js            ← Gmail send/read
│
├── templates/
│   └── email_templates.js      ← HTML email templates
│
└── utils/
    ├── constants.js            ← App-wide constants
    ├── date_utils.js           ← Date/time helpers
    └── logger.js               ← Structured logging to chrome.storage
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Google Client ID not configured" | Go to Options → enter your OAuth Client ID → Save Settings |
| "Spreadsheet ID not configured" | Go to Options → enter your Sheet ID → Save Settings |
| "bad client id" | Make sure the Client ID in Options matches the one in **Google Cloud Console → Credentials** |
| "Please navigate to LinkedIn" | Open linkedin.com before clicking Scrape |
| "OAuth token error" | Go to Options → click Authenticate with Google |
| Auth popup does not open | Verify the extension ID in **Google Cloud Console → Credentials** matches `chrome://extensions`; also confirm **External** audience was selected in **Google Auth Platform** |
| `redirect_uri_mismatch` | The OAuth client must be type **Web application** — delete the old Chrome Extension client, create a new Web application client, and add the **OAuth Redirect URI** shown in the Options page as an Authorised redirect URI |
| No posts found | Make sure you are on `linkedin.com/feed` and LinkedIn has loaded |
| Emails not sending | Check Gmail API is enabled and OAuth scopes include `gmail.send` |
| LinkedIn DOM change warning | LinkedIn may have updated their page structure; check console logs |

---

## Security Notes

- OAuth access tokens are cached in `chrome.storage.local` — never in `localStorage`
- The Google Client ID is stored in `chrome.storage.sync` (entered by the user in Options; nothing is hardcoded in the extension)
- No passwords or credentials are hardcoded
- Gmail scope is limited to `send`, `readonly`, and `modify` only
- Email templates are HTML-escaped to prevent injection

---

## Requirements Mapping

| # | Requirement | Implementation |
|---|---|---|
| 1 | Read LinkedIn posts for UAE Oil & Gas | `content/linkedin_scraper.js` – keyword-filtered DOM scraping |
| 2 | Save posts with email to "client with email" | `background/email_classifier.js` → `api/sheets_api.js` |
| 3 | Save posts without email to "client without email" | `background/email_classifier.js` → `api/sheets_api.js` |
| 4 | Send outreach email from template | `api/gmail_api.js` + `templates/email_templates.js` |
| 5 | Update sheet after send (success/fail) | `background/email_classifier.js` → `updateRow()` |
| 6 | Log client replies in sheet | `pollGmailForReplies()` in `email_classifier.js` |
| 7 | Weekly follow-up for unacknowledged clients | `chrome.alarms` → `sendFollowUpEmails()` |
| 8 | Monthly report to madhu@kushiconsultancy.com (CC kushi_head@outlook.com) | `background/report_generator.js` |
