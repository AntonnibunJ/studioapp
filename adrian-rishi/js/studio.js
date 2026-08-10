//  STUDIO SETTINGS
// ══════════════════════════════════════════
async function handleStudioLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const url = await uploadToCloudinary(file, `studio-logos/${currentStudio.code}`);
  if (url) {
    try {
      await sbFetch(`studios?code=eq.${encodeURIComponent(currentStudio.code)}`, {
        method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ logo_url: url })
      });
      studiosDB[currentStudio.code].logoUrl = url;
      currentStudio.logoUrl = url;
      saveSession();
      const prev = document.getElementById('studio-logo-preview');
      prev.src = url; prev.style.display = 'block';
      document.getElementById('studio-logo-placeholder').style.display = 'none';
      document.getElementById('app-logo-display').innerHTML = `<img class="header-logo-img" src="${url}" />`;
      showToast('✅ Logo saved!');
    } catch(e) { showToast('Error saving logo: ' + e.message); }
  }
}

async function saveStudioSettings() {
  const displayName = document.getElementById('studio-display-name').value.trim();
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(currentStudio.code)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ display_name: displayName })
    });
    studiosDB[currentStudio.code].displayName = displayName;
    currentStudio.displayName = displayName;
    saveSession();
    document.getElementById('app-brand-name').textContent = displayName || currentStudio.name;
    showToast('✅ Studio branding saved!');
  } catch(e) { showToast('Error saving: ' + e.message); }
}

// ══════════════════════════════════════════

//  PROJECTS (STUDIO)
// ══════════════════════════════════════════
async function loadProjects() {
  try {
    // Filter projects by current studio's code so each studio sees only their own
    projects = await sbFetch(`wedding_projects?select=*&studio_code=eq.${encodeURIComponent(currentStudio.code)}&order=created_at.desc`);
    renderProjects();
  } catch(e) {
    document.getElementById('project-list').innerHTML = '<p style="color:red;font-size:0.8rem;">Error loading projects.</p>';
  }
}

// Shows/hides the free-text input when "Other (Custom)" is chosen in a
// Function Category dropdown, and returns the effective category value
// (the custom text if "Other" was picked, otherwise the select's value).
function toggleCustomCategoryInput(selectId, customInputId) {
  const sel = document.getElementById(selectId);
  const custom = document.getElementById(customInputId);
  custom.style.display = sel.value === 'Other' ? 'block' : 'none';
}
function getFunctionCategoryValue(selectId, customInputId) {
  const sel = document.getElementById(selectId).value;
  if (sel === 'Other') return document.getElementById(customInputId).value.trim();
  return sel;
}

