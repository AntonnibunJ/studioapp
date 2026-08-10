//  LOCAL STORAGE HELPERS
// ══════════════════════════════════════════
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

async function loadPlatformSettings() {
  const s = lsGet('platform_settings');
  if (s) {
    PLATFORM_ADMIN_USER = DEFAULT_PLATFORM_ADMIN_USER;
    PLATFORM_ADMIN_PASS = DEFAULT_PLATFORM_ADMIN_PASS;
    platformName        = s.name || platformName;
    platformLogoUrl     = s.logoUrl || '';
  }
  applyPlatformBranding();
  await refreshStudiosDB();
  await refreshSubscriptionPlans();

  // ── Check URL params FIRST — they always take priority over saved session ──
  const params = new URLSearchParams(window.location.search);
  const studioParam = params.get('studio');
  const clientParam = params.get('client');
  const pkgParam    = params.get('pkg');

  if (pkgParam) {
    // Public package view — no login needed
    await loadPublicPackageView(pkgParam);
    return;
  } else if (clientParam) {
    // Client link — if this device already has a valid saved session for THIS
    // client (i.e. they're already signed in), restore it directly instead of
    // asking them to log in again. Only Sign Out clears this.
    const clientCode = clientParam.toUpperCase();
    const savedClientSession = JSON.parse(localStorage.getItem('app_session') || 'null');
    if (savedClientSession && savedClientSession.role === 'client' && savedClientSession.project &&
        String(savedClientSession.project.client_code || '').toUpperCase() === clientCode) {
      currentRole    = 'client';
      currentProject = savedClientSession.project;
      window.clientBrideLimit = currentProject.bride_limit || 250;
      window.clientGroomLimit = currentProject.groom_limit || 250;
      const sCode = currentProject.studio_code || '';
      currentStudio = (sCode && studiosDB[sCode]) ? { code: sCode, ...studiosDB[sCode] } : (savedClientSession.studio || null);
      enterApp();
      return;
    }
    // No matching saved session — show client login
    hideAllScreens();
    document.getElementById('client-code').value = clientCode;
    document.getElementById('screen-client-login').classList.add('active');
    previewClientLoginBranding(clientCode);
    return;
  } else if (studioParam) {
    // Studio link — if this device already has a valid saved session for THIS
    // studio (i.e. they're already signed in), restore it directly instead of
    // asking them to log in again. Only Sign Out clears this.
    const studioCode = studioParam.toUpperCase();
    const savedStudioSession = JSON.parse(localStorage.getItem('app_session') || 'null');
    if (savedStudioSession && savedStudioSession.role === 'studio' && savedStudioSession.studio &&
        String(savedStudioSession.studio.code || '').toUpperCase() === studioCode) {
      currentRole   = 'studio';
      currentStudio = savedStudioSession.studio;
      enterApp();
      return;
    }
    // No matching saved session — show studio login
    hideAllScreens();
    document.getElementById('studio-username').value = studioCode;
    document.getElementById('screen-studio-login').classList.add('active');
    document.getElementById('studio-login-sub').textContent = 'Studio Owner Portal';
    previewStudioLoginBranding(studioCode);
    return;
  }

  // ── No URL params — restore session for same device/browser ──
  const savedSession = JSON.parse(localStorage.getItem('app_session') || 'null');
  if (savedSession && savedSession.role) {
    currentRole    = savedSession.role;
    currentStudio  = savedSession.studio  || null;
    currentProject = savedSession.project || null;
    if (currentRole === 'client' && currentProject) {
      window.clientBrideLimit = currentProject.bride_limit || 250;
      window.clientGroomLimit = currentProject.groom_limit || 250;
      const studioCode = currentProject.studio_code || '';
      if (studioCode && studiosDB[studioCode]) {
        currentStudio = { code: studioCode, ...studiosDB[studioCode] };
      }
    }
    enterApp();
    return;
  }
}

function saveSession() {
  localStorage.setItem('app_session', JSON.stringify({
    role:    currentRole,
    studio:  currentStudio,
    project: currentProject
  }));
}

