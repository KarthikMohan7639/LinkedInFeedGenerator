# Low-Level Design (LLD)
## LinkedIn Data Feed Generator – Chrome Extension

---

## 1. Project File Structure

```
LinkedInDataFeedGenerator/
├── manifest.json
├── background/
│   ├── service_worker.js          # Main orchestrator
│   ├── scheduler.js               # chrome.alarms management
│   ├── email_classifier.js        # Email regex extraction
│   └── report_generator.js        # Monthly report builder
├── content/
│   └── linkedin_scraper.js        # DOM scraper injected into LinkedIn
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
├── api/
│   ├── google_auth.js             # OAuth 2.0 token management
│   ├── sheets_api.js              # Google Sheets CRUD
│   └── gmail_api.js               # Gmail send/read
├── templates/
│   └── email_templates.js         # Outreach & follow-up templates
├── utils/
│   ├── constants.js               # App-wide constants
│   ├── date_utils.js              # Date/time helpers
│   └── logger.js                  # Structured logging
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 2. manifest.json

```json
{
  "manifest_version": 3,
  "name": "LinkedIn Data Feed Generator",
  "version": "1.0.0",
  "description": "Scrapes LinkedIn posts, manages client outreach via Gmail and Google Sheets",
  "permissions": [
    "identity",
    "storage",
    "alarms",
    "tabs",
    "scripting",
    "activeTab"
  ],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://sheets.googleapis.com/*",
    "https://gmail.googleapis.com/*",
    "https://www.googleapis.com/*"
  ],
  "background": {
    "service_worker": "background/service_worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": { "16": "assets/icon16.png", "48": "assets/icon48.png" }
  },
  "options_page": "options/options.html",
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/feed/*"],
      "js": ["content/linkedin_scraper.js"],
      "run_at": "document_idle"
    }
  ],
  "oauth2": {
    "client_id": "<YOUR_GOOGLE_CLIENT_ID>",
    "scopes": [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly"
    ]
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

---

## 3. Data Models

### 3.1 LinkedInPost
```js
/**
 * @typedef {Object} LinkedInPost
 * @property {string} postUrl        - Canonical URL of the LinkedIn post
 * @property {string} authorName     - Full name of the post author
 * @property {string} authorProfile  - LinkedIn profile URL of the author
 * @property {string} postText       - Full plain-text content of the post
 * @property {string[]} emails       - Array of email addresses found in post text
 * @property {string} scrapedAt      - ISO 8601 timestamp of scrape time
 * @property {boolean} hasEmail      - Derived: true if emails.length > 0
 */
```

### 3.2 ClientRecord (Google Sheet Row – "client with email")
```
Column A: postUrl
Column B: authorName
Column C: authorProfile
Column D: emails (comma-separated)
Column E: postText (truncated to 500 chars)
Column F: scrapedAt
Column G: emailStatus        ("Pending" | "Sent" | "Failed")
Column H: emailSentAt        (ISO timestamp or blank)
Column I: failureReason      (blank if successful)
Column J: acknowledged       ("Yes" | "No" | "Pending")
Column K: lastReplyText      (snippet of client reply)
Column L: lastReplyAt        (ISO timestamp)
Column M: followupCount      (integer, incremented per follow-up)
Column N: lastFollowupSentAt (ISO timestamp)
```

### 3.3 "client without email" Sheet Row
```
Column A: postUrl
Column B: authorName
Column C: authorProfile
Column D: postText (truncated to 500 chars)
Column E: scrapedAt
```

### 3.4 EmailLogRecord
```
Column A: recipientEmail
Column B: authorName
Column C: subject
Column D: type            ("initial" | "followup" | "report")
Column E: sentAt
Column F: status          ("Success" | "Failed")
Column G: gmailMessageId
```

---

## 4. Module Specifications

---

### 4.1 `content/linkedin_scraper.js`

**Purpose:** Injected into `linkedin.com/feed` to scrape post data.

```
SEARCH_KEYWORD = "UAE job positions Oil and gas onshore or offshore"
```

**Algorithm:**
```
function scrapeLinkedInPosts():
  posts = []
  postElements = querySelectorAll('.feed-shared-update-v2')

  for each postElement in postElements:
    postText = postElement.querySelector('.feed-shared-text')?.innerText ?? ""
    
    if SEARCH_KEYWORD.toLowerCase() not in postText.toLowerCase():
      continue  // skip irrelevant posts
    
    postUrl    = extractPostUrl(postElement)
    authorName = postElement.querySelector('.feed-shared-actor__name')?.innerText ?? "Unknown"
    authorProfile = postElement.querySelector('.feed-shared-actor__container-link')?.href ?? ""
    emails     = extractEmails(postText)
    
    posts.push({
      postUrl, authorName, authorProfile,
      postText, emails,
      hasEmail: emails.length > 0,
      scrapedAt: new Date().toISOString()
    })

  chrome.runtime.sendMessage({ type: "POSTS_SCRAPED", payload: posts })
