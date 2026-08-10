// Encode a small metadata object into a safe HTML attribute for the long-press "Photo Properties" feature
function pmAttr(obj) {
  try {
    return `data-pm="${encodeURIComponent(JSON.stringify(obj))}"`;
  } catch(e) { return ''; }
}

function formatMoney(amount, currency) {
  const sym = currency === 'INR' ? '₹' : (currency || '');
  return `${sym}${Number(amount || 0).toLocaleString('en-IN')}`;
}

// Returns the URL to actually display/download in the owner's Client Picks view,
// honoring their personal watermark-visibility preference.
function cldThumb(url, width = 400) {
  if (!url || !url.includes('/upload/')) return url;
  // Insert a fast, low-quality resize transform right after /upload/ so grids
  // load small previews instead of full-resolution originals. The original
  // url (unchanged) is still used for downloads and the lightbox.
  return url.replace('/upload/', `/upload/c_limit,w_${width},q_auto,f_auto/`);
}

function cldPreview(url) {
  if (!url || !url.includes('/upload/')) return url;
  // A large but optimized version for the full-screen lightbox: visually
  // identical to the original at typical phone/screen sizes, but with
  // smart compression so it loads in a fraction of the time. The true,
  // untouched original is always used for "Download Photo" — this is
  // display-only and never affects the stored file.
  return url.replace('/upload/', `/upload/c_limit,w_1600,q_auto:good,f_auto/`);
}

function ownerPicksUrl(url) {
  if (!url) return url;
  return cldThumb(ownerPicksWmDisabled ? stripWatermark(url) : url);
}

function safeParseJson(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : (str || fallback); } catch { return fallback; }
}

function fmtBytes(bytes) {
  if (!bytes || isNaN(bytes)) return 'Unknown';
  const units = ['B','KB','MB','GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 2 : 0)} ${units[i]}`;
}