async function refreshStudiosDB() {
  try {
    const rows = await sbFetch('studios?select=*');
    const studioFlags = lsGet('platform_studio_flags') || {};
    studiosDB = {};
    rows.forEach(r => {
      const flags = studioFlags[r.code] || {};
      studiosDB[r.code] = {
        name:          r.code,
        displayName:   r.display_name || r.code,
        password:      r.password,
        storagePlan:   r.storage_plan  || '25GB',
        logoUrl:       r.logo_url      || '',
        watermarkUrl:  r.watermark_url || '',
        customFolder1: r.custom_folder1 || 'Custom Folder 1',
        whatsapp:      r.whatsapp      || PLATFORM_WHATSAPP,
        address:       r.address       || '',
        email:         r.email         || PLATFORM_EMAIL,
        enableEnquiry: r.enable_enquiry || false,
        enableDigital: r.enable_digital || false,
        subscriptionPlanId:   r.subscription_plan_id   || null,
        subscriptionStatus:   r.subscription_status    || 'none',
        subscriptionStart:    r.subscription_start     || null,
        subscriptionEnd:      r.subscription_end       || null,
        subscriptionPausedAt: r.subscription_paused_at || null,
        paymentHistory:       (() => { try { return JSON.parse(r.payment_history || '[]'); } catch { return Array.isArray(r.payment_history) ? r.payment_history : []; } })(),
      };
    });
  } catch(e) {
    studiosDB = {};
    console.warn('Could not load studios from Supabase:', e.message);
  }
}

function applyPlatformBranding() {
  const platLogo = document.getElementById('plat-login-logo');
  if (platLogo) platLogo.textContent = '✦ ' + platformName;
  if (platformLogoUrl) {
    const hub = document.getElementById('hub-logo-display');
    if (hub) hub.innerHTML = `<img class="hub-logo-img" src="${platformLogoUrl}" />`;
  }
}

// ── Studio login screen: show the STUDIO's own name & logo (not platform admin) ──
let _studioLoginPreviewTimer = null;
function previewStudioLoginBranding(rawCode) {
  clearTimeout(_studioLoginPreviewTimer);
  _studioLoginPreviewTimer = setTimeout(async () => {
    const code = (rawCode || '').trim().toUpperCase();
    const headingEl = document.getElementById('studio-login-logo-text');
    const markEl     = document.getElementById('studio-login-logo-mark');
    if (!code) {
      headingEl.textContent = 'Studio Sign In';
      markEl.innerHTML = '<i class="ri-camera-line icon-inline"></i>';
      return;
    }
    // Use cached studiosDB first, refresh from Supabase if not found yet
    let studio = studiosDB[code];
    if (!studio) {
      try {
        const rows = await sbFetch(`studios?code=eq.${encodeURIComponent(code)}&select=display_name,logo_url`);
        if (rows.length) studio = { displayName: rows[0].display_name || code, logoUrl: rows[0].logo_url || '' };
      } catch(e) { /* silent — fall back to defaults below */ }
    }
    if (studio) {
      headingEl.textContent = studio.displayName || code;
      markEl.innerHTML = studio.logoUrl ? `<img src="${studio.logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;" />` : '<i class="ri-camera-line icon-inline"></i>';
    } else {
      headingEl.textContent = 'Studio Sign In';
      markEl.innerHTML = '<i class="ri-camera-line icon-inline"></i>';
    }
  }, 350);
}

// ── Client login screen: show the project name & couple photo (not studio name) ──
let _clientLoginPreviewTimer = null;
function previewClientLoginBranding(rawCode) {
  clearTimeout(_clientLoginPreviewTimer);
  _clientLoginPreviewTimer = setTimeout(async () => {
    const code = (rawCode || '').trim().toUpperCase();
    const headingEl = document.getElementById('client-login-logo-text');
    const markEl     = document.getElementById('client-login-logo-mark');
    if (!code) {
      headingEl.textContent = 'Client Access';
      markEl.innerHTML = '<i class="ri-heart-fill icon-inline"></i>';
      return;
    }
    try {
      const rows = await sbFetch(`wedding_projects?client_code=eq.${encodeURIComponent(code)}&select=name,couple_photo_url`);
      if (rows.length) {
        headingEl.textContent = rows[0].name || code;
        markEl.innerHTML = rows[0].couple_photo_url ? `<img src="${rows[0].couple_photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : '<i class="ri-heart-fill icon-inline"></i>';
      } else {
        headingEl.textContent = 'Client Access';
        markEl.innerHTML = '<i class="ri-heart-fill icon-inline"></i>';
      }
    } catch(e) {
      headingEl.textContent = 'Client Access';
      markEl.innerHTML = '<i class="ri-heart-fill icon-inline"></i>';
    }
  }, 350);
}

// ══════════════════════════════════════════

//  SUPABASE HELPER
// ══════════════════════════════════════════
async function sbFetch(path, options = {}) {
  const { prefer, headers: extraHeaders, body, method } = options;
  const fetchOptions = {
    method: method || 'GET',
    mode: 'cors',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': prefer || 'return=representation',
      ...(extraHeaders || {})
    }
  };
  if (body) fetchOptions.body = body;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, fetchOptions);
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ══════════════════════════════════════════
