# LinkedIn Data Feed Generator v2.0 — Setup Guide

Complete step-by-step instructions to install and configure the extension.

---

## Prerequisites

- **Google Chrome** (v116 or later — required for Manifest V3 + Offscreen API)
- A **Google account** with access to Gmail and Google Sheets
- A **LinkedIn account** (logged in)

---

## Step 1 — Load the Extension into Chrome

1. Download / clone this repository to your computer
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Browse to and select the `extension/` folder inside `LinkedInDataFeedGenerator`
6. The extension icon will appear in the Chrome toolbar
7. **Copy the Extension ID** shown below the extension name (e.g., `abcdefghijklmnop...`) — you'll need it in Step 2

> **Tip:** Pin the extension icon by clicking the puzzle-piece icon in Chrome's toolbar and toggling the pin next to "LinkedIn Data Feed Generator".

---

## Step 2 — Set Up Google Cloud Project

### 2.1 Create a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top bar) → **New Project**
3. Name it something like `LinkedIn Feed Generator` → **Create**
4. Make sure the new project is selected in the dropdown

### 2.2 Enable APIs

1. In the left sidebar: **APIs & Services** → **Library**
2. Search for and enable **each** of these:
   - **Google Sheets API**
   - **Gmail API**

### 2.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen** (or **Google Auth Platform**)
2. If prompted with "Get started", click it
3. Fill in:
   - **App name:** `LinkedIn Data Feed Generator`
   - **User support email:** your Gmail address
4. Click **Next**
5. Select **External** as the audience type → **Next**
6. Enter your email as developer contact → **Next** → **Create**
7. Under **Audience**, click **Add users** and add your own Gmail address as a test user
   > Alternatively, click **Publish app** to skip the test-user requirement — but published apps may require Google verification later

### 2.4 Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth 2.0 Client ID**
3. Select **Web application** as the application type
4. Name: `LinkedIn Feed Generator`
5. Under **Authorised redirect URIs**, click **Add URI** and paste:
   ```
   https://<YOUR-EXTENSION-ID>.chromiumapp.org/
   ```
   > **How to find your redirect URI:**
   > Open the extension's Options page (right-click icon → Options). The redirect URI is displayed in the **OAuth Redirect URI** field with a Copy button.
6. Click **Create**
7. Copy the **Client ID** (it ends with `.apps.googleusercontent.com`)

> **Important:** The application type MUST be **Web application**, not "Chrome Extension". Using the wrong type causes `redirect_uri_mismatch` errors.

---

