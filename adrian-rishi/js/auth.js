//  LOGIN HANDLERS
// ══════════════════════════════════════════
function platformLogin() {
  const u = document.getElementById('plat-username').value.trim();
  const p = document.getElementById('plat-password').value;
  const err = document.getElementById('plat-error');
  if (u !== PLATFORM_ADMIN_USER || p !== PLATFORM_ADMIN_PASS) {
    err.textContent = 'Invalid credentials.'; err.style.display = 'block'; return;
  }
  err.style.display = 'none';
  currentRole = 'platform';
  saveSession();
  enterApp();
}

async function studioLogin() {
  const code = document.getElementById('studio-username').value.trim().toUpperCase();
  const pass  = document.getElementById('studio-password').value;
  const err   = document.getElementById('studio-error');
  err.style.display = 'none';
  if (!code || !pass) { err.textContent = 'Please enter your username and password.'; err.style.display = 'block'; return; }
  try {
    const rows = await sbFetch(`studios?code=eq.${encodeURIComponent(code)}&select=*`);
    if (!rows.length || rows[0].password !== pass) {
      err.textContent = 'Invalid studio username or password.'; err.style.display = 'block'; return;
    }
    const r = rows[0];
    const studioFlags = lsGet('platform_studio_flags') || {};
    const flags = studioFlags[code] || {};
    // Also check per-studio key saved on this device (works cross-device when admin saves)
    const perStudioFlags = lsGet('studio_flags_' + code) || {};
    // Keep in-memory map up to date
    studiosDB[code] = {
      name: r.code, displayName: r.display_name || r.code,
      password: r.password, storagePlan: r.storage_plan || '25GB',
      logoUrl: r.logo_url || '', watermarkUrl: r.watermark_url || '',
      customFolder1: r.custom_folder1 || 'Custom Folder 1',
      whatsapp: r.whatsapp || PLATFORM_WHATSAPP, email: r.email || PLATFORM_EMAIL,
      subscriptionPlanId:   r.subscription_plan_id   || null,
      subscriptionStatus:   r.subscription_status    || 'none',
      subscriptionStart:    r.subscription_start     || null,
      subscriptionEnd:      r.subscription_end       || null,
      subscriptionPausedAt: r.subscription_paused_at || null,
      paymentHistory:       (() => { try { return JSON.parse(r.payment_history || '[]'); } catch { return Array.isArray(r.payment_history) ? r.payment_history : []; } })(),
    };
    currentRole   = 'studio';
    currentStudio = { code, ...studiosDB[code] };
    saveSession();
    enterApp();
  } catch(e) {
    err.textContent = 'Connection error. Please try again.'; err.style.display = 'block';
  }
}

async function clientLogin() {
  const projectCode = document.getElementById('client-code').value.trim().toUpperCase();
  const err = document.getElementById('client-error');
  if (!projectCode) { err.textContent = 'Please enter your access code.'; err.style.display = 'block'; return; }

  try {
    const data = await sbFetch(`wedding_projects?client_code=eq.${projectCode}&select=*`);
    if (!data.length) { err.textContent = 'Access code not found. Check with your photographer.'; err.style.display = 'block'; return; }
    currentProject = data[0];
    // Store limits (fallback to 250 if not set in DB)
    window.clientBrideLimit = currentProject.bride_limit || 250;
    window.clientGroomLimit = currentProject.groom_limit || 250;
    const studioCode = currentProject.studio_code || Object.keys(studiosDB)[0] || '';
    currentStudio = studioCode && studiosDB[studioCode]
      ? { code: studioCode, ...studiosDB[studioCode] }
      : { code: '', name: 'Studio', displayName: 'Studio', logoUrl: '', customFolder1: 'Custom Folder 1' };

    const studioStatus = computeEffectiveStatus(currentStudio);
    if (studioStatus === 'expired' || studioStatus === 'suspended') {
      err.textContent = 'This gallery is temporarily unavailable. Please contact your photographer.';
      err.style.display = 'block';
      return;
    }

    currentRole = 'client';
    err.style.display = 'none';
    saveSession();
    enterApp();
  } catch(e) {
    err.textContent = 'Connection error. Try again.'; err.style.display = 'block';
  }
}

