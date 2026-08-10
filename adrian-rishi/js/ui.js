//  TOAST
// ══════════════════════════════════════════
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ══════════════════════════════════════════

//  PHOTO PROPERTIES (long-press on any photo)
// ══════════════════════════════════════════
let _ppTimer = null;
let _ppTriggered = false;
let _ppTargetEl = null;
let _ppCurrentUrl = '';
const PP_HOLD_MS = 550;

function _ppFindWrap(target) {
  return target.closest && target.closest('.photo-img-wrap[data-pm]');
}

function _ppStart(e) {
  const wrap = _ppFindWrap(e.target);
  if (!wrap) return;
  _ppTargetEl = wrap;
  _ppTriggered = false;
  clearTimeout(_ppTimer);
  _ppTimer = setTimeout(() => {
    _ppTriggered = true;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch(e){} }
    showPhotoProperties(wrap);
  }, PP_HOLD_MS);
}

function _ppCancel() {
  clearTimeout(_ppTimer);
  _ppTargetEl = null;
}

function _ppMove(e) {
  // Cancel long-press if the finger/mouse moves too much (likely a scroll)
  clearTimeout(_ppTimer);
}

document.addEventListener('touchstart', _ppStart, { passive: true });
document.addEventListener('touchend', _ppCancel, { passive: true });
document.addEventListener('touchmove', _ppMove, { passive: true });
document.addEventListener('mousedown', _ppStart);
document.addEventListener('mouseup', _ppCancel);
document.addEventListener('mouseleave', _ppCancel);

// Block the browser's native "save image / open in new tab" long-press menu on photos entirely
document.addEventListener('contextmenu', (e) => {
  if (_ppFindWrap(e.target)) e.preventDefault();
});

// Suppress the normal click (which would open the lightbox) right after a long-press fires
document.addEventListener('click', (e) => {
  if (_ppTriggered && _ppFindWrap(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    _ppTriggered = false;
  }
}, true);

function showPhotoProperties(wrapEl) {
  let meta = {};
  try { meta = JSON.parse(decodeURIComponent(wrapEl.getAttribute('data-pm') || '{}')); } catch(e) {}
  _ppCurrentUrl = meta.url || '';

  const rows = [];
  rows.push(['Category', meta.category || '—']);
  if (meta.project) rows.push(['Project', meta.project]);
  rows.push(['Uploaded', meta.created_at ? new Date(meta.created_at).toLocaleString('en-IN') : 'Unknown']);
  rows.push(['Watermarked', meta.watermarked ? '🔒 Yes' : 'No']);
  rows.push(['Dimensions', 'Loading…']);
  rows.push(['Photo ID', meta.id ? String(meta.id).slice(0, 12) + (String(meta.id).length > 12 ? '…' : '') : '—']);

  const body = document.getElementById('props-body');
  body.innerHTML = rows.map(([label, value]) => `
    <div class="props-row"><span class="props-label">${label}</span><span class="props-value">${value}</span></div>
  `).join('');

  document.getElementById('props-overlay').classList.add('open');

  // Always probe the ORIGINAL url (meta.url), never the on-screen thumbnail —
  // the grid <img> shows a resized preview for speed, but the original file
  // in storage is untouched. This is what confirms true dimensions to the user.
  if (_ppCurrentUrl) {
    const probe = new Image();
    probe.onload = () => {
      const dimRow = body.querySelectorAll('.props-row')[4];
      if (dimRow) dimRow.querySelector('.props-value').textContent = `${probe.naturalWidth} × ${probe.naturalHeight}px (original)`;
    };
    probe.onerror = () => {
      const dimRow = body.querySelectorAll('.props-row')[4];
      if (dimRow) dimRow.querySelector('.props-value').textContent = 'Unavailable';
    };
    probe.src = _ppCurrentUrl;
  }

  // Try to fetch the file size via a HEAD request (best-effort; Cloudinary usually allows this)
  if (_ppCurrentUrl) {
    fetch(_ppCurrentUrl, { method: 'HEAD' }).then(res => {
      const len = res.headers.get('content-length');
      if (len) {
        const row = document.createElement('div');
        row.className = 'props-row';
        row.innerHTML = `<span class="props-label">File Size</span><span class="props-value">${fmtBytes(parseInt(len))}</span>`;
        body.appendChild(row);
      }
    }).catch(() => {});
  }
}

function closePhotoProps() {
  document.getElementById('props-overlay').classList.remove('open');
}

function copyPhotoPropUrl() {
  if (!_ppCurrentUrl) return;
  navigator.clipboard.writeText(_ppCurrentUrl).then(() => showToast('✅ URL copied')).catch(() => showToast('Could not copy URL'));
}
