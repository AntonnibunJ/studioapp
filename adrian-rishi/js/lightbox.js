//  LIGHTBOX
// ══════════════════════════════════════════
let currentLbPhotoId = null;

function openLightboxFromGrid(filteredIndex) {
  lbPhotos = (activeCategory === 'all' ? allPhotos : allPhotos.filter(p => p.category === activeCategory));
  openLightboxFull(lbPhotos.map(p => p.url), filteredIndex, lbPhotos[filteredIndex]?.category || '', lbPhotos[filteredIndex]?.id);
}

function openLightbox(urls, index, title) {
  openLightboxFull(urls, index, title, null);
}

function openLightboxFull(urls, index, title, photoId) {
  lbPhotos = typeof urls[0] === 'string' ? urls.map(u => ({ url: u, id: photoId })) : urls;
  lbIndex  = index;
  currentLbPhotoId = photoId;
  const lb = document.getElementById('lightbox');
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  showLbPhoto();
}

function showLbPhoto() {
  const photo = lbPhotos[lbIndex];
  const url = typeof photo === 'string' ? photo : photo.url;
  const id  = typeof photo === 'string' ? null : photo.id;
  currentLbPhotoId = id;
  // Show a fast, optimized preview in the lightbox. The original `url`
  // itself is untouched and is what gets used everywhere else (download
  // buttons, footer, navigation) — only the on-screen <img> uses the
  // lighter version, purely for faster viewing.
  document.getElementById('lb-img').src = cldPreview(url);
  document.getElementById('lb-counter').textContent = `${lbIndex + 1} / ${lbPhotos.length}`;
  document.getElementById('lb-title').textContent = (typeof photo === 'object' && photo.category) ? photo.category : '';
  updateLightboxFooter(id);
}

function updateLightboxFooter(photoId) {
  const footer = document.getElementById('lb-footer');
  if (currentRole === 'studio') {
    const photo = lbPhotos[lbIndex];
    const url = typeof photo === 'string' ? photo : photo?.url;
    footer.innerHTML = url ? `
      <button class="lb-action-btn" onclick="downloadSinglePhoto('${url}','${photoId || ''}')">⬇️ Download Photo</button>
    ` : '';
    return;
  }
  if (currentRole !== 'client' || !photoId) { footer.innerHTML = ''; return; }
  const sel      = selections[photoId] || [];
  const hasLiked  = sel.includes('liked');
  const hasBride  = sel.includes('bride');
  const hasGroom  = sel.includes('groom');
  footer.innerHTML = `
    <button class="lb-action-btn ${hasLiked ? 'active-liked' : ''}" onclick="toggleSelection('${photoId}', 'liked')">${hasLiked ? '❤️ Liked' : '🤍 Like'}</button>
    <button class="lb-action-btn ${hasBride ? 'active-bride' : ''}" onclick="toggleSelection('${photoId}', 'bride')">${hasBride ? '👰 Bride Album' : '+ Bride Album'}</button>
    <button class="lb-action-btn ${hasGroom ? 'active-groom' : ''}" onclick="toggleSelection('${photoId}', 'groom')">${hasGroom ? '🤵 Groom Album' : '+ Groom Album'}</button>
    ${selectionsDirty ? `<button onclick="saveAllSelections()" style="margin-top:0.5rem;width:100%;background:linear-gradient(135deg,#BF953F,#FCF6BA,#B38728);color:#050505;font-weight:700;font-family:'Cinzel',serif;border:none;border-radius:50px;padding:0.7rem 1.5rem;cursor:pointer;font-size:0.85rem;">💾 Save Selections</button>` : ''}
  `;
}

function lbNav(dir) {
  lbIndex = (lbIndex + dir + lbPhotos.length) % lbPhotos.length;
  showLbPhoto();
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

function closeLightboxOutside(e) {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
}

// Swipe support for lightbox
let lbTouchStartX = 0;
document.getElementById('lightbox').addEventListener('touchstart', e => { lbTouchStartX = e.touches[0].clientX; });
document.getElementById('lightbox').addEventListener('touchend', e => {
  const diff = lbTouchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 50) lbNav(diff > 0 ? 1 : -1);
});

// Keyboard
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('open')) return;
  if (e.key === 'ArrowRight') lbNav(1);
  if (e.key === 'ArrowLeft')  lbNav(-1);
  if (e.key === 'Escape')     closeLightbox();
});

// ══════════════════════════════════════════
