//  OWNER SELECTIONS VIEW
// ══════════════════════════════════════════
async function loadOwnerSelections() {
  const projectId = document.getElementById('view-project').value;
  const el = document.getElementById('owner-selections-view');
  loadOwnerPicksWmPref();
  if (!projectId) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  try {
    const [sels, clientPhotos] = await Promise.all([
      sbFetch(`selections?project_id=eq.${projectId}&select=*,photos(*)`),
      sbFetch(`photos?project_id=eq.${projectId}&category=like.client-%25&select=*&order=created_at.asc`)
    ]);
    renderOwnerSelections(sels, clientPhotos || [], el);
  } catch(e) {
    el.innerHTML = '<p style="color:red;font-size:0.8rem;">Error loading.</p>';
  }
}

function renderOwnerSelections(sels, clientPhotos, el) {
  const byType = { liked: [], bride: [], groom: [] };
  sels.forEach(s => { if (byType[s.selection_type]) byType[s.selection_type].push(s); });

  const sections = [
    { key: 'bride', label: '👰 Bride Album',    color: 'var(--bride)' },
    { key: 'groom', label: '🤵 Groom Album',    color: 'var(--groom)' },
  ];

  // Store data globally for lightbox access
  window._ownerSelsByType = byType;

  el.innerHTML = sections.map(s => {
    const items = byType[s.key];
    if (!items.length) return `
      <div class="selection-section">
        <div class="selection-header">
          <div class="selection-dot ${s.key}"></div>
          <div class="selection-title">${s.label}</div>
          <div class="selection-count">0</div>
        </div>
        <div class="empty-state"><div class="empty-icon">📭</div><p>No photos selected yet</p></div>
      </div>`;

    // Store flat list for lightbox + downloads (no sub-category grouping — just liked/bride/groom)
    window._ownerSelsByType[s.key] = items;

    const photoGrid = items.map((sel, idx) => `
      <div class="photo-card" style="position:relative;">
        <div class="photo-img-wrap" ${pmAttr({id:sel.photo_id,category:sel.photos?.category||s.key,url:sel.photos?.url,created_at:sel.photos?.created_at,watermarked:sel.photos?.watermarked})} onclick="openOwnerSelPhoto('${s.key}',${idx})">
          ${sel.photos?.url ? `<img src="${ownerPicksUrl(sel.photos.url)}" loading="lazy" />` : ''}
          <div class="photo-zoom-hint">🔍 View</div>
        </div>
        <div style="padding:0.35rem 0.5rem 0.5rem;">
          <button onclick="event.stopPropagation();downloadSinglePhoto('${ownerPicksUrl(sel.photos?.url)}','${sel.photo_id}')" style="width:100%;background:rgba(79,140,255,0.1);border:1px solid rgba(79,140,255,0.4);border-radius:6px;color:var(--accent);font-size:0.7rem;padding:0.32rem;cursor:pointer;">⬇️ Download</button>
        </div>
      </div>`).join('');

    return `
      <div class="selection-section">
        <div class="selection-header" style="cursor:pointer;" onclick="toggleOwnerSelSection('osel-body-${s.key}')">
          <div class="selection-dot ${s.key}"></div>
          <div class="selection-title">${s.label}</div>
          <div class="selection-count">${items.length} total</div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin:0.5rem 0 0.25rem;">
          <button onclick="downloadOwnerSelections('${s.key}')" style="background:${s.color};border:none;border-radius:8px;color:white;font-size:0.75rem;font-weight:500;padding:0.4rem 0.85rem;cursor:pointer;">⬇️ Download All (${items.length})</button>
        </div>
        <div id="osel-body-${s.key}" class="photo-grid" style="margin-top:0.5rem;">
          ${photoGrid}
        </div>
      </div>`;
  }).join('');

  // ── Client-uploaded photos section ──
  if (clientPhotos && clientPhotos.length) {
    // Group by category name
    const clientCatMap = {};
    clientPhotos.forEach(p => {
      const cat = p.category || 'Client Photos';
      if (!clientCatMap[cat]) clientCatMap[cat] = [];
      clientCatMap[cat].push(p);
    });
    // Store for lightbox
    window._ownerClientPhotos = clientPhotos;

    const clientCatGrid = Object.entries(clientCatMap).map(([cat, photos]) => {
      const displayName = cat.replace(/^client-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const thumb = cldThumb(photos[0]?.url) || '';
      return `
        <div onclick="openOwnerClientPhotos('${cat.replace(/'/g,"\\'")}',0)" style="
          background:white;border:1px solid var(--border);border-radius:12px;overflow:hidden;
          cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.06);"
          onmouseover="this.style.borderColor='var(--success)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="aspect-ratio:4/3;overflow:hidden;background:#f0ece6;position:relative;">
            ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;">📁</div>`}
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.55));"></div>
            <div style="position:absolute;bottom:0.5rem;left:0.75rem;color:white;font-size:0.72rem;font-weight:500;">${photos.length} photos</div>
          </div>
          <div style="padding:0.65rem 0.75rem;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:0.88rem;font-weight:500;color:var(--charcoal);">📁 ${displayName}</div>
            <div style="font-size:0.72rem;padding:0.2rem 0.5rem;border-radius:12px;background:var(--success);color:white;">${photos.length}</div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML += `
      <div class="selection-section" style="margin-top:1.5rem;">
        <div class="selection-header" style="cursor:pointer;" onclick="toggleOwnerSelSection('osel-body-client')">
          <div class="selection-dot custom1"></div>
          <div class="selection-title">📁 Client Uploaded Photos</div>
          <div class="selection-count">${clientPhotos.length} total · ${Object.keys(clientCatMap).length} folder(s)</div>
        </div>
        <div id="osel-body-client" style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem;margin-top:0.5rem;">
          ${clientCatGrid}
        </div>
      </div>`;
  }
}

function toggleOwnerSelSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = (el.style.display === 'none') ? 'grid' : 'none';
}

function openOwnerSelPhoto(type, startIndex) {
  const items = window._ownerSelsByType?.[type];
  if (!items || !items.length) return;
  const urls = items.map(sel => ({ url: ownerPicksUrl(sel.photos?.url), id: sel.photo_id, category: sel.photos?.category || '' }));
  openLightboxFull(urls, startIndex, type, null);
}

async function downloadOwnerSelections(type) {
  const items = window._ownerSelsByType?.[type] || [];
  if (!items.length) { showToast('No photos to download'); return; }
  showToast(`⬇️ Downloading ${items.length} photo(s)… This may take a moment.`);
  let downloaded = 0;
  for (const sel of items) {
    const url = ownerPicksUrl(sel.photos?.url);
    if (!url) continue;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${type}-${sel.photo_id || downloaded}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
      downloaded++;
      await new Promise(r => setTimeout(r, 400)); // avoid browser blocking multiple downloads
    } catch(e) {
      window.open(url, '_blank');
      await new Promise(r => setTimeout(r, 400));
    }
  }
  showToast(`✅ Downloaded ${downloaded} photo(s)`);
}

function openOwnerClientPhotos(cat, startIndex) {
  const all = window._ownerClientPhotos || [];
  const photos = all.filter(p => p.category === cat);
  if (!photos.length) return;
  const displayName = cat.replace(/^client-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  openLightboxFull(photos.map(p => ({ url: p.url, id: p.id, category: displayName })), startIndex, displayName, null);
}

// ══════════════════════════════════════════

//  CLIENT: LOAD PHOTOS
// ══════════════════════════════════════════
async function loadClientPhotos() {
  try {
    allPhotos = await sbFetch(`photos?project_id=eq.${currentProject.id}&select=*&order=created_at.asc`);
    // Filter out client-uploaded photos (categories starting with "client-")
    allPhotos = allPhotos.filter(p => !p.category.startsWith('client-'));
    await loadSelectionsData();
    renderClientCategoryGrid();
  } catch(e) {
    document.getElementById('client-cat-grid').innerHTML = '<p style="color:red;font-size:0.8rem;grid-column:1/-1">Error loading photos.</p>';
  }
}

function renderClientCategoryGrid() {
  const grid = document.getElementById('client-cat-grid');
  if (!allPhotos.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--soft-gray);"><div style="font-size:2rem;margin-bottom:0.5rem;">📷</div><p style="font-size:0.82rem;">No photos uploaded yet for this project</p></div>';
    return;
  }
  // Group by category - only show categories that have photos
  const catMap = {};
  allPhotos.forEach(p => {
    if (!catMap[p.category]) catMap[p.category] = [];
    catMap[p.category].push(p);
  });
  const catIcons = {
    'Pottu Function': '🌸', 'Wedding Photos': '💒', 'Reception Photos': '🎉',
    'Bride-seeing Ceremony': '👁', 'Haldi': '💛', 'Bride to Be': '👰',
    'Post Wedding': '🌅', 'Pre Wedding': '💑', 'Post-Wedding Homecoming': '🏠'
  };
  grid.innerHTML = Object.entries(catMap).map(([cat, photos]) => {
    const icon = catIcons[cat] || '📁';
    const thumb = cldThumb(photos[0]?.url) || '';
    return `
      <div onclick="openClientCategory('${cat}')" style="
        background:white;border:1px solid var(--border);border-radius:12px;overflow:hidden;
        cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.06);"
        onmouseover="this.style.borderColor='var(--theme-accent, var(--gold))'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="aspect-ratio:4/3;overflow:hidden;background:#f0ece6;position:relative;">
          ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.src=stripWatermark(this.src)" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;">${icon}</div>`}
          <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.5));"></div>
          <div style="position:absolute;bottom:0.5rem;left:0.75rem;color:white;font-size:0.72rem;font-weight:500;">${photos.length} photos</div>
        </div>
        <div style="padding:0.65rem 0.75rem;">
          <div style="font-size:0.88rem;font-weight:500;color:var(--charcoal);">${icon} ${cat}</div>
        </div>
      </div>`;
  }).join('');
}

function openClientCategory(cat) {
  activeCategory = cat;
  photoGridVisibleCount = PHOTO_GRID_PAGE_SIZE;
  document.getElementById('client-cat-grid').style.display = 'none';
  document.getElementById('client-cat-expanded').style.display = 'block';
  document.getElementById('client-cat-title').textContent = cat;
  renderPhotoGrid();
}

function closeClientCatView() {
  if (selectionsDirty) {
    if (!confirm('You have unsaved selections. Go back without saving?')) return;
    // Revert local to last saved snapshot
    selections = JSON.parse(JSON.stringify(savedSelectionsSnapshot));
    clearSelectionsDirty();
    updateCounters();
  }
  document.getElementById('client-cat-grid').style.display = 'grid';
  document.getElementById('client-cat-expanded').style.display = 'none';
  activeCategory = 'all';
}

async function loadSelectionsData() {
  try {
    const data = await sbFetch(`selections?project_id=eq.${currentProject.id}&select=*`);
    console.log('SUPABASE selections count:', data.length, 'sample:', JSON.stringify(data.slice(0,2)));
    console.log('allPhotos count:', allPhotos.length, 'sample IDs:', allPhotos.slice(0,2).map(p=>p.id+'('+typeof p.id+')'));
    selections = {};
    data.forEach(s => {
      if (!selections[String(s.photo_id)]) selections[String(s.photo_id)] = [];
      selections[String(s.photo_id)].push(s.selection_type);
    });
    console.log('selections keys after load:', Object.keys(selections));
    // Initialise saved snapshot so Save button can diff correctly
    savedSelectionsSnapshot = JSON.parse(JSON.stringify(selections));
    selectionsDirty = false;
    pendingSelections = {};
    const hint = document.getElementById('save-pending-hint');
    if (hint) hint.style.display = 'none';
    updateCounters();
  } catch(e) { console.error('loadSelectionsData ERROR:', e); }
}

function updateCounters() {
  const brideLimit = window.clientBrideLimit || 250;
  const groomLimit = window.clientGroomLimit || 250;
  let liked = 0, bride = 0, groom = 0;
  Object.values(selections).forEach(types => {
    if (types.includes('liked'))   liked++;
    if (types.includes('bride'))   bride++;
    if (types.includes('groom'))   groom++;
  });
  document.getElementById('count-liked').textContent   = liked;
  document.getElementById('count-bride').textContent   = bride;
  document.getElementById('count-groom').textContent   = groom;
  document.getElementById('limit-bride').textContent = `${bride}/${brideLimit}`;
  document.getElementById('limit-groom').textContent = `${groom}/${groomLimit}`;
  document.getElementById('prog-bride').style.width = `${Math.min((bride / brideLimit) * 100, 100)}%`;
  document.getElementById('prog-groom').style.width = `${Math.min((groom / groomLimit) * 100, 100)}%`;
}

function openSelectionView(type) {
  // Collect photos matching this selection type
  const selectedPhotos = allPhotos.filter(p => {
    const sel = selections[p.id] || [];
    return sel.includes(type);
  });
  if (!selectedPhotos.length) {
    const labels = { liked: 'Liked', bride: 'Bride Album', groom: 'Groom Album' };
    showToast('No photos in ' + (labels[type] || type) + ' yet');
    return;
  }
  const urls = selectedPhotos.map(p => p.url);
  const labelMap = { liked: '❤️ Liked Photos', bride: '👰 Bride Album', groom: '🤵 Groom Album' };
  openLightboxFull(selectedPhotos.map(p => ({ url: p.url, id: p.id, category: p.category })), 0, labelMap[type] || type, null);
}

function filterCategory(cat, btn) {
  activeCategory = cat;
  photoGridVisibleCount = PHOTO_GRID_PAGE_SIZE;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderPhotoGrid();
}

// Pagination for the photo grid — large weddings can have thousands of
// photos, and rendering them all into the DOM at once is slow. We render
// a page at a time and let the user load more on demand. Lightbox
// navigation is unaffected since lbPhotos always holds the full filtered
// list, not just the visible page.
const PHOTO_GRID_PAGE_SIZE = 60;
let photoGridVisibleCount = PHOTO_GRID_PAGE_SIZE;

function renderPhotoGrid() {
  const grid = document.getElementById('photo-grid');
  const filtered = activeCategory === 'all'
    ? allPhotos
    : allPhotos.filter(p => p.category === activeCategory);

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"><i class="ri-camera-line"></i></div><p>No photos in this category yet</p></div>';
    return;
  }

  const visible = filtered.slice(0, photoGridVisibleCount);

  grid.innerHTML = visible.map((photo, idx) => {
    const sel      = selections[photo.id] || [];
    const hasLiked  = sel.includes('liked');
    const hasBride  = sel.includes('bride');
    const hasGroom  = sel.includes('groom');
    const borderClass = hasLiked ? 'selected-liked' : hasBride ? 'selected-bride' : hasGroom ? 'selected-groom' : '';

    return `
      <div class="photo-card ${borderClass}" id="card-${photo.id}">
        <div class="photo-img-wrap" ${pmAttr({id:photo.id,category:photo.category,url:photo.url,created_at:photo.created_at,watermarked:photo.watermarked})} onclick="openLightboxFromGrid(${idx})">
          <img src="${cldThumb(photo.url)}" loading="lazy" onerror="this.src=this.src.includes('/upload/l_')? this.src.replace(/\\/upload\\/[^/]+\\//,'/upload/') : this.src" />
          <div class="photo-zoom-hint">🔍 View</div>
          <div class="photo-badges">
            ${hasLiked  ? '<span class="badge liked">❤️</span>' : ''}
            ${hasBride  ? '<span class="badge bride">👰</span>' : ''}
            ${hasGroom  ? '<span class="badge groom">🤵</span>' : ''}
          </div>
        </div>
        <div class="photo-actions">
          <button class="action-btn ${hasLiked ? 'active-liked' : ''}" onclick="toggleSelection('${photo.id}', 'liked')">
            ${hasLiked ? '❤️ Liked' : '🤍 Like'}
          </button>
          <button class="action-btn ${hasBride ? 'active-bride' : ''}" onclick="toggleSelection('${photo.id}', 'bride')">
            ${hasBride ? '👰 In Bride Album' : '+ Bride Album'}
          </button>
          <button class="action-btn ${hasGroom ? 'active-groom' : ''}" onclick="toggleSelection('${photo.id}', 'groom')">
            ${hasGroom ? '🤵 In Groom Album' : '+ Groom Album'}
          </button>
        </div>
      </div>
    `;
  }).join('') + (filtered.length > photoGridVisibleCount ? `
    <button onclick="loadMorePhotoGrid()" style="grid-column:1/-1;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-btn);color:var(--text);padding:0.9rem;font-size:0.85rem;font-weight:500;cursor:pointer;margin-top:0.5rem;">
      Load more (${filtered.length - photoGridVisibleCount} remaining)
    </button>` : '');

  // Store current filtered photos for lightbox — keep the FULL list (not
  // just the visible page) so prev/next inside the lightbox still works
  // across photos that haven't been scrolled to yet.
  lbPhotos = filtered;
}

function loadMorePhotoGrid() {
  photoGridVisibleCount += PHOTO_GRID_PAGE_SIZE;
  renderPhotoGrid();
}

// Track pending (unsaved) selection state: { photoId: { liked: true/false/null, bride: ..., groom: ... } }
// null = no change, true = added, false = removed
let pendingSelections = {};
let selectionsDirty = false;

// Snapshot of selections at last save (to compute diff)
let savedSelectionsSnapshot = {};

function markSelectionsDirty() {
  selectionsDirty = true;
  const hint = document.getElementById('save-pending-hint');
  if (hint) hint.style.display = 'block';
}

function clearSelectionsDirty() {
  selectionsDirty = false;
  pendingSelections = {};
  savedSelectionsSnapshot = JSON.parse(JSON.stringify(selections));
  const hint = document.getElementById('save-pending-hint');
  if (hint) hint.style.display = 'none';
}

function toggleSelection(photoId, type) {
  photoId = String(photoId); const sel = selections[photoId] || [];
  const isSelected = sel.includes(type);
  if (!isSelected && (type === 'bride' || type === 'groom')) {
    const limit = type === 'bride' ? (window.clientBrideLimit || 250) : (window.clientGroomLimit || 250);
    const count = Object.values(selections).filter(s => s.includes(type)).length;
    if (count >= limit) { showToast(`${type === 'bride' ? 'Bride' : 'Groom'} Album is full (${limit})`); return; }
  }
  // Update local state immediately
  if (isSelected) {
    selections[photoId] = sel.filter(s => s !== type);
  } else {
    if (!selections[photoId]) selections[photoId] = [];
    selections[photoId].push(type);
  }
  updateCounters();
  refreshCard(photoId);
  updateLightboxFooter(photoId);
  const label = { liked: '❤️ Liked', bride: '👰 Added to Bride Album', groom: '🤵 Added to Groom Album', custom1: `📁 Added to ${customFolder1Name}`, custom2: `📂 Added to ${customFolder2Name}` };
  const removeLabel = { liked: 'Removed from Liked', bride: 'Removed from Bride', groom: 'Removed from Groom', custom1: `Removed from ${customFolder1Name}`, custom2: `Removed from ${customFolder2Name}` };
  showToast(isSelected ? removeLabel[type] : label[type]);
  markSelectionsDirty();
}

async function saveAllSelections() {
  const btn = document.getElementById('save-selections-btn');
  if (btn) { btn.textContent = '⏳ Saving...'; btn.disabled = true; }
  try {
    const snapshot = savedSelectionsSnapshot;
    const types = ['liked', 'bride', 'groom'];
    const toAdd = [];
    const toDelete = [];

    // Compare current selections vs snapshot to find what changed
    const allPhotoIds = new Set([...Object.keys(selections), ...Object.keys(snapshot)]);
    for (const photoId of allPhotoIds) {
      const nowSel = selections[photoId] || [];
      const wasSel = snapshot[photoId] || [];
      for (const t of types) {
        const inNow = nowSel.includes(t);
        const inWas = wasSel.includes(t);
        if (inNow && !inWas) toAdd.push({ photo_id: photoId, selection_type: t });
        if (!inNow && inWas) toDelete.push({ photo_id: photoId, selection_type: t });
      }
    }

    // Execute deletes
    for (const d of toDelete) {
      await sbFetch(`selections?project_id=eq.${currentProject.id}&photo_id=eq.${d.photo_id}&selection_type=eq.${d.selection_type}`, { method: 'DELETE', prefer: 'return=minimal' });
    }
    // Execute inserts
    for (const a of toAdd) {
      await sbFetch('selections', { method: 'POST', body: JSON.stringify({ project_id: currentProject.id, photo_id: a.photo_id, selection_type: a.selection_type }) });
    }

    clearSelectionsDirty();
    const total = toAdd.length + toDelete.length;
    showToast(`✅ Selections saved! (${total} change${total !== 1 ? 's' : ''} sent to studio)`);
  } catch(e) {
    console.error('saveAllSelections failed:', e);
    showToast('⚠️ Save failed — please check your connection and try again');
  } finally {
    if (btn) { btn.textContent = '💾 Save Selections'; btn.disabled = false; }
  }
}

function refreshCard(photoId) {
  const card = document.getElementById(`card-${photoId}`);
  if (!card) return;
  const sel      = selections[photoId] || [];
  const hasLiked  = sel.includes('liked');
  const hasBride  = sel.includes('bride');
  const hasGroom  = sel.includes('groom');
  const borderClass = hasLiked ? 'selected-liked' : hasBride ? 'selected-bride' : hasGroom ? 'selected-groom' : '';
  card.className = `photo-card ${borderClass}`;
  card.querySelector('.photo-badges').innerHTML =
    `${hasLiked ? '<span class="badge liked">❤️</span>' : ''}
     ${hasBride ? '<span class="badge bride">👰</span>' : ''}
     ${hasGroom ? '<span class="badge groom">🤵</span>' : ''}`;
  const btns = card.querySelectorAll('.action-btn');
  const states = [
    { active: hasLiked,  cls: 'active-liked',  on: `❤️ Liked`, off: `🤍 Like` },
    { active: hasBride,  cls: 'active-bride',  on: `👰 In Bride Album`, off: `+ Bride Album` },
    { active: hasGroom,  cls: 'active-groom',  on: `🤵 In Groom Album`, off: `+ Groom Album` },
  ];
  states.forEach((s, i) => {
    if (!btns[i]) return;
    btns[i].className = `action-btn ${s.active ? s.cls : ''}`;
    btns[i].textContent = s.active ? s.on : s.off;
  });
}

async function removeFromSelection(photoId, type) {
  try {
    await sbFetch(`selections?project_id=eq.${currentProject.id}&photo_id=eq.${photoId}&selection_type=eq.${type}`, { method: 'DELETE', prefer: 'return=minimal' });
    if (selections[photoId]) selections[photoId] = selections[photoId].filter(s => s !== type);
    updateCounters();
    refreshCard(photoId);
    const card = document.getElementById(`sel-card-${type}-${photoId}`);
    if (card) card.remove();
    showToast('Removed from selection');
  } catch(e) { showToast('Error removing. Try again.'); }
}

// ══════════════════════════════════════════

//  CLIENT: MY SELECTIONS
// ══════════════════════════════════════════
let selectionEditMode = false;
let clientSelSelectedIds = {}; // { 'liked': Set, 'bride': Set, 'groom': Set }

function toggleSelectionEditMode() {
  selectionEditMode = !selectionEditMode;
  const btn = document.getElementById('sel-edit-toggle');
  if (btn) btn.textContent = selectionEditMode ? '✅ Done' : '✏️ Edit & Delete';
  clientSelSelectedIds = {};
  renderClientSelections();
}

function renderClientSelections() {
  const el = document.getElementById('client-selections-view');
  const brideLimit = window.clientBrideLimit || 250;
  const groomLimit = window.clientGroomLimit || 250;
  const byType = { liked: [], bride: [], groom: [] };
  Object.entries(selections).forEach(([photoId, types]) => {
    const photo = allPhotos.find(p => String(p.id) === String(photoId));
    if (!photo) return;
    types.forEach(t => { if (byType[t]) byType[t].push(photo); });
  });
  const sections = [
    { key: 'liked', label: '❤️ Liked Photos', count: `${byType.liked.length} photos` },
    { key: 'bride', label: '👰 Bride Album',   count: `${byType.bride.length} / ${brideLimit}` },
    { key: 'groom', label: '🤵 Groom Album',   count: `${byType.groom.length} / ${groomLimit}` },
  ];

  el.innerHTML = sections.map(s => {
    const photos = byType[s.key];
    if (!clientSelSelectedIds[s.key]) clientSelSelectedIds[s.key] = new Set();

    const toolbarHtml = photos.length ? `
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.65rem;padding:0.5rem 0.6rem;background:rgba(212,175,55,0.05);border:1px solid var(--border);border-radius:8px;">
        ${selectionEditMode ? `
          <label style="display:flex;align-items:center;gap:0.35rem;cursor:pointer;font-size:0.78rem;">
            <input type="checkbox" id="chk-all-${s.key}" onchange="clientSelToggleAll('${s.key}',this.checked)" style="accent-color:var(--theme-accent, var(--gold));" />
            Select All
          </label>
          <span id="sel-count-${s.key}" style="font-size:0.72rem;color:var(--soft-gray);">0 selected</span>
          <button class="btn-danger-solid" onclick="clientSelDeleteSelected('${s.key}')" style="margin-left:auto;"><i class="ri-delete-bin-line icon-inline"></i> Delete Selected</button>
        ` : ''}
        <button onclick="downloadAllSelections('${s.key}')" style="background:var(--theme-glow, rgba(212,175,55,0.12));border:1px solid var(--theme-accent, var(--gold));border-radius:6px;color:var(--theme-accent, var(--gold));font-size:0.72rem;padding:0.28rem 0.65rem;cursor:pointer;${selectionEditMode ? '' : 'margin-left:auto;'}"><i class="ri-download-2-line icon-inline"></i> Download All</button>
      </div>` : '';

    // Store photos globally for lightbox access by type
    window._clientSelPhotos = window._clientSelPhotos || {};
    window._clientSelPhotos[s.key] = photos;

    const gridHtml = photos.length === 0
      ? `<div class="empty-state"><div class="empty-icon"><i class="ri-inbox-line"></i></div><p>No photos here yet</p></div>`
      : `<div class="photo-grid">${photos.map((photo, idx) => `
          <div class="photo-card" id="sel-card-${s.key}-${photo.id}" style="position:relative;">
            ${selectionEditMode ? `
            <label style="position:absolute;top:0.4rem;left:0.4rem;z-index:3;cursor:pointer;">
              <input type="checkbox" class="client-sel-chk-${s.key}" data-id="${photo.id}" onchange="clientSelOnCheck('${s.key}','${photo.id}',this.checked)" style="width:18px;height:18px;accent-color:var(--theme-accent, var(--gold));" />
            </label>` : ''}
            <div class="photo-img-wrap" ${pmAttr({id:photo.id,category:photo.category,url:photo.url,created_at:photo.created_at,watermarked:photo.watermarked})} onclick="openClientSelLightbox('${s.key}', ${idx})">
              <img src="${cldThumb(photo.url)}" loading="lazy" />
              <div class="photo-zoom-hint">🔍 View</div>
            </div>
            <div style="padding:0.35rem 0.5rem 0;">
              <span class="category-badge">${photo.category}</span>
            </div>
            <div style="padding:0.3rem 0.5rem 0.5rem;display:flex;gap:0.3rem;">
              <button onclick="downloadSinglePhoto('${photo.url}','${photo.id}')" style="flex:1;background:var(--theme-glow, rgba(212,175,55,0.1));border:1px solid var(--theme-accent, rgba(212,175,55,0.4));border-radius:6px;color:var(--theme-accent, var(--gold));font-size:0.65rem;padding:0.28rem;cursor:pointer;"><i class="ri-download-2-line"></i></button>
              ${selectionEditMode ? `<button class="btn-danger" style="flex:1;font-size:0.65rem;padding:0.28rem;" onclick="removeFromSelection('${photo.id}','${s.key}')"><i class="ri-close-circle-line icon-inline"></i> Remove</button>` : ''}
            </div>
          </div>`).join('')}
        </div>`;

    return `
      <div class="selection-section">
        <div class="selection-header">
          <div class="selection-dot ${s.key}"></div>
          <div class="selection-title">${s.label}</div>
          <div class="selection-count">${s.count}</div>
        </div>
        ${toolbarHtml}
        ${gridHtml}
      </div>`;
  }).join('');
}

function openClientSelLightbox(type, idx) {
  const photos = (window._clientSelPhotos && window._clientSelPhotos[type]) || [];
  if (!photos.length) return;
  const labelMap = { liked: '❤️ Liked Photos', bride: '👰 Bride Album', groom: '🤵 Groom Album' };
  openLightboxFull(photos.map(p => ({ url: p.url, id: p.id, category: p.category })), idx, labelMap[type] || type, photos[idx]?.id || null);
}

function clientSelOnCheck(type, photoId, checked) {
  if (!clientSelSelectedIds[type]) clientSelSelectedIds[type] = new Set();
  if (checked) clientSelSelectedIds[type].add(photoId);
  else clientSelSelectedIds[type].delete(photoId);
  const countEl = document.getElementById(`sel-count-${type}`);
  if (countEl) countEl.textContent = `${clientSelSelectedIds[type].size} selected`;
}

function clientSelToggleAll(type, checked) {
  if (!clientSelSelectedIds[type]) clientSelSelectedIds[type] = new Set();
  document.querySelectorAll(`.client-sel-chk-${type}`).forEach(chk => {
    chk.checked = checked;
    const id = chk.getAttribute('data-id');
    if (checked) clientSelSelectedIds[type].add(id);
    else clientSelSelectedIds[type].delete(id);
  });
  const countEl = document.getElementById(`sel-count-${type}`);
  if (countEl) countEl.textContent = `${clientSelSelectedIds[type].size} selected`;
}

async function clientSelDeleteSelected(type) {
  const ids = clientSelSelectedIds[type];
  if (!ids || !ids.size) { showToast('Select at least one photo first'); return; }
  if (!confirm(`Remove ${ids.size} photo(s) from ${type === 'liked' ? 'Liked' : type === 'bride' ? 'Bride Album' : 'Groom Album'}?`)) return;
  let removed = 0;
  for (const photoId of ids) {
    try {
      await sbFetch(`selections?project_id=eq.${currentProject.id}&photo_id=eq.${photoId}&selection_type=eq.${type}`, { method: 'DELETE', prefer: 'return=minimal' });
      if (selections[photoId]) selections[photoId] = selections[photoId].filter(s => s !== type);
      const card = document.getElementById(`sel-card-${type}-${photoId}`);
      if (card) card.remove();
      removed++;
    } catch(e) {}
  }
  clientSelSelectedIds[type] = new Set();
  updateCounters();
  showToast(`✅ Removed ${removed} photo(s)`);
  renderClientSelections();
}

async function downloadSinglePhoto(url, photoId) {
  try {
    showToast('⬇️ Starting download…');
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `photo-${photoId || Date.now()}.jpg`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch(e) {
    // Fallback: open in new tab
    window.open(url, '_blank');
  }
}

async function downloadAllSelections(type) {
  const photos = [];
  Object.entries(selections).forEach(([photoId, types]) => {
    if (types.includes(type)) {
      const photo = allPhotos.find(p => String(p.id) === String(photoId));
      if (photo) photos.push(photo);
    }
  });
  if (!photos.length) { showToast('No photos to download'); return; }
  showToast(`⬇️ Downloading ${photos.length} photos… This may take a moment.`);
  let downloaded = 0;
  for (const photo of photos) {
    try {
      const res = await fetch(photo.url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${type}-${photo.id || downloaded}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
      downloaded++;
      // Small delay to avoid browser blocking multiple downloads
      await new Promise(r => setTimeout(r, 400));
    } catch(e) {
      window.open(photo.url, '_blank');
      await new Promise(r => setTimeout(r, 400));
    }
  }
  showToast(`✅ Downloaded ${downloaded} photo(s)`);
}

// ══════════════════════════════════════════