```

**`extractEmails(text)` function:**
```
EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
return [...text.matchAll(EMAIL_REGEX)].map(m => m[0])
```

**`extractPostUrl(element)` function:**
```
anchor = element.querySelector('a[href*="/posts/"]') 
       || element.querySelector('a[href*="/feed/update/"]')
return anchor ? new URL(anchor.href).pathname resolved to full URL : ""
```

---

### 4.2 `background/service_worker.js`

**Responsibilities:** Central message bus and orchestrator.

```
// On installation
chrome.runtime.onInstalled → initializeAlarms()

// Message listener
chrome.runtime.onMessage:

  case "POSTS_SCRAPED":
    → classifyAndSavePosts(payload)

  case "TRIGGER_SCRAPE":
    → injectContentScript()

  case "SEND_EMAILS":
    → processEmailQueue()

  case "CHECK_REPLIES":
    → pollGmailForReplies()

// Alarm listener
chrome.alarms.onAlarm:

  case "weekly_followup":
    → sendFollowUpEmails()

  case "monthly_report":
    → generateAndSendMonthlyReport()
```

**`classifyAndSavePosts(posts)` flow:**
```
for each post in posts:
  if post.hasEmail:
    existing = sheetsAPI.findRowByPostUrl("client with email", post.postUrl)
    if not existing:
      sheetsAPI.appendRow("client with email", mapToSheetRow(post))
      emailQueue.push(post)
  else:
    existing = sheetsAPI.findRowByPostUrl("client without email", post.postUrl)
    if not existing:
      sheetsAPI.appendRow("client without email", mapToSheetRowNoEmail(post))

processEmailQueue(emailQueue)
```

---

### 4.3 `api/google_auth.js`

```
async function getAuthToken():
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError):
        reject(chrome.runtime.lastError)
      else:
        resolve(token)
    })
  })

async function revokeToken():
  token = await getAuthToken()
  fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
  chrome.identity.removeCachedAuthToken({ token })
```

---

### 4.4 `api/sheets_api.js`

**Constants:**
```
SPREADSHEET_ID   = <from chrome.storage.sync>
SHEET_WITH_EMAIL    = "client with email"
SHEET_WITHOUT_EMAIL = "client without email"
SHEET_EMAIL_LOG     = "email_log"
SHEETS_BASE_URL  = "https://sheets.googleapis.com/v4/spreadsheets"
```

**Functions:**

```
async function appendRow(sheetName, rowValues[]):
  token = await getAuthToken()
  POST {SHEETS_BASE_URL}/{SPREADSHEET_ID}/values/{sheetName}!A1:append
    ?valueInputOption=USER_ENTERED
    body: { values: [rowValues] }

async function updateRow(sheetName, rowIndex, columnMap):
  // columnMap = { G: "Sent", H: "2026-03-04T10:00:00Z" }
  token = await getAuthToken()
  for each [col, value] in columnMap:
    PUT {SHEETS_BASE_URL}/{SPREADSHEET_ID}/values/{sheetName}!{col}{rowIndex}
      body: { values: [[value]] }

async function getAllRows(sheetName):
  token = await getAuthToken()
  GET {SHEETS_BASE_URL}/{SPREADSHEET_ID}/values/{sheetName}
  return response.values  // 2D array

async function findRowByPostUrl(sheetName, postUrl):
  rows = await getAllRows(sheetName)
  return rows.findIndex(row => row[0] === postUrl)  // Column A = postUrl
  // returns -1 if not found, else 1-based row index
