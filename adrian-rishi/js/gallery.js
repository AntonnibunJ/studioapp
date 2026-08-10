//  STUDIO: VIEW & DELETE UPLOADED PHOTOS
// ══════════════════════════════════════════
// ══════════════════════════════════════════

//  UPLOAD (STUDIO)
// ══════════════════════════════════════════

async function deleteStudioPhoto(photoId) {
  if (!confirm('Remove this photo? This cannot be undone.')) return;
  try {
    await sbFetch(`photos?id=eq.${photoId}`, { method: 'DELETE', prefer: 'return=minimal' });
    showToast('Photo removed');
    const card = document.getElementById(`studio-card-${photoId}`);
    if (card) card.remove();
    // Also remove from studioActiveCatPhotos array
    studioActiveCatPhotos = studioActiveCatPhotos.filter(p => p.id !== photoId);
  } catch(e) { showToast('Error removing photo'); }
}

async function removeAllCategoryPhotos(cat, count) {
  if (!confirm(`Remove all ${count} photo(s) from "${cat}"? This cannot be undone.`)) return;
  const photos = window._studioCatPhotosMap?.[cat] || [];
  if (!photos.length) { showToast('No photos found in this category'); return; }
  showToast(`Removing ${photos.length} photos…`);
  let removed = 0;
  for (const p of photos) {
    try {
      await sbFetch(`photos?id=eq.${p.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      removed++;
    } catch(e) { console.error('Error removing photo', p.id, e); }
  }
  showToast(`✅ Removed ${removed} photo(s) from "${cat}"`);
  loadStudioPhotoCategories();
}

// ══════════════════════════════════════════

//  STUDIO: CATEGORY GRID VIEW (My Photos)
// ══════════════════════════════════════════
let studioActiveCat = null;
let studioActiveCatPhotos = [];

function populateStudioPhotosProjects() {
  const sel = document.getElementById('studio-photos-project');
  if (!sel) return;
  sel.innerHTML = '<option value="">— All Projects —</option>' +
    projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

async function loadStudioPhotoCategories() {
  const el = document.getElementById('studio-cat-grid');
  const projectId = document.getElementById('studio-photos-project')?.value || '';
  if (el) el.innerHTML = '<div class="loading" style="grid-column:1/-1"><div class="spinner"></div>Loading...</div>';
  // Close expanded view
  closeStudioCatView();
  try {
    let query = `photos?select=*&order=created_at.desc&studio_code=eq.${encodeURIComponent(currentStudio.code)}`;
    if (projectId) query += `&project_id=eq.${projectId}`;
    const data = await sbFetch(query);
    if (!el) return;
    if (!data.length) {
      el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--soft-gray);"><div style="font-size:2rem;margin-bottom:0.5rem;">📷</div><p style="font-size:0.82rem;">No photos uploaded yet</p></div>';
      return;
    }
    // Group by category
    const catMap = {};
    data.forEach(p => {
      if (!catMap[p.category]) catMap[p.category] = [];
      catMap[p.category].push(p);
    });
    const catIcons = {
      'Pottu Function': '🌸', 'Wedding Photos': '💒', 'Reception Photos': '🎉',
      'Bride-seeing Ceremony': '👁', 'Haldi': '💛', 'Bride to Be': '👰',
      'Post Wedding': '🌅', 'Pre Wedding': '💑', 'Post-Wedding Homecoming': '🏠'
    };
    // Store photo data in a global map to avoid inline JSON escaping issues
    window._studioCatPhotosMap = {};
    el.innerHTML = Object.entries(catMap).map(([cat, photos]) => {
      const icon = catIcons[cat] || '📁';
      const thumb = cldThumb(photos[0]?.url) || '';
      const safeKey = encodeURIComponent(cat);
      window._studioCatPhotosMap[cat] = photos;
      return `
        <div style="position:relative;">
          <div onclick="openStudioCategory('${cat.replace(/'/g, "\\'")}', null)" style="
            background:white;border:1px solid var(--border);border-radius:12px;overflow:hidden;
            cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.06);"
            onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
            <div style="aspect-ratio:4/3;overflow:hidden;background:#f0ece6;position:relative;">
              ${thumb ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;">${icon}</div>`}
              <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(0,0,0,0.5));"></div>
              <div style="position:absolute;bottom:0.5rem;left:0.75rem;color:white;font-size:0.72rem;font-weight:500;">${photos.length} photos</div>
            </div>
            <div style="padding:0.65rem 0.75rem;">
              <div style="font-size:0.88rem;font-weight:500;color:var(--charcoal);">${icon} ${cat}</div>
            </div>
          </div>
          <button class="btn-danger-solid" onclick="event.stopPropagation();removeAllCategoryPhotos('${cat.replace(/'/g, "\\'")}',${photos.length})" style="
            position:absolute;top:0.45rem;right:0.45rem;
            padding:0.25rem 0.55rem;font-size:0.62rem;
            backdrop-filter:blur(4px);z-index:2;">
            <i class="ri-delete-bin-line icon-inline"></i> Remove All
          </button>
        </div>`;
    }).join('');
  } catch(e) {
    if (el) el.innerHTML = '<p style="color:red;font-size:0.8rem;grid-column:1/-1">Error loading photos.</p>';
  }
}

function openStudioCategory(cat, photosData) {
  studioActiveCat = cat;
  studioGridVisibleCount = STUDIO_GRID_PAGE_SIZE;
  // Use the global map if no photosData passed (avoids JSON serialization issues in onclick)
  if (!photosData && window._studioCatPhotosMap && window._studioCatPhotosMap[cat]) {
    studioActiveCatPhotos = window._studioCatPhotosMap[cat];
  } else {
    studioActiveCatPhotos = typeof photosData === 'string' ? JSON.parse(photosData) : (photosData || []);
  }
  document.getElementById('studio-cat-grid').style.display = 'none';
  document.getElementById('studio-cat-photos').style.display = 'block';
  document.getElementById('studio-cat-title').textContent = cat;
  // Remove old select bar if any
  const oldBar = document.getElementById('studio-select-bar');
  if (oldBar) oldBar.remove();
  renderStudioCatPhotosWithSelect(studioActiveCatPhotos);
}

function openStudioCatPhoto(index) {
  const photos = window._studioCurrentCatPhotos || [];
  if (!photos.length) return;
  const urls = photos.map(p => p.url);
  openLightbox(urls, index, studioActiveCat || '');
}

function closeStudioCatView() {
  const grid = document.getElementById('studio-cat-grid');
  const expanded = document.getElementById('studio-cat-photos');
  if (grid) grid.style.display = 'grid';
  if (expanded) expanded.style.display = 'none';
  studioActiveCat = null;
  studioActiveCatPhotos = [];
}

// ══════════════════════════════════════════

//  STUDIO OWNER: SELECT & DELETE PHOTOS IN CATEGORY
// ══════════════════════════════════════════
let studioSelectedPhotoIds = new Set();
const STUDIO_GRID_PAGE_SIZE = 60;
let studioGridVisibleCount = STUDIO_GRID_PAGE_SIZE;

function renderStudioCatPhotosWithSelect(photos) {
  studioSelectedPhotoIds = new Set();
  const grid = document.getElementById('studio-cat-photo-grid');
  if (!photos || !photos.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📷</div><p>No photos here</p></div>';
    return;
  }
  window._studioCurrentCatPhotos = photos;
  // Show select-all bar
  const catPhotosSection = document.getElementById('studio-cat-photos');
  let selBar = document.getElementById('studio-select-bar');
  if (!selBar) {
    selBar = document.createElement('div');
    selBar.id = 'studio-select-bar';
    selBar.style.cssText = 'display:flex;align-items:center;gap:0.65rem;padding:0.5rem 0.75rem;margin-bottom:0.5rem;background:rgba(212,175,55,0.06);border-radius:8px;border:1px solid var(--border);';
    catPhotosSection.insertBefore(selBar, grid);
  }
  selBar.innerHTML = `
    <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.8rem;">
      <input type="checkbox" id="studio-select-all-chk" onchange="toggleSelectAllCatPhotos(this.checked)" style="accent-color:var(--gold);" />
      Select All (${photos.length})
    </label>
    <span style="color:var(--soft-gray);font-size:0.75rem;" id="studio-sel-count">0 selected</span>
    <button class="btn-danger-solid" onclick="deleteSelectedStudioPhotos()" style="margin-left:auto;"><i class="ri-delete-bin-line icon-inline"></i> Delete Selected</button>`;

  const visible = photos.slice(0, studioGridVisibleCount);

  grid.innerHTML = visible.map((p, i) => `
    <div class="photo-card" id="studio-card-${p.id}" style="position:relative;">
      <label style="position:absolute;top:0.4rem;left:0.4rem;z-index:3;cursor:pointer;">
        <input type="checkbox" class="studio-photo-chk" data-id="${p.id}" ${studioSelectedPhotoIds.has(p.id) ? 'checked' : ''} onchange="onStudioPhotoCheck('${p.id}', this.checked)" style="width:18px;height:18px;accent-color:var(--gold);" />
      </label>
      <div class="photo-img-wrap" ${pmAttr({id:p.id,category:p.category,url:p.url,created_at:p.created_at,watermarked:p.watermarked})} onclick="openStudioCatPhoto(${i})">
        <img src="${cldThumb(p.url)}" loading="lazy" />
        <div class="photo-zoom-hint">🔍 View</div>
        ${p.watermarked ? `<div style="position:absolute;top:0.3rem;right:0.3rem;background:rgba(201,169,110,0.9);color:white;border-radius:4px;font-size:0.6rem;padding:0.15rem 0.3rem;">🔒 WM</div>` : ''}
      </div>
      <div style="padding:0 0.5rem 0.5rem;padding-top:0.35rem;">
        <button class="btn-danger" style="width:100%;font-size:0.7rem;padding:0.35rem;" onclick="deleteStudioPhoto('${p.id}')"><i class="ri-delete-bin-line icon-inline"></i> Remove</button>
      </div>
    </div>`).join('') + (photos.length > studioGridVisibleCount ? `
    <button onclick="loadMoreStudioGrid()" style="grid-column:1/-1;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-btn);color:var(--text);padding:0.9rem;font-size:0.85rem;font-weight:500;cursor:pointer;margin-top:0.5rem;">
      Load more (${photos.length - studioGridVisibleCount} remaining)
    </button>` : '');
}

function loadMoreStudioGrid() {
  studioGridVisibleCount += STUDIO_GRID_PAGE_SIZE;
  renderStudioCatPhotosWithSelect(window._studioCurrentCatPhotos || []);
}

function onStudioPhotoCheck(photoId, checked) {
  if (checked) studioSelectedPhotoIds.add(photoId);
  else studioSelectedPhotoIds.delete(photoId);
  updateStudioSelCount();
}

function toggleSelectAllCatPhotos(checked) {
  // Operate on the FULL dataset, not just the currently-rendered page, so
  // "Select All" + "Delete Selected" correctly affects every photo in the
  // category even if some haven't been scrolled into view yet.
  const photos = window._studioCurrentCatPhotos || [];
  if (checked) photos.forEach(p => studioSelectedPhotoIds.add(p.id));
  else studioSelectedPhotoIds.clear();
  document.querySelectorAll('.studio-photo-chk').forEach(chk => { chk.checked = checked; });
  updateStudioSelCount();
}

function updateStudioSelCount() {
  const el = document.getElementById('studio-sel-count');
  if (el) el.textContent = `${studioSelectedPhotoIds.size} selected`;
}

async function deleteSelectedStudioPhotos() {
  if (!studioSelectedPhotoIds.size) { showToast('Select at least one photo first'); return; }
  if (!confirm(`Delete ${studioSelectedPhotoIds.size} selected photo(s)? Cannot be undone.`)) return;
  let deleted = 0;
  for (const id of studioSelectedPhotoIds) {
    try {
      await sbFetch(`photos?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
      const card = document.getElementById(`studio-card-${id}`);
      if (card) card.remove();
      deleted++;
    } catch(e) {}
  }
  studioSelectedPhotoIds.clear();
  updateStudioSelCount();
  showToast(`✅ Deleted ${deleted} photo(s)`);
  // Refresh the category list in background
  if (window._studioCurrentCatPhotos) {
    window._studioCurrentCatPhotos = window._studioCurrentCatPhotos.filter(p => !studioSelectedPhotoIds.has(p.id));
  }
}

// ══════════════════════════════════════════