function renderProjects() {
  const el = document.getElementById('project-list');
  if (!projects.length) {
    el.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No projects yet. Create one above!</p>';
    return;
  }
  const baseUrl = window.location.origin + window.location.pathname;
  el.innerHTML = projects.map(p => {
    const date = p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '';
    const weddingDate = p.wedding_date ? new Date(p.wedding_date).toLocaleDateString('en-IN') : '';
    const weddingPlace = p.wedding_place || '';
    const category = p.function_category || '';
    const clientLink = `${baseUrl}?client=${p.client_code}`;
    return `
    <div style="background:var(--cream);border:1px solid var(--border);border-radius:10px;margin-bottom:0.65rem;overflow:hidden;">
      <div style="padding:0.9rem 1rem;display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
        <div style="flex:1;min-width:0;">
          <div class="project-name">${p.name}${category ? ` <span style="display:inline-block;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--platform);background:rgba(191,161,74,0.12);border:1px solid rgba(191,161,74,0.3);border-radius:20px;padding:0.15rem 0.6rem;margin-left:0.4rem;vertical-align:middle;">${category}</span>` : ''}</div>
          <div class="project-meta">Code: <strong>${p.client_code}</strong>${weddingDate ? ' · Wedding: ' + weddingDate : ''}${weddingPlace ? ' · ' + weddingPlace : ''} · Added: ${date}</div>
        </div>
        <div style="display:flex;gap:0.4rem;flex-shrink:0;">
          <button class="btn-small" onclick="toggleProjectDetail('pd-${p.id}')">▾ Details</button>
          <button class="btn-danger" onclick="deleteProject('${p.id}')">✕</button>
        </div>
      </div>
      <div id="pd-${p.id}" style="display:none;border-top:1px solid var(--border);padding:0.85rem 1rem;background:white;">
        <div style="font-size:0.78rem;color:var(--soft-gray);margin-bottom:0.6rem;">📎 Client link (share this):</div>
        <div style="font-family:monospace;font-size:0.72rem;word-break:break-all;color:var(--success);margin-bottom:0.5rem;">${clientLink}</div>
        <div style="font-size:0.78rem;color:var(--soft-gray);margin-bottom:0.8rem;">🔑 Access Code: <strong>${p.client_code}</strong> — give this to the client separately</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button class="btn-small" onclick="copyProjectLinkById('${clientLink}')" style="background:var(--success);">📋 Copy Link</button>
          <button class="btn-small" onclick="ownerViewProject('${p.id}')">👁 View Picks</button>
          <button class="btn-small" style="background:var(--platform);" onclick="openEditProjectInline('${p.id}')">✏️ Edit</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleProjectDetail(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function copyProjectLinkById(link) {
  navigator.clipboard.writeText(link).then(() => showToast('✅ Client link copied!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('✅ Link copied!');
  });
}

function openEditProjectInline(id) {
  const p = projects.find(pr => String(pr.id) === String(id));
  if (!p) { showToast('Project not found'); return; }
  document.getElementById('edit-project-id').value = p.id;
  document.getElementById('edit-project-name').value = p.name || '';
  const catSel = document.getElementById('edit-project-category');
  const catCustom = document.getElementById('edit-project-category-custom');
  const knownCategories = Array.from(catSel.options).map(o => o.value);
  const cat = p.function_category || '';
  if (cat && !knownCategories.includes(cat)) {
    catSel.value = 'Other';
    catCustom.value = cat;
    catCustom.style.display = 'block';
  } else {
    catSel.value = cat;
    catCustom.value = '';
    catCustom.style.display = 'none';
  }
  document.getElementById('edit-project-date').value = p.wedding_date || '';
  document.getElementById('edit-project-place').value = p.wedding_place || '';
  document.getElementById('edit-project-code').value = p.client_code || '';
  document.getElementById('edit-project-bride-limit').value = p.bride_limit || 250;
  document.getElementById('edit-project-groom-limit').value = p.groom_limit || 250;
  document.getElementById('edit-couple-photo-url').value = p.couple_photo_url || '';
  const prev = document.getElementById('edit-couple-photo-preview');
  const ph   = document.getElementById('edit-couple-photo-placeholder');
  if (p.couple_photo_url) {
    prev.src = p.couple_photo_url; prev.style.display = 'block'; ph.style.display = 'none';
  } else {
    prev.style.display = 'none'; ph.style.display = 'block';
  }
  const panel = document.getElementById('project-edit-inline');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior:'smooth' });
}

async function saveEditProject() {
  const id     = document.getElementById('edit-project-id').value;
  const name   = document.getElementById('edit-project-name').value.trim();
  const category = getFunctionCategoryValue('edit-project-category','edit-project-category-custom');
  const wdate  = document.getElementById('edit-project-date').value;
  const wplace = document.getElementById('edit-project-place').value.trim();
  const code   = document.getElementById('edit-project-code').value.trim().toUpperCase();
  const brideLimit = parseInt(document.getElementById('edit-project-bride-limit').value) || 250;
  const groomLimit = parseInt(document.getElementById('edit-project-groom-limit').value) || 250;
  const couplePhotoUrl = document.getElementById('edit-couple-photo-url').value || '';
  if (!name)  { showToast('Project name cannot be empty'); return; }
  if (!code)  { showToast('Client access code cannot be empty'); return; }
  if (!category) { showToast('Please select a Function Category'); return; }
  try {
    // This updates the project for BOTH the studio owner's view and the client's
    // login/session, since both read live from the same wedding_projects row.
    await sbFetch(`wedding_projects?id=eq.${id}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({
        name,
        function_category: category,
        wedding_date: wdate || null,
        wedding_place: wplace || null,
        client_code: code,
        bride_limit: brideLimit,
        groom_limit: groomLimit,
        couple_photo_url: couplePhotoUrl
      })
    });
    showToast('✅ Project updated!');
    document.getElementById('project-edit-inline').style.display = 'none';
    loadProjects();
  } catch(e) {
    showToast('Error updating project: ' + (e.message || 'Access code may already be in use'));
  }
}