```

---

### 4.5 `api/gmail_api.js`

**Functions:**

```
async function sendEmail(to, subject, htmlBody):
  token = await getAuthToken()
  
  rawMessage = buildMimeMessage({
    to, subject, htmlBody,
    from: <authenticated user email>
  })
  
  POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
    Authorization: Bearer {token}
    body: { raw: base64url(rawMessage) }
  
  return { messageId, success: true }

async function buildMimeMessage({ to, subject, htmlBody, from }):
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    htmlBody
  ].join('\r\n')

async function listReplies(sinceTimestamp):
  // Search inbox for replies after the given timestamp
  token = await getAuthToken()
  query = `in:inbox after:${unixTimestamp(sinceTimestamp)} is:reply`
  GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}
  return message list

async function getMessageSnippet(messageId):
  token = await getAuthToken()
  GET https://gmail.googleapis.com/gmail/v1/users/me/messages/{messageId}
  return { from, snippet, receivedAt }
```

---

### 4.6 `templates/email_templates.js`

```
function getOutreachTemplate(authorName, postUrl):
  return `
  <html><body>
  <p>Dear ${authorName},</p>
  <p>I came across your recent LinkedIn post regarding 
     <strong>UAE job positions in Oil & Gas (Onshore/Offshore)</strong>.</p>
  <p>We at <strong>Kushi Consultancy</strong> specialize in connecting 
     qualified professionals with leading employers in the energy sector.</p>
  <p>I would love to connect and explore how we can assist you further.</p>
  <p>Reference Post: <a href="${postUrl}">${postUrl}</a></p>
  <br/>
  <p>Best Regards,<br/>Kushi Consultancy Team</p>
  </body></html>
  `

function getFollowUpTemplate(authorName, originalSentDate):
  return `
  <html><body>
  <p>Dear ${authorName},</p>
  <p>This is a gentle follow-up to our email sent on 
     <strong>${originalSentDate}</strong> regarding UAE Oil & Gas opportunities.</p>
  <p>We hope to hear from you soon.</p>
  <br/>
  <p>Best Regards,<br/>Kushi Consultancy Team</p>
  </body></html>
  `

function getMonthlyReportTemplate(reportData):
  return `
  <html><body>
  <h2>Monthly Report – ${reportData.month} ${reportData.year}</h2>
  <table border="1" cellpadding="6">
    <tr><th>Metric</th><th>Count</th></tr>
    <tr><td>Total Posts Scraped</td><td>${reportData.totalPosts}</td></tr>
    <tr><td>Posts with Email</td><td>${reportData.postsWithEmail}</td></tr>
    <tr><td>Posts without Email</td><td>${reportData.postsWithoutEmail}</td></tr>
    <tr><td>Emails Sent</td><td>${reportData.emailsSent}</td></tr>
    <tr><td>Emails Failed</td><td>${reportData.emailsFailed}</td></tr>
    <tr><td>Replies Received</td><td>${reportData.repliesReceived}</td></tr>
    <tr><td>Follow-ups Sent</td><td>${reportData.followupsSent}</td></tr>
  </table>
  </body></html>
  `
```

---

### 4.7 `background/scheduler.js`

```
function initializeAlarms():
  chrome.alarms.create("weekly_followup", {
    delayInMinutes: minutesUntilNextMonday(),
    periodInMinutes: 7 * 24 * 60    // 10080 minutes = 1 week
  })

  chrome.alarms.create("monthly_report", {
    delayInMinutes: minutesUntilEndOfMonth(),
    periodInMinutes: avgMonthInMinutes()  // ~43200 minutes
  })

function minutesUntilNextMonday():
  now = new Date()
  nextMonday = next Monday 09:00 AM local time
  return (nextMonday - now) / 60000

function minutesUntilEndOfMonth():
  now = new Date()
  lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 0, 0)
  return (lastDay - now) / 60000
