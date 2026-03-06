// content/linkedin_scraper.js
// Injected into linkedin.com/feed/* pages to scrape relevant posts
// Note: Content scripts run in isolated world; no ES module imports allowed.
// All logic must be self-contained.

(function () {
  "use strict";

  const DEFAULT_KEYWORD = "UAE job positions Oil and gas onshore or offshore";
  const EMAIL_REGEX     = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const MAX_TEXT_LEN    = 500;

  // Matches labeled phone numbers: "Contact: 8655644356" or "Mobile: +971 50 123 4567"
  // and standalone 10-13 digit numbers
  function extractPhones(text) {
    const phones = new Set();
    // Labeled: Contact/Mobile/Tel/Phone/Call/WhatsApp followed by number
    const labeledRe = /(?:contact|mobile|tel|ph(?:one)?|call|whatsapp)[:\s#.+]*(\+?[\d][\d\s\-]{6,15}\d)/gi;
    let m;
    while ((m = labeledRe.exec(text)) !== null) {
      const digits = m[1].replace(/[\s\-]/g, "");
      if (digits.length >= 8 && digits.length <= 15) phones.add(digits);
    }
    // Standalone 10-13 digit sequences (covers Indian/UAE numbers)
    const standaloneRe = /(\+?\d{10,13})(?!\d)/g;
    while ((m = standaloneRe.exec(text)) !== null) {
      const digits = m[1].replace(/[\s\-]/g, "");
      if (digits.length >= 10 && digits.length <= 13) phones.add(digits);
    }
    return [...phones];
  }

  // Strong domain words that alone indicate relevance
  const STRONG_WORDS = ["oil", "gas", "offshore", "onshore", "uae", "dubai", "abu dhabi",
                        "drilling", "petroleum", "refinery", "rig", "upstream", "downstream"];

  /**
   * Flexible keyword match: true if the full phrase matches, OR any strong word
   * appears, OR ≥2 keyword words (≥3 chars) appear.
   */
  function keywordMatches(text, keyword) {
    const lower = text.toLowerCase();
    if (lower.includes(keyword.toLowerCase())) return true;
    if (STRONG_WORDS.some(w => lower.includes(w))) return true;
    const words = keyword.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    return words.filter(w => lower.includes(w)).length >= 2;
  }

  let isRunning = false;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function extractEmails(text) {
    const matches = text.match(EMAIL_REGEX);
    return matches ? [...new Set(matches.map(e => e.toLowerCase()))] : [];
  }


  function extractPostUrl(element) {
    const selectors = [
      'a[href*="/posts/"]',
      'a[href*="/feed/update/"]',
      'a[href*="activity"]',
      'a[href*="/search/results/"]',
      '.update-components-update-v2__content-container a[href*="linkedin.com"]',
      'a[data-tracking-control-name*="post"]'
    ];
    for (const sel of selectors) {
      const anchor = element.querySelector(sel);
      if (anchor && anchor.href) {
        try {
          const u = new URL(anchor.href);
          return u.origin + u.pathname;
        } catch {
          return anchor.href;
        }
      }
    }
    // Fallback: first linkedin.com anchor in element
    const allAnchors = element.querySelectorAll('a[href*="linkedin.com"]');
    for (const a of allAnchors) {
      if (a.href && !a.href.includes("javascript")) return a.href.split("?")[0];
    }
    return "";
  }

  function extractAuthorName(element) {
    const selectors = [
      // Search results page (modern)
      ".update-components-actor__name",
      ".update-components-actor__name span[aria-hidden='true']",
      ".entity-result__title-text a span[aria-hidden='true']",
      ".entity-result__title-text",
      // Feed page
      ".feed-shared-actor__name",
      ".feed-shared-actor__title span[aria-hidden='true']",
      // Generic
      "[data-anonymize='person-name']",
      ".actor-name",
      ".visually-hidden + span"
    ];
    for (const sel of selectors) {
      const el = element.querySelector(sel);
      if (el && el.innerText?.trim()) return el.innerText.trim().split("\n")[0].trim();
    }
    return "Unknown";
  }

  function extractAuthorProfile(element) {
    const selectors = [
      // Search results page (modern)
      ".update-components-actor__container-link",
      ".update-components-actor__meta-link",
      ".entity-result__title-text a",
      // Feed page
      ".feed-shared-actor__container-link",
      // Generic
      "a[href*='/in/']",
      "a[href*='/company/']"
    ];
    for (const sel of selectors) {
      const anchor = element.querySelector(sel);
      if (anchor && anchor.href && anchor.href.includes("linkedin.com")) {
        try {
          const u = new URL(anchor.href);
          return u.origin + u.pathname;
        } catch {
          return anchor.href;
        }
      }
    }
    return "";
  }

  function extractPostText(element) {
    const selectors = [
      // Search results page (modern)
      ".update-components-text",
      ".update-components-update-v2__commentary",
      ".feed-shared-inline-show-more-text",
      // Feed page
      ".feed-shared-text",
      ".feed-shared-update-v2__description",
      // Generic
      "[data-test-id='main-feed-activity-card__commentary']",
      ".break-words span[dir]",
      ".attributed-text-segment-list__content"
    ];
    for (const sel of selectors) {
      const el = element.querySelector(sel);
      if (el && el.innerText?.trim()) {
        return el.innerText.trim();
      }
    }
    // Fallback: get all visible text in the post
    return element.innerText?.trim().substring(0, MAX_TEXT_LEN * 2) || "";
  }

  // ─── Scroll Handler ───────────────────────────────────────────────────────

  function scrollToLoadMorePosts(callback) {
    let scrollCount = 0;
    const maxScrolls = 6;
    const scrollInterval = setInterval(() => {
      window.scrollBy(0, window.innerHeight);
      scrollCount++;
      if (scrollCount >= maxScrolls) {
        clearInterval(scrollInterval);
        setTimeout(callback, 3000); // Wait longer for search results to render
      }
    }, 1800);
  }

  /**
   * Walks all text nodes in the document and returns elements whose
   * combined text contains keyword-related words.
   */
  function findPostsByTextScan(keyword) {
    const results = [];
    const seen    = new Set();

    // Build an array of individual significant words to search for
    const scanWords = [
      ...STRONG_WORDS,
      ...keyword.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
    ];

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue || "";
      const lower = text.toLowerCase();
      if (!scanWords.some(w => lower.includes(w))) continue;

      // Walk up to find a sensible post container:
      // stop at li, article, or a div/section that is large enough
      let container = node.parentElement;
      while (container && container !== document.body) {
        const tag  = container.tagName;
        const len  = (container.innerText || "").length;

        if ((tag === "LI" || tag === "ARTICLE") && len > 100) break;

        if ((tag === "DIV" || tag === "SECTION") && len > 200) {
          const parent = container.parentElement;
          if (parent && parent !== document.body) {
            const parentLen = (parent.innerText || "").length;
            if (parentLen < len * 3) {
              container = parent;
              continue;
            }
          }
          break;
        }

        container = container.parentElement;
      }

      if (!container || container === document.body) continue;
      if (seen.has(container)) continue;

      // Keep only top-level containers (skip if an ancestor is already captured)
      let dominated = false;
      for (const existing of seen) {
        if (existing.contains(container)) { dominated = true; break; }
        if (container.contains(existing)) { seen.delete(existing); }
      }
      if (!dominated) {
        seen.add(container);
        results.push(container);
      }
    }

    return results;
  }

  /**
   * Nuclear fallback: find ALL large list items or divs that contain
   * keyword-matching text, regardless of structure.
   */
  function findPostsBruteForce(keyword) {
    const candidates = [];

    // Collect all li, article, and significant div containers
    const allItems = [
      ...document.querySelectorAll("li"),
      ...document.querySelectorAll("article"),
      ...document.querySelectorAll("div[class]")
    ];

    for (const el of allItems) {
      const text = (el.innerText || "").trim();
      if (text.length < 150 || text.length > 10000) continue; // skip tiny and page-level elements
      if (!keywordMatches(text, keyword)) continue;

      // Must contain at least one link (posts always have links)
      if (!el.querySelector("a")) continue;

      candidates.push({ el, len: text.length });
    }

    // Deduplicate: if two candidates overlap, keep the smaller (more specific) one
    const sorted = candidates.sort((a, b) => a.len - b.len);
    const results = [];
    const used = new Set();

    for (const { el } of sorted) {
      let dominated = false;
      for (const existing of used) {
        if (existing.contains(el)) { dominated = true; break; }
      }
      if (dominated) continue;

      // Remove any already-added elements that this one contains
      for (let i = results.length - 1; i >= 0; i--) {
        if (el.contains(results[i])) {
          used.delete(results[i]);
          results.splice(i, 1);
        }
      }

      results.push(el);
      used.add(el);
    }

    return results;
  }

  /**
   * Logs DOM structure info to help diagnose selector failures.
   */
  function logDomDiscovery() {
    const attrCounts = {};
    document.querySelectorAll("*").forEach(el => {
      [...el.attributes].filter(a => a.name.startsWith("data-")).forEach(a => {
        attrCounts[a.name] = (attrCounts[a.name] || 0) + 1;
      });
    });
    // Show only attrs with >2 occurrences (likely structural)
    const filtered = Object.fromEntries(Object.entries(attrCounts).filter(([,v]) => v > 2));
    console.info("[LinkedIn Scraper] DOM data-attributes (>2 occurrences):", filtered);
    console.info("[LinkedIn Scraper] article count:", document.querySelectorAll("article").length);
    console.info("[LinkedIn Scraper] li count (total):", document.querySelectorAll("li").length);
    console.info("[LinkedIn Scraper] li count (>100 chars):",
      [...document.querySelectorAll("li")].filter(el => (el.innerText || "").length > 100).length);
  }

  function scrapeLinkedInPosts(keyword) {
    const searchKeyword = (keyword || DEFAULT_KEYWORD).toLowerCase();
    const posts         = [];

    // ── Stage 1: CSS selectors (fast) ──
    const selectorGroups = [
      ["[data-urn*='activity']", "[data-urn*='share']"],
      ["[data-finite-scroll-hotkey-item]"],
      ["[data-chameleon-result-urn]"],
      ["li.reusable-search__result-container"],
      ["[data-view-name='search-entity-result-universal-template']"],
      [".feed-shared-update-v2"],
      [".update-components-update-v2"],
      ["[data-entity-urn]"],
      ["[data-urn]"],
      ["article"]
    ];

    let containers = [];
    for (const selectors of selectorGroups) {
      let found = [];
      for (const sel of selectors) {
        found = [...found, ...document.querySelectorAll(sel)];
      }
      found = [...new Set(found)].filter(el => (el.innerText || "").trim().length > 100);
      if (found.length > 0) {
        console.info(`[LinkedIn Scraper] Stage 1 hit: [${selectors.join(",")}] → ${found.length} elements`);
        containers = found;
        break;
      }
    }

    // ── Stage 2: large list items inside main content area ──
    if (containers.length === 0) {
      const mainEl = document.querySelector("main")
                  || document.querySelector("[role='main']")
                  || document.querySelector("#main");
      const scope = mainEl || document.body;
      const allLis = [...scope.querySelectorAll("li")].filter(el => {
        const len = (el.innerText || "").length;
        return len > 150 && len < 8000;
      });
      if (allLis.length > 0) {
        console.info(`[LinkedIn Scraper] Stage 2: ${allLis.length} large <li> elements in main area`);
        containers = allLis;
      }
    }

    // ── Stage 3: text-node TreeWalker ──
    if (containers.length === 0) {
      console.info("[LinkedIn Scraper] Stage 3: text-node scan...");
      containers = findPostsByTextScan(searchKeyword);
      console.info(`[LinkedIn Scraper] Stage 3: text-scan found ${containers.length} containers`);
    }

    // ── Stage 4: brute-force (nuclear) ──
    if (containers.length === 0) {
      console.info("[LinkedIn Scraper] Stage 4: brute-force scan...");
      containers = findPostsBruteForce(searchKeyword);
      console.info(`[LinkedIn Scraper] Stage 4: brute-force found ${containers.length} containers`);
    }

    if (containers.length === 0) {
      console.warn("[LinkedIn Scraper] All 4 stages failed to find post containers.");
      logDomDiscovery();
      return posts;
    }

    console.info(`[LinkedIn Scraper] Filtering ${containers.length} containers by keyword...`);

    let skippedNoText = 0, skippedNoKeyword = 0;
    for (const el of containers) {
      try {
        const postText = extractPostText(el);
        if (!postText) { skippedNoText++; continue; }
        if (!keywordMatches(postText, searchKeyword)) { skippedNoKeyword++; continue; }

        const postUrl       = extractPostUrl(el);
        const authorName    = extractAuthorName(el);
        const authorProfile = extractAuthorProfile(el);
        const emails        = extractEmails(postText);
        const phones        = extractPhones(postText);

        posts.push({
          postUrl:        postUrl || window.location.href,
          authorName,
          authorProfile,
          postText:       postText.substring(0, MAX_TEXT_LEN),
          emails,
          phones,
          hasEmail:       emails.length > 0,
          scrapedAt:      new Date().toISOString()
        });

        console.info(`[LinkedIn Scraper] ✓ ${authorName} | Email: ${emails.join(", ") || "none"} | Phone: ${phones.join(", ") || "none"}`);
      } catch (err) {
        console.warn("[LinkedIn Scraper] Error parsing element:", err);
      }
    }

    console.info(`[LinkedIn Scraper] Summary: ${posts.length} matched, ${skippedNoText} empty, ${skippedNoKeyword} no keyword match`);
    return posts;
  }

  // ─── Run and Communicate ─────────────────────────────────────────────────

  function runScraper(keyword) {
    if (isRunning) {
      console.warn("[LinkedIn Scraper] Already running, skipping duplicate trigger.");
      return;
    }
    isRunning = true;
    console.info("[LinkedIn Scraper] Starting scrape with keyword:", keyword || DEFAULT_KEYWORD);

    scrollToLoadMorePosts(() => {
      const posts = scrapeLinkedInPosts(keyword);
      console.info(`[LinkedIn Scraper] Scraped ${posts.length} matching posts.`);

      chrome.runtime.sendMessage({
        type:    "POSTS_SCRAPED",
        payload: posts
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("[LinkedIn Scraper] Message error:", chrome.runtime.lastError.message);
        } else {
          console.info("[LinkedIn Scraper] Service worker response:", response);
        }
        isRunning = false;
      });
    });
  }

  // ─── Entry Points ──────────────────────────────────────────────────────────

  // 1. Listen for programmatic trigger from service worker (via scripting.executeScript → dispatchEvent)
  window.addEventListener("linkedin_scraper_trigger", (e) => {
    const keyword = e.detail?.keyword || null;
    runScraper(keyword);
  });

  // 2. Auto-run if on the feed page (useful for search result pages)
  //    Only auto-run if the page URL already suggests it's a relevant search
  if (window.location.href.includes("keywords=")) {
    const urlKeyword = decodeURIComponent(
      new URLSearchParams(window.location.search).get("keywords") || ""
    );
    if (urlKeyword.toLowerCase().includes("oil") || urlKeyword.toLowerCase().includes("uae")) {
      setTimeout(() => runScraper(urlKeyword), 3000);
    }
  }

  console.info("[LinkedIn Scraper] Content script loaded and ready.");
})();