async function createProject() {
  if (!requireActiveSubscription('Creating a new project')) return;
  const name   = document.getElementById('project-name').value.trim();
  const code   = document.getElementById('project-code').value.trim().toUpperCase();
  const category = getFunctionCategoryValue('project-category','project-category-custom');
  const wdate  = document.getElementById('project-date').value;
  const wplace = document.getElementById('project-place').value.trim();
  const brideLimit = parseInt(document.getElementById('project-bride-limit').value) || 250;
  const groomLimit = parseInt(document.getElementById('project-groom-limit').value) || 250;
  const couplePhotoUrl = document.getElementById('couple-photo-url').value || '';
  if (!name || !code) { showToast('Please fill in name and access code'); return; }
  if (!category) { showToast('Please select a Function Category'); return; }
  try {
    await sbFetch('wedding_projects', {
      method: 'POST',
      body: JSON.stringify({
        name, client_code: code,
        studio_code: currentStudio.code,
        function_category: category,
        wedding_date: wdate || null,
        wedding_place: wplace || null,
        bride_limit: brideLimit,
        groom_limit: groomLimit,
        couple_photo_url: couplePhotoUrl
      })
    });
    document.getElementById('project-name').value = '';
    document.getElementById('project-code').value = '';
    document.getElementById('project-date').value = '';
    document.getElementById('project-category').value = '';
    document.getElementById('project-category-custom').value = '';
    document.getElementById('project-category-custom').style.display = 'none';
    document.getElementById('project-place').value = '';
    document.getElementById('project-bride-limit').value = '250';
    document.getElementById('project-groom-limit').value = '250';
    document.getElementById('couple-photo-url').value = '';
    document.getElementById('couple-photo-preview').style.display = 'none';
    document.getElementById('couple-photo-placeholder').style.display = 'block';
    showToast('✅ Project created!');
    // Show client link
    const baseUrl = window.location.origin + window.location.pathname;
    const clientLink = `${baseUrl}?client=${code}`;
    document.getElementById('project-link-text').textContent = clientLink;
    document.getElementById('project-code-display').textContent = code;
    document.getElementById('project-link-result').style.display = 'block';
    window._lastProjectLink = clientLink;
    loadProjects();
  } catch(e) {
    showToast('Error: Code may already exist');
  }
}

function copyProjectLink() {
  const link = window._lastProjectLink || '';
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => showToast('✅ Client link copied!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('✅ Link copied!');
  });
}

async function deleteProject(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  try {
    // Delete associated selections first (to avoid FK constraint errors)
    try { await sbFetch(`selections?project_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch(e) {}
    // Delete associated photos
    try { await sbFetch(`photos?project_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch(e) {}
    // Now delete the project
    await sbFetch(`wedding_projects?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    showToast('Project deleted');
    loadProjects();
  } catch(e) {
    showToast('Error deleting project: ' + (e.message || 'Please try again'));
  }
}

function populateUploadProjects() {
  const sel = document.getElementById('upload-project');
  sel.innerHTML = '<option value="">— Choose a project —</option>' +
    projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  renderCategoryDatalist();
}

// Free-form category history: any category name a studio owner has ever typed
// is remembered (per studio) so it resurfaces as an autocomplete suggestion —
// but nothing is enforced, so the owner can always type a brand-new one
// (maternity, baby shower, memorial, corporate event, anything).
function categoryHistoryKey() {
  return `categoryHistory:${currentStudio?.code || 'default'}`;
}

function loadKnownCategories() {
  try {
    const raw = localStorage.getItem(categoryHistoryKey());
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function addKnownCategory(cat) {
  if (!cat) return;
  const list = loadKnownCategories();
  if (!list.includes(cat)) {
    list.unshift(cat);
    try { localStorage.setItem(categoryHistoryKey(), JSON.stringify(list.slice(0, 50))); } catch (e) {}
  }
  renderCategoryDatalist();
}

function renderCategoryDatalist() {
  const dl = document.getElementById('upload-category-list');
  if (!dl) return;
  dl.innerHTML = loadKnownCategories().map(c => `<option value="${c.replace(/"/g, '&quot;')}"></option>`).join('');
}

function populateViewProjects() {
  const sel = document.getElementById('view-project');
  sel.innerHTML = '<option value="">— Choose a project —</option>' +
    projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function ownerViewProject(projectId) {
  // Switch to selections tab
  const tabs = document.querySelectorAll('#panel-studio .main-tab');
  tabs.forEach(t => t.classList.remove('active'));
  tabs[2].classList.add('active');
  document.querySelectorAll('#panel-studio .tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('stab-selections').classList.add('active');
  populateViewProjects();
  document.getElementById('view-project').value = projectId;
  loadOwnerSelections();
}

// ══════════════════════════════════════════

//  COUPLE PHOTO HANDLER
// ══════════════════════════════════════════
async function handleCouplePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  showToast('Uploading couple photo...');
  const url = await uploadToCloudinary(file, `couple-photos/${currentStudio.code}`);
  if (url) {
    document.getElementById('couple-photo-url').value = url;
    const prev = document.getElementById('couple-photo-preview');
    prev.src = url; prev.style.display = 'block';
    document.getElementById('couple-photo-placeholder').style.display = 'none';
    showToast('✅ Couple photo uploaded!');
  } else {
    showToast('Error uploading couple photo');
  }
}

async function handleEditCouplePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  showToast('Uploading couple photo...');
  const url = await uploadToCloudinary(file, `couple-photos/${currentStudio.code}`);
  if (url) {
    document.getElementById('edit-couple-photo-url').value = url;
    const prev = document.getElementById('edit-couple-photo-preview');
    prev.src = url; prev.style.display = 'block';
    document.getElementById('edit-couple-photo-placeholder').style.display = 'none';
    showToast('✅ Couple photo uploaded!');
  } else {
    showToast('Error uploading couple photo');
  }
}

// ══════════════════════════════════════════

//  STUDIO: SAVE CUSTOM FOLDERS (single)
// ══════════════════════════════════════════
async function saveCustomFolders() {
  const f1 = document.getElementById('custom-folder-1').value.trim() || 'Custom Folder 1';
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(currentStudio.code)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ custom_folder1: f1 })
    });
    studiosDB[currentStudio.code].customFolder1 = f1;
    currentStudio.customFolder1 = f1;
    saveSession();
    customFolder1Name = f1;
    const opt1 = document.getElementById('upload-cat-custom1');
    if(opt1) opt1.textContent = f1;
    showToast('✅ Folder name saved!');
  } catch(e) { showToast('Error saving folder: ' + e.message); }
}