// ══════════════════════════════════════════

//  ENTER APP
// ══════════════════════════════════════════
function enterApp() {
  hideAllScreens();
  const appEl = document.getElementById('screen-app');
  appEl.classList.add('active');
  appEl.style.display = 'flex';

  const header  = document.getElementById('app-header');
  const logoEl  = document.getElementById('app-logo-display');
  const brandEl = document.getElementById('app-brand-name');
  const roleEl  = document.getElementById('app-role-badge');
  const badge   = document.getElementById('user-badge');

  // Hide all panels first
  document.getElementById('panel-platform').style.display = 'none';
  document.getElementById('panel-studio').style.display   = 'none';
  document.getElementById('panel-client').style.display   = 'none';
  const _studioBadgeReset = document.getElementById('client-studio-badge');
  if (_studioBadgeReset) _studioBadgeReset.style.display = 'none';

  if (currentRole === 'platform') {
    header.className = 'app-header platform-header';
    brandEl.textContent = platformName;
    roleEl.textContent  = 'Platform Admin';
    badge.textContent   = PLATFORM_ADMIN_USER;
    if (platformLogoUrl) {
      logoEl.innerHTML = `<img class="header-logo-img" src="${platformLogoUrl}" />`;
    } else {
      logoEl.innerHTML = '<i class="ri-vip-crown-2-line icon-inline"></i>';
    }
    document.getElementById('panel-platform').style.display = 'flex';
    hideReportButton();
    loadPlatformDashboard();
    loadPlatformSettings_form();

  } else if (currentRole === 'studio') {
    header.className = 'app-header studio-header';
    const sName = currentStudio.displayName || currentStudio.name;
    brandEl.textContent = sName;
    roleEl.textContent  = 'Studio Owner';
    badge.textContent   = currentStudio.name;
    if (currentStudio.logoUrl) {
      logoEl.innerHTML = `<img class="header-logo-img" src="${currentStudio.logoUrl}" />`;
    } else {
      logoEl.innerHTML = '<i class="ri-camera-line icon-inline"></i>';
    }
    customFolder1Name = currentStudio.customFolder1 || 'Custom Folder 1';
    applyStudioDashboardTheme(sName);
    document.getElementById('panel-studio').style.display = 'flex';
    document.getElementById('panel-studio').style.flexDirection = 'column';

    // Show/hide feature tabs based on studio permissions
    const enqTab = document.getElementById('tab-enquiry-nav');
    const digTab = document.getElementById('tab-digital-nav');
    if (enqTab) enqTab.style.display = currentStudio.enableEnquiry ? '' : 'none';
    if (digTab) digTab.style.display = currentStudio.enableDigital ? '' : 'none';

    // Default to My Studio (settings) tab
    document.querySelectorAll('#panel-studio .tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#panel-studio .main-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('stab-settings').classList.add('active');
    document.querySelector('#panel-studio .main-tab').classList.add('active');
    loadProjects();
    loadStudioSettings_form();
    loadStudioContact_form();
    showReportButton();

  } else if (currentRole === 'client') {
    header.className = 'app-header client-header';
    brandEl.textContent = currentProject.name || 'My Photos';
    roleEl.textContent  = 'Client';
    badge.textContent   = currentProject.name;
    // Show couple photo if uploaded, else studio logo
    if (currentProject.couple_photo_url) {
      logoEl.innerHTML = `<img class="header-logo-img" src="${currentProject.couple_photo_url}" style="border-radius:4px;" />`;
    } else if (currentStudio.logoUrl) {
      logoEl.innerHTML = `<img class="header-logo-img" src="${currentStudio.logoUrl}" />`;
    } else {
      logoEl.innerHTML = '<i class="ri-heart-fill icon-inline"></i>';
    }
    // Studio identity badge — clients should always be able to see which studio this is
    const studioBadge = document.getElementById('client-studio-badge');
    if (studioBadge) {
      const studioLabel = currentStudio.displayName || currentStudio.name || 'Studio';
      studioBadge.style.display = 'flex';
      studioBadge.innerHTML = (currentStudio.logoUrl
        ? `<img src="${currentStudio.logoUrl}" style="width:18px;height:18px;border-radius:5px;object-fit:cover;flex-shrink:0;" />`
        : '<span><i class="ri-camera-line icon-inline"></i></span>') + `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${studioLabel}</span>`;
    }
    customFolder1Name = currentStudio.customFolder1 || 'Custom Folder 1';
    updateCustomFolderLabels();
    applyProjectTheme(currentProject.function_category);
    // Set dynamic limits from project
    window.clientBrideLimit = currentProject.bride_limit || 250;
    window.clientGroomLimit = currentProject.groom_limit || 250;
    document.getElementById('panel-client').style.display = 'flex';
    document.getElementById('panel-client').style.flexDirection = 'column';
    loadClientPhotos();
    loadClientOwnPhotos();
    showReportButton();
  }
}

function updateCustomFolderLabels() {
  const fn1 = document.getElementById('client-folder-name-1');
  if (fn1) fn1.placeholder = customFolder1Name;
  const oh1 = document.getElementById('client-own-folder-title');
  if (oh1) oh1.textContent = `📁 ${customFolder1Name}`;
}

function logout() {
  const exitingRole        = currentRole;
  const exitingStudioCode  = currentStudio  ? currentStudio.code : null;
  const exitingClientCode  = currentProject ? currentProject.client_code : null;

  currentRole = null; currentStudio = null; currentProject = null;
  allPhotos = []; selections = {}; projects = []; clientOwnPhotos = [];
  localStorage.removeItem('app_session');
  hideReportButton();
  document.getElementById('screen-app').style.display = 'none';

  if (exitingRole === 'studio') {
    hideAllScreens();
    document.getElementById('studio-password').value = '';
    if (exitingStudioCode) {
      document.getElementById('studio-username').value = exitingStudioCode;
      previewStudioLoginBranding(exitingStudioCode);
    }
    document.getElementById('studio-login-sub').textContent = 'Studio Owner Portal';
    document.getElementById('screen-studio-login').classList.add('active');
  } else if (exitingRole === 'client') {
    hideAllScreens();
    if (exitingClientCode) {
      document.getElementById('client-code').value = exitingClientCode;
      previewClientLoginBranding(exitingClientCode);
    }
    document.getElementById('screen-client-login').classList.add('active');
  } else {
    gotoHub();
  }
}

// ── Back-button / bfcache guard ──
// Mobile and desktop browsers often restore a page from the back/forward cache (bfcache)
// without re-running this script. Without this, a user who signs out and then taps the
// device/browser "Back" button could see the previous logged-in screen still on display.
// Whenever the page is restored this way, re-check localStorage for a valid session and
// force the user back to the login screen if none exists.
window.addEventListener('pageshow', function (event) {
  if (!event.persisted) return; // normal fresh load — loadPlatformSettings() already handles this
  const savedSession = JSON.parse(localStorage.getItem('app_session') || 'null');
  if (!savedSession || !savedSession.role) {
    currentRole = null; currentStudio = null; currentProject = null;
    hideAllScreens();
    gotoHub();
  }
});

// ══════════════════════════════════════════

//  FORGOT PASSWORD MODAL
// ══════════════════════════════════════════
function openForgotPassword() {
  const html = `
  <div id="forgot-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9100;display:flex;align-items:center;justify-content:center;padding:1.25rem;">
    <div style="background:var(--warm-white);border-radius:16px;padding:2rem 1.75rem;width:100%;max-width:380px;box-shadow:0 24px 60px rgba(0,0,0,0.3);">
      <div style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:400;margin-bottom:0.5rem;">🔐 Reset Password</div>
      <div style="font-size:0.78rem;color:var(--soft-gray);margin-bottom:1.5rem;">Verify your identity to reset the admin password.</div>
      <div style="margin-bottom:1rem;">
        <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--soft-gray);display:block;margin-bottom:0.35rem;">Verify via</label>
        <div style="display:flex;gap:0.5rem;">
          <button onclick="selectResetMethod('email')" id="reset-email-btn" style="flex:1;padding:0.65rem;border-radius:8px;border:2px solid var(--platform);background:var(--platform);color:white;font-family:'DM Sans',sans-serif;font-size:0.82rem;cursor:pointer;">📧 Email</button>
          <button onclick="selectResetMethod('phone')" id="reset-phone-btn" style="flex:1;padding:0.65rem;border-radius:8px;border:2px solid var(--border);background:var(--cream);color:var(--soft-gray);font-family:'DM Sans',sans-serif;font-size:0.82rem;cursor:pointer;">📱 Phone</button>
        </div>
      </div>
      <div id="reset-verify-info" style="background:var(--cream);border-radius:8px;padding:0.75rem 1rem;font-size:0.82rem;color:var(--charcoal);margin-bottom:1rem;">
        A verification code will be sent to: <strong>rishisajan661@gmail.com</strong>
      </div>
      <div style="margin-bottom:1rem;">
        <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--soft-gray);display:block;margin-bottom:0.35rem;">New Password</label>
        <input type="password" id="reset-new-pass" placeholder="Enter new password" style="width:100%;padding:0.85rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.95rem;background:var(--cream);color:var(--charcoal);outline:none;box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:1.25rem;">
        <label style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--soft-gray);display:block;margin-bottom:0.35rem;">Confirm Password</label>
        <input type="password" id="reset-confirm-pass" placeholder="Confirm new password" style="width:100%;padding:0.85rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.95rem;background:var(--cream);color:var(--charcoal);outline:none;box-sizing:border-box;" />
      </div>
      <div id="reset-error" style="background:#fde8ea;color:var(--danger);padding:0.65rem 0.9rem;border-radius:6px;font-size:0.82rem;margin-bottom:1rem;display:none;"></div>
      <button onclick="confirmPasswordReset()" style="width:100%;padding:1rem;background:var(--platform);color:white;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:500;cursor:pointer;margin-bottom:0.65rem;">Reset Password</button>
      <button onclick="closeForgotPassword()" style="width:100%;padding:0.75rem;background:none;color:var(--soft-gray);border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.85rem;cursor:pointer;">Cancel</button>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

let resetMethod = 'email';
function selectResetMethod(method) {
  resetMethod = method;
  const eb = document.getElementById('reset-email-btn');
  const pb = document.getElementById('reset-phone-btn');
  const info = document.getElementById('reset-verify-info');
  if (method === 'email') {
    eb.style.background = 'var(--platform)'; eb.style.color = 'white'; eb.style.borderColor = 'var(--platform)';
    pb.style.background = 'var(--cream)'; pb.style.color = 'var(--soft-gray)'; pb.style.borderColor = 'var(--border)';
    info.innerHTML = 'A reset link will be sent to: <strong>rishisajan661@gmail.com</strong>';
  } else {
    pb.style.background = 'var(--platform)'; pb.style.color = 'white'; pb.style.borderColor = 'var(--platform)';
    eb.style.background = 'var(--cream)'; eb.style.color = 'var(--soft-gray)'; eb.style.borderColor = 'var(--border)';
    info.innerHTML = 'A reset link will be sent to: <strong>+97477481284</strong>';
  }
}

function confirmPasswordReset() {
  const newPass = document.getElementById('reset-new-pass').value;
  const confirmPass = document.getElementById('reset-confirm-pass').value;
  const errEl = document.getElementById('reset-error');
  if (!newPass) { errEl.textContent = 'Please enter a new password.'; errEl.style.display = 'block'; return; }
  if (newPass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
  if (newPass !== confirmPass) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  // Save new password
  PLATFORM_ADMIN_PASS = newPass;
  const settings = lsGet('platform_settings') || {};
  settings.adminPass = newPass;
  lsSet('platform_settings', settings);
  closeForgotPassword();
  showToast('✅ Password reset successfully! Please login with your new password.');
}

function closeForgotPassword() {
  const modal = document.getElementById('forgot-modal');
  if (modal) modal.remove();
}




// ══════════════════════════════════════════