## Step 3 — Create a Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) → create a **new blank spreadsheet**
2. Name it (e.g., `LinkedIn Leads`)
3. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← COPY THIS PART →  /edit
   ```
   The ID is the long alphanumeric string between `/d/` and `/edit`

---

## Step 4 — Configure the Extension

1. Right-click the extension icon → **Options** (or click the ⚙ gear icon in the popup)
2. In the **Google Integration** section:
   - Paste your **Google OAuth Client ID**
   - Paste your **Google Spreadsheet ID**
3. Click **Save Settings**
4. Click **Authenticate with Google**
   - A Google sign-in popup will appear
   - Sign in with the same Google account that owns the spreadsheet
   - If your app is in Testing mode, you may see a "Google hasn't verified this app" warning — click **Continue**
   - After successful auth, your Gmail address will auto-fill in the **Gmail Sender Address** field
5. Click **Initialize Sheets**
   - This creates four tabs in your spreadsheet with proper column headers:
     - `client with email`
     - `client without email`
     - `email_log`
     - `monthly_report`

---

## Step 5 — Verify Everything Works

1. Open the extension popup (click the toolbar icon)
2. The status dot should show **Idle** (green)
3. The ⚠ auth warning banner should NOT appear
4. Navigate to [linkedin.com](https://www.linkedin.com/feed/) and log in
5. Click **Capture LinkedIn Posts** in the popup
6. You should see:
   - Status changes to **Running...**
   - The page scrolls through LinkedIn posts
   - After ~20 seconds, screenshots appear in the **📸 Gallery** tab
   - The **📊 Stats** tab shows updated counts

> If you see errors, check the [Troubleshooting](#troubleshooting) section below.

---

## Optional: Customize Settings

In the Options page, you can also configure:

| Setting | Default | Description |
|---|---|---|
| LinkedIn Search Keyword | `UAE job positions Oil and gas onshore or offshore` | Posts are filtered by this keyword |
| Follow-up Interval | 7 days | Days before a follow-up email is sent |
| Monthly Report Recipient | `madhu@kushiconsultancy.com` | Who receives the monthly report |
| Monthly Report CC | `kushi_head@outlook.com` | CC on the monthly report |
| Initial Outreach Template | (built-in HTML) | Customizable outreach email body |
| Follow-Up Template | (built-in HTML) | Customizable follow-up email body |

---

## Extension File Structure

```
extension/
├── manifest.json                   ← Extension config (MV3)
├── lib/                            ← Bundled Tesseract.js OCR engine
│   ├── tesseract.min.js            ← Main Tesseract library (65 KB)
│   ├── worker.min.js               ← Web Worker script (121 KB)
│   ├── tesseract-core-simd-lstm.wasm.js  ← WASM OCR engine (3.8 MB)
│   └── eng.traineddata.gz          ← English language model (2.9 MB)
├── background/
│   ├── service_worker.js           ← Main orchestrator
│   ├── scheduler.js                ← Alarm-based scheduling
│   ├── email_classifier.js         ← Email sending & classification
│   └── report_generator.js         ← Monthly reports
├── content/
│   └── linkedin_scraper.js         ← LinkedIn post capture script
├── offscreen/
│   ├── offscreen.html              ← Offscreen document for OCR
│   └── ocr_worker.js               ← Tesseract.js OCR processing
├── popup/                          ← Toolbar popup UI
├── options/                        ← Settings page
├── api/                            ← Google API wrappers
├── templates/                      ← Email templates
├── utils/                          ← Shared constants, helpers
└── assets/                         ← Extension icons
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **"Google Client ID not configured"** | Options → paste your OAuth Client ID → Save Settings |
| **"Spreadsheet ID not configured"** | Options → paste your Spreadsheet ID → Save Settings |
| **"bad client id"** | Double-check the Client ID matches Google Cloud Console → Credentials |
| **"redirect_uri_mismatch"** | OAuth client must be type **Web application**. Delete the old credential, create a new one with the correct redirect URI from the Options page |
| **Auth popup doesn't appear** | Ensure the redirect URI in Google Cloud matches `https://<ext-id>.chromiumapp.org/` exactly. Also confirm you added yourself as a test user |
| **"Google hasn't verified this app"** | This is normal for test-mode apps. Click **Advanced** → **Go to app (unsafe)** |
| **"Please navigate to LinkedIn"** | Open `linkedin.com/feed` or a LinkedIn search page before clicking Capture |
| **No posts captured** | Make sure LinkedIn posts have loaded. Try refreshing the page and waiting a few seconds |
| **OCR not extracting text** | Check Chrome DevTools (F12 on the extension's background page) for Tesseract errors. Ensure `wasm-unsafe-eval` is in the CSP |
| **Emails not sending** | Verify Gmail API is enabled in Cloud Console and you authenticated with the correct account |
| **Extension shows old data** | Click the 🗑 Clear button in the Gallery tab, then re-capture |

---

## Updating the Extension

When a new version is available:

1. Replace the `extension/` folder contents with the new files
2. Go to `chrome://extensions`
3. Click the **reload** button (↻) on the extension card
4. Re-check the Options page — your settings are preserved in Chrome storage

---

## Uninstalling

1. Go to `chrome://extensions`
2. Click **Remove** on the LinkedIn Data Feed Generator card
3. Optionally delete the Google Cloud project and spreadsheet