```

---

### 4.8 `background/report_generator.js`

```
async function generateAndSendMonthlyReport():
  now = new Date()
  month = now.toLocaleString('default', { month: 'long' })
  year  = now.getFullYear()

  withEmailRows    = await sheetsAPI.getAllRows("client with email")
  withoutEmailRows = await sheetsAPI.getAllRows("client without email")
  emailLogRows     = await sheetsAPI.getAllRows("email_log")

  // Filter rows for current month
  currentMonthRows = withEmailRows.filter(r => isSameMonth(r[5], now))  // col F = scrapedAt

  reportData = {
    month, year,
    totalPosts:          currentMonthRows.length + withoutEmailRows.filter(...).length,
    postsWithEmail:      currentMonthRows.length,
    postsWithoutEmail:   withoutEmailRows.filter(r => isSameMonth(r[4], now)).length,
    emailsSent:          currentMonthRows.filter(r => r[6] === "Sent").length,     // col G
    emailsFailed:        currentMonthRows.filter(r => r[6] === "Failed").length,
    repliesReceived:     currentMonthRows.filter(r => r[9] === "Yes").length,      // col J
    followupsSent:       currentMonthRows.reduce((s, r) => s + (parseInt(r[12]) || 0), 0) // col M
  }

  html = getMonthlyReportTemplate(reportData)

  await gmailAPI.sendEmail(
    "madhu@kushiconsultancy.com",
    `Monthly LinkedIn Outreach Report – ${month} ${year}`,
    html,
    cc: ["kushi_head@outlook.com"]
  )
```

---

### 4.9 `background/email_classifier.js`

```
async function processEmailQueue(posts):
  for each post in posts:
    row = await sheetsAPI.findRowByPostUrl("client with email", post.postUrl)
    if row[6] !== "Pending": continue  // already processed

    for each email in post.emails:
      try:
        result = await gmailAPI.sendEmail(
          email,
          "Exciting Oil & Gas Opportunities in UAE – Kushi Consultancy",
          getOutreachTemplate(post.authorName, post.postUrl)
        )
        await sheetsAPI.updateRow("client with email", row.index, {
          G: "Sent",
          H: new Date().toISOString(),
          J: "Pending"
        })
        await sheetsAPI.appendRow("email_log", [
          email, post.authorName,
          "Exciting Oil & Gas Opportunities in UAE",
          "initial", new Date().toISOString(),
          "Success", result.messageId
        ])
      catch error:
        await sheetsAPI.updateRow("client with email", row.index, {
          G: "Failed",
          I: error.message
        })
        await sheetsAPI.appendRow("email_log", [
          email, post.authorName, ..., "Failed", ""
        ])

async function sendFollowUpEmails():
  rows = await sheetsAPI.getAllRows("client with email")
  now  = new Date()

  for each row in rows:
    emailStatus  = row[6]   // col G
    acknowledged = row[9]   // col J
    lastFollowup = row[13]  // col N
    followupCount = parseInt(row[12]) || 0  // col M

    if emailStatus !== "Sent": continue
    if acknowledged === "Yes": continue

    // Only send follow-up if 7+ days since last email/follow-up
    lastActionDate = new Date(lastFollowup || row[7])  // col H = emailSentAt
    daysSince = (now - lastActionDate) / (1000 * 60 * 60 * 24)
    
    if daysSince < 7: continue

    email = row[3].split(",")[0].trim()  // col D – first email
    await gmailAPI.sendEmail(
      email,
      "Follow-Up: Oil & Gas Opportunities in UAE – Kushi Consultancy",
      getFollowUpTemplate(row[1], row[7])  // authorName, emailSentAt
    )
    await sheetsAPI.updateRow("client with email", row.rowIndex, {
      M: followupCount + 1,
      N: now.toISOString()
    })
```

---

### 4.10 Gmail Reply Detection

```
async function pollGmailForReplies():
  lastChecked = await chrome.storage.local.get("lastReplyCheck") ?? 24h ago
  replies = await gmailAPI.listReplies(lastChecked)

  rows = await sheetsAPI.getAllRows("client with email")

  for each reply in replies:
    msgDetail = await gmailAPI.getMessageSnippet(reply.id)
    senderEmail = parseSenderEmail(msgDetail.from)

    matchingRow = rows.find(r => r[3].includes(senderEmail))  // col D = emails
    
    if matchingRow:
      await sheetsAPI.updateRow("client with email", matchingRow.rowIndex, {
        J: "Yes",                       // acknowledged
        K: msgDetail.snippet,           // lastReplyText
        L: msgDetail.receivedAt         // lastReplyAt
      })

  await chrome.storage.local.set({ lastReplyCheck: new Date().toISOString() })
