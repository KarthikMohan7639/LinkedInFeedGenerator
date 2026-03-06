// offscreen/ocr_worker.js
// Runs inside the offscreen document to perform OCR and image cropping.
// Has full DOM access (canvas, Image, etc.) unlike the service worker.
// Tesseract.js is loaded via <script> tag in offscreen.html from lib/tesseract.min.js

let tesseractWorker = null;
let tesseractReady = false;
let initPromise = null;

/**
 * Initialize Tesseract.js worker with locally bundled files.
 */
async function initTesseract() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      if (typeof Tesseract === "undefined") {
        throw new Error("Tesseract.js not loaded");
      }

      tesseractWorker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
        workerPath: chrome.runtime.getURL("lib/worker.min.js"),
        corePath: chrome.runtime.getURL("lib/tesseract-core-simd-lstm.wasm.js"),
        langPath: chrome.runtime.getURL("lib/"),
        workerBlobURL: false,
        cacheMethod: "none",
        gzip: true,
      });

      tesseractReady = true;
      console.info("[OCR] Tesseract.js worker initialized with local bundle");
    } catch (err) {
      console.error("[OCR] Tesseract.js initialization failed:", err);
      tesseractReady = false;
    }
  })();
  return initPromise;
}

/**
 * Load an image from a data URL.
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

/**
 * Crop a screenshot to the given rect.
 */
async function cropImage(imageDataUrl, rect) {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");

  // Clamp rect to image bounds
  const sx = Math.max(0, Math.min(rect.x, img.width));
  const sy = Math.max(0, Math.min(rect.y, img.height));
  const sw = Math.min(rect.width, img.width - sx);
  const sh = Math.min(rect.height, img.height - sy);

  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return canvas.toDataURL("image/png");
}

/**
 * Preprocess image for better OCR: grayscale + contrast + binarize.
 */
function preprocessForOCR(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrast = 1.5;
    const adjusted = Math.min(255, Math.max(0, ((gray - 128) * contrast) + 128));
    const bw = adjusted > 128 ? 255 : 0;
    data[i] = bw;
    data[i + 1] = bw;
    data[i + 2] = bw;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Run OCR on an image data URL.
 */
async function runOCR(imageDataUrl) {
  await initTesseract();

  if (!tesseractReady || !tesseractWorker) {
    console.error("[OCR] Tesseract.js worker not available");
    return "";
  }

  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  try {
    preprocessForOCR(ctx, canvas.width, canvas.height);
    const processedDataUrl = canvas.toDataURL("image/png");
    const { data: { text } } = await tesseractWorker.recognize(processedDataUrl);
    return text || "";
  } catch (err) {
    console.error("[OCR] Tesseract recognition failed:", err);
    return "";
  }
}

// ─── Message Listener ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_OCR" && message.imageDataUrl) {
    runOCR(message.imageDataUrl)
      .then(text => sendResponse(text))
      .catch(err => {
        console.error("[OCR] Error:", err);
        sendResponse("");
      });
    return true;
  }

  if (message.type === "CROP_IMAGE" && message.imageDataUrl && message.rect) {
    cropImage(message.imageDataUrl, message.rect)
      .then(cropped => sendResponse(cropped))
      .catch(err => {
        console.error("[OCR] Crop error:", err);
        sendResponse(message.imageDataUrl); // Return original on failure
      });
    return true;
  }
});

// Initialize on load
initTesseract();
console.info("[OCR Worker] Offscreen document loaded");
