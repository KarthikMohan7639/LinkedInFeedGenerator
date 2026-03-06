// content/linkedin_scraper.js
// Screenshot-based LinkedIn post capture
// Finds post elements, scrolls each into view, and requests the service worker
// to capture visible-tab screenshots. Also sends bounding-rect info so the
// background can crop to the individual post.

(function () {
  "use strict";

  const DEFAULT_KEYWORD = "UAE job positions Oil and gas onshore or offshore";

  // Strong domain words that alone indicate relevance
  const STRONG_WORDS = [
    "oil", "gas", "offshore", "onshore", "uae", "dubai", "abu dhabi",
    "drilling", "petroleum", "refinery", "rig", "upstream", "downstream"
  ];

  let isRunning = false;

  // ─── Keyword Matching ─────────────────────────────────────────────────────

  function keywordMatches(text, keyword) {
    const lower = text.toLowerCase();
    if (lower.includes(keyword.toLowerCase())) return true;
    if (STRONG_WORDS.some(w => lower.includes(w))) return true;
    const words = keyword.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
    return words.filter(w => lower.includes(w)).length >= 2;
  }

  // ─── Find Post Containers ─────────────────────────────────────────────────

  function findPostContainers(keyword) {
    const searchKeyword = (keyword || DEFAULT_KEYWORD).toLowerCase();

    // Stage 1: CSS selectors (fast)
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
        console.info(`[LinkedIn Scraper] Selector hit: [${selectors.join(",")}] → ${found.length}`);
        containers = found;
        break;
      }
    }

    // Stage 2: large list items in main
    if (containers.length === 0) {
      const mainEl = document.querySelector("main") ||
                     document.querySelector("[role='main']") ||
                     document.querySelector("#main");
      const scope = mainEl || document.body;
      containers = [...scope.querySelectorAll("li")].filter(el => {
        const len = (el.innerText || "").length;
        return len > 150 && len < 8000;
      });
    }

    // Stage 3: brute-force large divs
    if (containers.length === 0) {
      const all = [
        ...document.querySelectorAll("li"),
        ...document.querySelectorAll("article"),
        ...document.querySelectorAll("div[class]")
      ];
      containers = all.filter(el => {
        const text = (el.innerText || "").trim();
        return text.length > 150 && text.length < 10000 &&
               keywordMatches(text, searchKeyword) &&
               el.querySelector("a");
      });
    }

    // Filter by keyword
    containers = containers.filter(el => {
      const text = (el.innerText || "").trim();
      return text.length > 50 && keywordMatches(text, searchKeyword);
    });

    // Deduplicate nested containers
    const unique = [];
    const used = new Set();
    for (const el of containers) {
      let dominated = false;
      for (const ex of used) {
        if (ex.contains(el)) { dominated = true; break; }
      }
      if (!dominated) {
        // Remove children already added
        for (let i = unique.length - 1; i >= 0; i--) {
          if (el.contains(unique[i])) {
            used.delete(unique[i]);
            unique.splice(i, 1);
          }
        }
        unique.push(el);
        used.add(el);
      }
    }

    return unique;
  }

  // ─── URL / Author Extraction (minimal, for metadata) ─────────────────────

  function extractPostUrl(element) {
    const selectors = [
      'a[href*="/posts/"]', 'a[href*="/feed/update/"]',
      'a[href*="activity"]', 'a[href*="/search/results/"]',
      'a[data-tracking-control-name*="post"]'
    ];
    for (const sel of selectors) {
      const anchor = element.querySelector(sel);
      if (anchor && anchor.href) {
        try {
          const u = new URL(anchor.href);
          return u.origin + u.pathname;
        } catch { return anchor.href; }
      }
    }
    const allAnchors = element.querySelectorAll('a[href*="linkedin.com"]');
    for (const a of allAnchors) {
      if (a.href && !a.href.includes("javascript")) return a.href.split("?")[0];
    }
    return "";
  }

  function extractAuthorName(element) {
    const selectors = [
      ".update-components-actor__name",
      ".update-components-actor__name span[aria-hidden='true']",
      ".entity-result__title-text a span[aria-hidden='true']",
      ".entity-result__title-text",
      ".feed-shared-actor__name",
      ".feed-shared-actor__title span[aria-hidden='true']",
      "[data-anonymize='person-name']",
      ".actor-name"
    ];
    for (const sel of selectors) {
      const el = element.querySelector(sel);
      if (el && el.innerText?.trim()) return el.innerText.trim().split("\n")[0].trim();
    }
    return "Unknown";
  }

  function extractAuthorProfile(element) {
    const selectors = [
      ".update-components-actor__container-link",
      ".update-components-actor__meta-link",
      ".entity-result__title-text a",
      ".feed-shared-actor__container-link",
      "a[href*='/in/']",
      "a[href*='/company/']"
    ];
    for (const sel of selectors) {
      const anchor = element.querySelector(sel);
      if (anchor && anchor.href && anchor.href.includes("linkedin.com")) {
        try {
          const u = new URL(anchor.href);
          return u.origin + u.pathname;
        } catch { return anchor.href; }
      }
    }
    return "";
  }

  // ─── Scroll to Load Posts ──────────────────────────────────────────────────

  function scrollToLoadMorePosts() {
    return new Promise(resolve => {
      let scrollCount = 0;
      const maxScrolls = 6;
      const scrollInterval = setInterval(() => {
        window.scrollBy(0, window.innerHeight);
        scrollCount++;
        if (scrollCount >= maxScrolls) {
          clearInterval(scrollInterval);
          setTimeout(resolve, 3000);
        }
      }, 1800);
    });
  }

  // ─── Capture Individual Post ───────────────────────────────────────────────

  /**
   * Scrolls a post element into view, then asks the service worker to
   * capture the visible tab. Sends back the bounding rect so the service
   * worker can crop the screenshot to just this post.
   */
  async function capturePostScreenshot(element, index) {
    // Scroll element into view centered
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    // Wait for scroll and any lazy-loaded content
    await new Promise(r => setTimeout(r, 800));

    const rect = element.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "CAPTURE_POST_SCREENSHOT",
        postIndex: index,
        rect: {
          x: Math.round(rect.x * dpr),
          y: Math.round(rect.y * dpr),
          width: Math.round(rect.width * dpr),
          height: Math.round(rect.height * dpr)
        },
        dpr
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.imageDataUrl);
        } else {
          reject(new Error(response?.error || "Screenshot capture failed"));
        }
      });
    });
  }

  // ─── Main Runner ───────────────────────────────────────────────────────────

  async function runScraper(keyword) {
    if (isRunning) {
      console.warn("[LinkedIn Scraper] Already running.");
      return;
    }
    isRunning = true;
    console.info("[LinkedIn Scraper] Starting screenshot-based capture:", keyword || DEFAULT_KEYWORD);

    try {
      // Scroll to load more posts
      await scrollToLoadMorePosts();

      // Scroll back to top before capturing
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 1000));

      const containers = findPostContainers(keyword);
      console.info(`[LinkedIn Scraper] Found ${containers.length} post containers to capture`);

      if (containers.length === 0) {
        chrome.runtime.sendMessage({
          type: "POSTS_CAPTURED",
          payload: []
        });
        isRunning = false;
        return;
      }

      const capturedPosts = [];
      const maxCaptures = 15; // Limit to avoid memory issues

      for (let i = 0; i < Math.min(containers.length, maxCaptures); i++) {
        const el = containers[i];
        try {
          console.info(`[LinkedIn Scraper] Capturing post ${i + 1}/${Math.min(containers.length, maxCaptures)}...`);

          const imageDataUrl = await capturePostScreenshot(el, i);

          capturedPosts.push({
            postIndex: i,
            postUrl: extractPostUrl(el) || window.location.href,
            authorName: extractAuthorName(el),
            authorProfile: extractAuthorProfile(el),
            imageDataUrl,
            capturedAt: new Date().toISOString()
          });

          console.info(`[LinkedIn Scraper] ✓ Captured post ${i + 1}: ${capturedPosts[capturedPosts.length - 1].authorName}`);
        } catch (err) {
          console.warn(`[LinkedIn Scraper] Failed to capture post ${i + 1}:`, err.message);
        }
      }

      console.info(`[LinkedIn Scraper] Total captured: ${capturedPosts.length}`);

      // Send all captured posts to service worker for OCR processing
      chrome.runtime.sendMessage({
        type: "POSTS_CAPTURED",
        payload: capturedPosts
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("[LinkedIn Scraper] Message error:", chrome.runtime.lastError.message);
        } else {
          console.info("[LinkedIn Scraper] Service worker response:", response);
        }
        isRunning = false;
      });

    } catch (err) {
      console.error("[LinkedIn Scraper] Fatal error:", err);
      isRunning = false;
    }
  }

  // ─── Entry Points ──────────────────────────────────────────────────────────

  // Listen for trigger from service worker
  window.addEventListener("linkedin_scraper_trigger", (e) => {
    const keyword = e.detail?.keyword || null;
    runScraper(keyword);
  });

  // Auto-run on relevant search pages
  if (window.location.href.includes("keywords=")) {
    const urlKeyword = decodeURIComponent(
      new URLSearchParams(window.location.search).get("keywords") || ""
    );
    if (urlKeyword.toLowerCase().includes("oil") || urlKeyword.toLowerCase().includes("uae")) {
      setTimeout(() => runScraper(urlKeyword), 3000);
    }
  }

  console.info("[LinkedIn Scraper] Content script loaded (screenshot mode).");
})();