// ══════════════════════════════════════════

//  STUDIO: LOAD SETTINGS FORM (with watermark)
// ══════════════════════════════════════════
function loadStudioSettings_form() {
  document.getElementById('studio-display-name').value = currentStudio.displayName || '';
  document.getElementById('custom-folder-1').value = currentStudio.customFolder1 || 'Custom Folder 1';
  renderStudioSubscriptionCard();
  if (currentStudio.logoUrl) {
    document.getElementById('studio-logo-preview').src = currentStudio.logoUrl;
    document.getElementById('studio-logo-preview').style.display = 'block';
    document.getElementById('studio-logo-placeholder').style.display = 'none';
  }
  if (currentStudio.watermarkUrl) {
    const prev = document.getElementById('watermark-preview');
    if (prev) { prev.src = currentStudio.watermarkUrl; prev.style.display = 'block'; }
    const ph = document.getElementById('watermark-placeholder');
    if (ph) ph.style.display = 'none';
    const wmUrl = document.getElementById('watermark-url');
    if (wmUrl) wmUrl.value = currentStudio.watermarkUrl;
    const st = document.getElementById('watermark-status');
    if (st) st.textContent = '✅ Watermark image loaded';
  }
  renderPlatformAdminContactCard();
}

// Shows the Platform Admin's own name/logo/contact in the studio's "My Studio" storage card,
// instead of a hardcoded name — keeps it accurate if the platform admin rebrands.
function renderPlatformAdminContactCard() {
  const nameEl = document.getElementById('platform-admin-contact-name');
  const logoEl = document.getElementById('platform-admin-contact-logo');
  const waEl   = document.getElementById('platform-admin-contact-whatsapp');
  const emEl   = document.getElementById('platform-admin-contact-email');
  if (!nameEl) return;
  nameEl.textContent = platformName || 'Platform Admin';
  logoEl.innerHTML = platformLogoUrl
    ? `<img src="${platformLogoUrl}" style="width:100%;height:100%;object-fit:cover;" />`
    : '✦';
  const wa = PLATFORM_WHATSAPP;
  const em = PLATFORM_EMAIL;
  waEl.href = `https://wa.me/${wa.replace(/[^\d]/g,'')}`;
  waEl.querySelector('span:nth-child(2)').textContent = wa;
  emEl.href = `mailto:${em}`;
  emEl.querySelector('span:nth-child(2)').textContent = em;
}


// ══════════════════════════════════════════
