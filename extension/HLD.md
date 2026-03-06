# High-Level Design (HLD)
## LinkedIn Data Feed Generator – Chrome Extension

---

## 1. Overview

A Chrome Extension that automates LinkedIn post scraping for a specific keyword ("UAE job positions Oil and gas onshore or offshore"), classifies posts by email presence, manages client outreach via Gmail, tracks responses, and sends periodic reports — all orchestrated through Google Sheets as the data backbone.

---

## 2. System Context Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                              │
│                                                                      │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────┐ │
│  │  Popup   │   │  Background  │   │  Content     │   │ Options  │ │
│  │  UI      │◄──│  Service     │◄──│  Script      │   │  Page    │ │
│  │(Controls)│   │  Worker      │   │(LinkedIn DOM)│   │(Settings)│ │
│  └──────────┘   └──────┬───────┘   └──────────────┘   └──────────┘ │
│                         │                                            │
└─────────────────────────┼────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
  ┌───────────────┐ ┌──────────┐ ┌──────────────────┐
  │ Google Sheets │ │  Gmail   │ │   LinkedIn.com    │
  │     API       │ │   API    │ │  (DOM Scraping)   │
  └───────────────┘ └──────────┘ └──────────────────┘
```

---

## 3. High-Level Components

| Component | Responsibility |
|---|---|
| **Popup UI** | User-facing controls: trigger scrape, view status, configure keyword |
| **Background Service Worker** | Orchestrator: scheduling, API calls, email dispatch, report generation |
| **Content Script** | Injected into LinkedIn pages; scrapes post data from DOM |
| **Options Page** | OAuth configuration, email template editor, schedule settings |
| **Google Sheets Module** | CRUD operations on spreadsheet tabs |
| **Gmail Module** | Send initial emails, follow-ups, and monthly reports |
| **Scheduler Module** | Manages weekly follow-up triggers and monthly report triggers |

---

## 4. Data Flow – End-to-End

```
[User triggers scrape via Popup]
         │
         ▼
[Content Script scrapes LinkedIn feed]
         │ Posts[]
         ▼
[Background Worker – Email Extractor]
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
[Has Email] [No Email]
    │          │
    ▼          ▼
[Sheet: "client  [Sheet: "client
 with email"]    without email"]
    │
    ▼
[Gmail Module – Send outreach email]
    │
    ├── Success → Update Sheet (status = "Sent", timestamp)
    └── Failure → Update Sheet (status = "Failed", reason)
         │
         ▼
[Scheduler – Check every week]
    │
    └── No Acknowledgement received → Send Follow-up Email
         │
         ▼
[Gmail Watch / Polling – Detect Replies]
    │
    └── Update Sheet row with reply status
         │
         ▼
[Scheduler – End of Month]
    │
    └── Generate Report → Email to madhu@kushiconsultancy.com
                            CC: kushi_head@outlook.com
```

---

## 5. Google Sheets Structure

| Sheet Name | Purpose |
|---|---|
| `client with email` | Posts containing email IDs, outreach tracking |
| `client without email` | Posts without email IDs for reference |
| `email_log` | Detailed log of all sent emails with timestamps |
| `monthly_report` | Auto-generated monthly summary data |

---

## 6. Technology Stack

| Layer | Technology |
|---|---|
| Extension Runtime | Chrome Extension Manifest V3 |
| Frontend (Popup/Options) | HTML5, CSS3, Vanilla JS |
| Background Logic | Service Worker (JavaScript) |
| LinkedIn Scraping | Content Script + DOM APIs |
| Email Detection | Regex Engine (JavaScript) |
| Data Store | Google Sheets API v4 |
| Email Service | Gmail API v1 |
| Authentication | Google OAuth 2.0 (chrome.identity API) |
| Scheduling | chrome.alarms API |

---

## 7. External API Integrations

### 7.1 Google OAuth 2.0
- Scopes: `spreadsheets`, `gmail.send`, `gmail.readonly`
- Flow: `chrome.identity.getAuthToken()` with interactive prompt

### 7.2 Google Sheets API v4
- Read/Write rows to named sheets
- Append new post records
- Update status columns after email actions

### 7.3 Gmail API v1
- `messages.send` – Outreach & follow-up emails
- `messages.list` / `history.list` – Detect client replies
- MIME/RFC 2822 formatted messages with templates

---

## 8. Scheduling Architecture

```
chrome.alarms API
├── alarm: "weekly_followup"     → fires every 7 days
│         └── Background Worker checks Sheet for unacknowledged clients
│                  └── Sends follow-up email
│
└── alarm: "monthly_report"      → fires on last day of each month
          └── Background Worker aggregates Sheet data
                   └── Sends report to madhu@kushiconsultancy.com
```

---

## 9. Security Considerations

- OAuth tokens stored in `chrome.storage.session` (never localStorage)
- No credentials hardcoded in extension code
- Content Security Policy (CSP) enforced in manifest
- Gmail API scope limited to minimum required
- Email template injection-safe (sanitized before sending)

---

## 10. Key Design Decisions

| Decision | Rationale |
|---|---|
| Manifest V3 (Service Worker vs Background Page) | Required by Chrome for new extensions; better security |
| Google Sheets as database | No backend server needed; accessible, shareable |
| Gmail API over SMTP | OAuth-secured; no password storage |
| `chrome.alarms` for scheduling | Survives browser restarts; designed for extensions |
| Content Script for scraping | Direct DOM access on LinkedIn pages |

---
