//  NAVIGATION
// ══════════════════════════════════════════
function gotoHub() {
  hideAllScreens();
  document.getElementById('screen-platform-login').classList.add('active');
}

function gotoLogin(role) {
  hideAllScreens();
  document.getElementById(`screen-${role}-login`).classList.add('active');
}

function hideAllScreens() {
  ['screen-platform-login','screen-studio-login','screen-client-login','screen-app']
    .forEach(id => { const el = document.getElementById(id); if(el) el.classList.remove('active'); if(el) el.style.display = ''; });
  ['screen-platform-login','screen-studio-login','screen-client-login'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
}

// ══════════════════════════════════════════

//  TAB SWITCHING
// ══════════════════════════════════════════
function showTab(panel, name) {
  const prefix = { platform: 'ptab', studio: 'stab', client: 'ctab' }[panel];
  const tabsEl = document.getElementById(`panel-${panel}`);
  tabsEl.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  tabsEl.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active', 'platform-active'));
  document.getElementById(`${prefix}-${name}`).classList.add('active');
  event.target.classList.add(panel === 'platform' ? 'platform-active' : 'active');

  if (panel === 'studio' && name === 'upload') populateUploadProjects();
  if (panel === 'studio' && name === 'photos') { populateStudioPhotosProjects(); loadStudioPhotoCategories(); }
  if (panel === 'studio' && name === 'selections') populateViewProjects();
  if (panel === 'studio' && name === 'settings') { loadStudioSettings_form(); loadStudioContact_form(); }
  if (panel === 'studio' && name === 'subscription') renderStudioSubscriptionCard();
  if (panel === 'studio' && name === 'enquiry') loadEnquiryPackages();
  if (panel === 'client' && name === 'selections') { loadSelectionsData().then(() => renderClientSelections()); }
  if (panel === 'client' && name === 'upload') loadClientOwnPhotos();
  if (panel === 'platform' && name === 'studios') { loadStudiosList(); loadPlatformStudiosStats(); }
  if (panel === 'platform' && name === 'plans') { renderPlanManagerList(); }
}

function highlightTabByName(tabName) {
  // Helper to highlight tab after programmatic navigation
  document.querySelectorAll('#panel-platform .main-tab').forEach(t => {
    t.classList.remove('active', 'platform-active');
    if (t.textContent.trim() === tabName) t.classList.add('platform-active');
  });
}

// ══════════════════════════════════════════