```

---

## 5. Popup UI Design

```
┌─────────────────────────────────────────────┐
│  🔗 LinkedIn Data Feed Generator          ⚙ │
├─────────────────────────────────────────────┤
│  Keyword:                                   │
│  ┌─────────────────────────────────────┐    │
│  │ UAE job positions Oil and gas...    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [  Scrape LinkedIn Now  ]                  │
│                                             │
│  Status: ● Idle                             │
│  Last Scrape: 2026-03-04 09:00:00          │
│                                             │
├─────────────────────────────────────────────┤
│  Posts with Email:    12    [View Sheet]    │
│  Posts without Email:  7    [View Sheet]    │
│  Emails Sent:         10                    │
│  Pending Follow-ups:   3                    │
├─────────────────────────────────────────────┤
│  [ Authenticate Google ]  [ Send Follow-ups]│
└─────────────────────────────────────────────┘
```

---

## 6. Options Page Fields

| Field | Type | Description |
|---|---|---|
| Google Spreadsheet ID | Text Input | Target Google Sheet ID |
| Sender Gmail Address | Text Input | Authenticated Gmail address |
| LinkedIn Search Keyword | Text Input | Default: "UAE job positions Oil and gas onshore or offshore" |
| Outreach Email Template | Rich Text | HTML template for initial outreach |
| Follow-up Email Template | Rich Text | HTML template for follow-up |
| Follow-up Interval (days) | Number | Default: 7 |
| Monthly Report Recipient | Text | Default: madhu@kushiconsultancy.com |
| Monthly Report CC | Text | Default: kushi_head@outlook.com |

---

## 7. Error Handling Matrix

| Scenario | Handling |
|---|---|
| OAuth token expired | Re-invoke `chrome.identity.getAuthToken({ interactive: true })` |
| LinkedIn DOM structure changed | Log warning; send alert to report email; skip gracefully |
| Google Sheets API quota exceeded | Exponential backoff with max 3 retries |
| Gmail send failure | Mark row as "Failed" with reason; retry on next weekly run |
| No posts matching keyword | Log to console; show "0 new posts" in popup |
| Duplicate post (already scraped) | Skip gracefully via `findRowByPostUrl` de-duplication check |

---

## 8. Storage Schema (`chrome.storage.sync`)

```json
{
  "spreadsheetId": "1BxiMVs...",
  "senderEmail": "user@gmail.com",
  "searchKeyword": "UAE job positions Oil and gas onshore or offshore",
  "followupIntervalDays": 7,
  "reportRecipient": "madhu@kushiconsultancy.com",
  "reportCC": "kushi_head@outlook.com",
  "googleClientId": "<OAuth Client ID>"
}
```

```json
// chrome.storage.local
{
  "lastReplyCheck": "2026-03-04T08:00:00Z",
  "lastScrapeTime": "2026-03-04T09:00:00Z",
  "emailQueueCount": 3
}
```

---

## 9. Sequence Diagram – Initial Email Outreach

```
User          Popup       ServiceWorker   ContentScript   SheetsAPI    GmailAPI
 │             │                │               │              │            │
 │──Scrape Now►│                │               │              │            │
 │             │──TRIGGER_SCRAPE►               │              │            │
 │             │                │──injectScript►│              │            │
 │             │                │               │──Scrape DOM  │            │
 │             │                │               │─POSTS_SCRAPED►            │
 │             │                │◄──────────────│              │            │
 │             │                │─findRow───────────────────►  │            │
 │             │                │◄─rowIndex─────────────────── │            │
 │             │                │─appendRow─────────────────►  │            │
 │             │                │─sendEmail──────────────────────────────►  │
 │             │                │◄─{messageId}─────────────────────────────│
 │             │                │─updateRow─────────────────►  │            │
 │◄──Status────│◄───────────────│              │              │            │
```

---

## 10. Testing Strategy

| Test Type | Scope |
|---|---|
| Unit Tests | `email_classifier.js` regex, `date_utils.js`, `report_generator.js` aggregations |
| Integration Tests | Sheets API CRUD with a test spreadsheet, Gmail API with a test account |
| Manual/E2E | End-to-end flow: scrape → classify → email → sheet update |
| LinkedIn DOM Change Detection | Periodic CSS selector validation against live feed |

---
