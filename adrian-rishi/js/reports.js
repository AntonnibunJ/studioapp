//  REPORT ISSUE SYSTEM
// ══════════════════════════════════════════

// Your (platform admin) contact details
const PLATFORM_WHATSAPP = '+97477481284';
const PLATFORM_EMAIL    = 'rishisajan661@gmail.com';

function showReportButton() {
  const fab = document.getElementById('report-fab');
  if (fab) fab.style.display = 'flex';
}

function hideReportButton() {
  const fab = document.getElementById('report-fab');
  if (fab) fab.style.display = 'none';
}

function openReportIssue() {
  const modal = document.getElementById('report-modal');
  const sub   = document.getElementById('report-modal-sub');
  const info  = document.getElementById('report-sender-info');

  // Customise modal based on who is logged in
  if (currentRole === 'studio') {
    sub.textContent  = 'Your report goes directly to the Platform Admin';
    info.innerHTML   = `<strong>Studio:</strong> ${currentStudio.displayName || currentStudio.name} &nbsp;·&nbsp; <strong>Code:</strong> ${currentStudio.code}`;
  } else if (currentRole === 'client') {
    const studioName = currentStudio.displayName || currentStudio.name || 'Your Studio';
    const studioData = studiosDB[currentStudio.code] || {};
    const hasStudioContact = studioData.whatsapp || studioData.email;
    sub.textContent  = hasStudioContact
      ? `Your report goes to ${studioName} & Platform Admin`
      : `Your report goes directly to the Platform Admin`;
    info.innerHTML   = `<strong>Project:</strong> ${currentProject.name} &nbsp;·&nbsp; <strong>Studio:</strong> ${studioName}`;
  }

  // Clear previous entries
  document.getElementById('report-description').value = '';
  document.getElementById('report-contact').value     = '';
  document.getElementById('report-type').selectedIndex = 0;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeReportIssue() {
  document.getElementById('report-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function buildReportMessage() {
  const type    = document.getElementById('report-type').value;
  const desc    = document.getElementById('report-description').value.trim();
  const contact = document.getElementById('report-contact').value.trim();

  if (!desc) { showToast('Please describe the issue first'); return null; }

  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  let msg = '';
  if (currentRole === 'studio') {
    msg =
      `🚨 *Issue Report — Studio Owner*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🏢 *Studio:* ${currentStudio.displayName || currentStudio.name}\n` +
      `🔑 *Code:* ${currentStudio.code}\n` +
      `⚠️ *Type:* ${type}\n` +
      `📝 *Description:*\n${desc}\n` +
      (contact ? `📞 *Contact:* ${contact}\n` : '') +
      `🕐 *Time:* ${now}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Sent from StudioFlow App`;
  } else if (currentRole === 'client') {
    const studioName = currentStudio.displayName || currentStudio.name;
    msg =
      `🚨 *Issue Report — Client*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💍 *Project:* ${currentProject.name}\n` +
      `🏢 *Studio:* ${studioName}\n` +
      `⚠️ *Type:* ${type}\n` +
      `📝 *Description:*\n${desc}\n` +
      (contact ? `📞 *Client Contact:* ${contact}\n` : '') +
      `🕐 *Time:* ${now}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Sent from StudioFlow App`;
  }
  return { msg, desc, type, contact };
}

function getTargetContacts() {
  if (currentRole === 'studio') {
    // Studio owner → goes only to platform admin (you)
    return { primary: { whatsapp: PLATFORM_WHATSAPP, email: PLATFORM_EMAIL }, secondary: null };
  } else if (currentRole === 'client') {
    // Client → goes to studio owner AND platform admin (you)
    const studioData = studiosDB[currentStudio.code] || {};
    return {
      primary:   { whatsapp: studioData.whatsapp || '', email: studioData.email || '' },
      secondary: { whatsapp: PLATFORM_WHATSAPP, email: PLATFORM_EMAIL }
    };
  }
  return { primary: { whatsapp: '', email: '' }, secondary: null };
}

function sendReportWhatsApp() {
  const report = buildReportMessage();
  if (!report) return;
  const contacts = getTargetContacts();
  let sent = 0;

  // Send to primary (studio owner for client, platform admin for studio)
  if (contacts.primary.whatsapp) {
    const encoded = encodeURIComponent(report.msg);
    const number  = contacts.primary.whatsapp.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${number}?text=${encoded}`, '_blank');
    sent++;
  }
  // Also send to platform admin (secondary) for client reports
  setTimeout(() => {
    if (contacts.secondary && contacts.secondary.whatsapp) {
      const encoded = encodeURIComponent(report.msg);
      const number  = contacts.secondary.whatsapp.replace(/[^0-9]/g, '');
      window.open(`https://wa.me/${number}?text=${encoded}`, '_blank');
      sent++;
    }
    // If primary had no WhatsApp but secondary (platform admin) does, we already covered via secondary above
    if (!contacts.primary.whatsapp && !contacts.secondary?.whatsapp) {
      showToast('No WhatsApp number configured');
    } else {
      closeReportIssue();
      showToast('✅ Opening WhatsApp' + (sent > 1 ? ' (Studio + Admin)' : '') + '...');
    }
  }, contacts.secondary ? 700 : 0);

  // If no primary but has secondary, open secondary immediately
  if (!contacts.primary.whatsapp && contacts.secondary?.whatsapp) {
    const encoded = encodeURIComponent(report.msg);
    const number  = contacts.secondary.whatsapp.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${number}?text=${encoded}`, '_blank');
    closeReportIssue();
    showToast('✅ Opening WhatsApp (Platform Admin)...');
  } else if (contacts.primary.whatsapp) {
    // Already opened above; toast handled in setTimeout
  } else {
    showToast('No WhatsApp number configured');
  }
}

function sendReportEmail() {
  const report = buildReportMessage();
  if (!report) return;
  const contacts = getTargetContacts();
  const subject  = encodeURIComponent(`🚨 Issue Report — ${report.type}`);
  const body     = encodeURIComponent(report.msg.replace(/\*/g, ''));
  let sent = 0;

  // Build combined recipient list for email (to: studio, cc: platform admin or vice versa)
  const primaryEmail   = contacts.primary.email;
  const secondaryEmail = contacts.secondary ? contacts.secondary.email : '';

  if (!primaryEmail && !secondaryEmail) {
    showToast('No email configured');
    return;
  }

  // Open mailto with both addresses if both exist
  let mailto = '';
  if (primaryEmail && secondaryEmail) {
    mailto = `mailto:${primaryEmail}?cc=${encodeURIComponent(secondaryEmail)}&subject=${subject}&body=${body}`;
  } else if (primaryEmail) {
    mailto = `mailto:${primaryEmail}?subject=${subject}&body=${body}`;
  } else {
    mailto = `mailto:${secondaryEmail}?subject=${subject}&body=${body}`;
  }

  window.open(mailto, '_blank');
  closeReportIssue();
  const label = primaryEmail && secondaryEmail ? 'Studio & Platform Admin' : (primaryEmail ? 'Studio' : 'Platform Admin');
  showToast(`✅ Opening Email (${label})...`);
}

function sendReportBoth() {
  const report = buildReportMessage();
  if (!report) return;
  const contacts = getTargetContacts();
  let waSent = 0, emailSent = 0;

  // WhatsApp — primary
  if (contacts.primary.whatsapp) {
    const encoded = encodeURIComponent(report.msg);
    const number  = contacts.primary.whatsapp.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${number}?text=${encoded}`, '_blank');
    waSent++;
  }

  setTimeout(() => {
    // WhatsApp — secondary (platform admin)
    if (contacts.secondary && contacts.secondary.whatsapp) {
      const encoded = encodeURIComponent(report.msg);
      const number  = contacts.secondary.whatsapp.replace(/[^0-9]/g, '');
      window.open(`https://wa.me/${number}?text=${encoded}`, '_blank');
      waSent++;
    }

    // Email — combined (to: studio, cc: platform admin)
    const primaryEmail   = contacts.primary.email;
    const secondaryEmail = contacts.secondary ? contacts.secondary.email : '';
    const subject = encodeURIComponent(`🚨 Issue Report — ${report.type}`);
    const body    = encodeURIComponent(report.msg.replace(/\*/g, ''));

    if (primaryEmail || secondaryEmail) {
      let mailto = '';
      if (primaryEmail && secondaryEmail) {
        mailto = `mailto:${primaryEmail}?cc=${encodeURIComponent(secondaryEmail)}&subject=${subject}&body=${body}`;
      } else {
        mailto = `mailto:${primaryEmail || secondaryEmail}?subject=${subject}&body=${body}`;
      }
      setTimeout(() => { window.open(mailto, '_blank'); emailSent++; }, 700);
    }

    closeReportIssue();
    if (waSent === 0 && emailSent === 0) {
      showToast('No contact details saved');
    } else {
      showToast('✅ Sending to Studio & Platform Admin...');
    }
  }, 600);
}

// Close modal when tapping backdrop
document.getElementById('report-modal').addEventListener('click', function(e) {
  if (e.target === this) closeReportIssue();
});

// ── Studio contact save/load ──
async function saveStudioContact() {
  const wa    = document.getElementById('studio-whatsapp').value.trim();
  const email = document.getElementById('studio-email').value.trim();
  if (!currentStudio) return;
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(currentStudio.code)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ whatsapp: wa, email })
    });
    studiosDB[currentStudio.code].whatsapp = wa;
    studiosDB[currentStudio.code].email    = email;
    currentStudio.whatsapp = wa;
    currentStudio.email    = email;
    saveSession();
    showToast('✅ Contact details saved!');
  } catch(e) { showToast('Error saving contact: ' + e.message); }
}

function loadStudioContact_form() {
  const wa    = document.getElementById('studio-whatsapp');
  const email = document.getElementById('studio-email');
  if (wa)    wa.value    = currentStudio.whatsapp || PLATFORM_WHATSAPP;
  if (email) email.value = currentStudio.email    || PLATFORM_EMAIL;
}

function resetStudioContactToPlatform() {
  document.getElementById('studio-whatsapp').value = PLATFORM_WHATSAPP;
  document.getElementById('studio-email').value    = PLATFORM_EMAIL;
  showToast('Platform admin details loaded — tap Save to confirm');
}

// ══════════════════════════════════════════

//  ENQUIRY / PACKAGE MANAGEMENT
// ══════════════════════════════════════════
let enquiryPackages = [];
let pkgUploadedPhotos = []; // {url, public_id}
let _currentEditPkgId = null;
window._lastPkgLink = '';

function openCreatePackageModal() {
  _currentEditPkgId = null;
  pkgUploadedPhotos = [];
  document.getElementById('new-pkg-type').value = 'Standard Package';
  document.getElementById('new-pkg-desc').value = '';
  document.getElementById('pkg-photo-upload').value = '';
  document.getElementById('pkg-preview-grid').innerHTML = '';
  document.getElementById('pkg-upload-progress').textContent = '';
  document.getElementById('pkg-link-result').style.display = 'none';
  document.getElementById('create-package-modal').style.display = 'block';

  // Live photo preview as user picks files
  document.getElementById('pkg-photo-upload').onchange = function() {
    const files = Array.from(this.files);
    const grid = document.getElementById('pkg-preview-grid');
    grid.innerHTML = files.map((f, i) => `
      <div style="aspect-ratio:1;overflow:hidden;border-radius:6px;background:#111;">
        <img src="${URL.createObjectURL(f)}" style="width:100%;height:100%;object-fit:cover;" />
      </div>`).join('');
  };
}

async function savePackage() {
  const pkgType = document.getElementById('new-pkg-type').value;
  const pkgDesc = document.getElementById('new-pkg-desc').value.trim();
  const files   = Array.from(document.getElementById('pkg-photo-upload').files);
  const prog    = document.getElementById('pkg-upload-progress');

  if (!pkgType) { showToast('Please select a package type'); return; }

  // Upload photos if any
  let uploadedUrls = [...pkgUploadedPhotos];
  if (files.length) {
    prog.textContent = `Uploading 0/${files.length}...`;
    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadToCloudinary(files[i], `wedding-studio/${currentStudio.code}/packages/${pkgType.replace(/\s+/g,'_')}`);
        uploadedUrls.push({ url });
        prog.textContent = `Uploading ${i+1}/${files.length}...`;
      } catch(e) {
        showToast('Upload failed for one photo: ' + e.message);
      }
    }
    prog.textContent = `✅ ${uploadedUrls.length} photo(s) uploaded`;
  }

  // Save to Supabase enquiry_packages table
  const payload = {
    studio_code: currentStudio.code,
    pkg_type: pkgType,
    description: pkgDesc,
    photos: JSON.stringify(uploadedUrls),
  };

  try {
    let saved;
    if (_currentEditPkgId) {
      saved = await sbFetch(`enquiry_packages?id=eq.${_currentEditPkgId}`, { method: 'PATCH', prefer: 'return=representation', body: JSON.stringify(payload) });
      saved = saved[0];
    } else {
      const res = await sbFetch('enquiry_packages', { method: 'POST', prefer: 'return=representation', body: JSON.stringify(payload) });
      saved = res[0];
    }
    const pkgId = saved?.id || _currentEditPkgId;
    const baseUrl = window.location.origin + window.location.pathname;
    const pkgLink = `${baseUrl}?pkg=${pkgId}`;
    window._lastPkgLink = pkgLink;
    document.getElementById('pkg-link-text').textContent = pkgLink;
    document.getElementById('pkg-link-result').style.display = 'block';
    showToast('✅ Package saved!');
    loadEnquiryPackages();
  } catch(e) {
    showToast('Error saving package: ' + e.message);
  }
}

function copyPackageLink() {
  const link = window._lastPkgLink || '';
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => showToast('✅ Link copied!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('✅ Link copied!');
  });
}

async function loadEnquiryPackages() {
  const el = document.getElementById('enquiry-packages-list');
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
  try {
    const data = await sbFetch(`enquiry_packages?studio_code=eq.${encodeURIComponent(currentStudio.code)}&order=created_at.desc`);
    enquiryPackages = data || [];
    if (!enquiryPackages.length) {
      el.innerHTML = '<p style="font-size:0.82rem;color:var(--soft-gray);">No packages yet. Create one above.</p>';
      return;
    }
    const baseUrl = window.location.origin + window.location.pathname;
    el.innerHTML = enquiryPackages.map(pkg => {
      const photos = safeParseJson(pkg.photos, []);
      const pkgLink = `${baseUrl}?pkg=${pkg.id}`;
      return `
        <div style="border:1px solid var(--border);border-radius:10px;padding:1rem;margin-bottom:0.75rem;background:rgba(255,255,255,0.02);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
            <div>
              <div style="font-size:0.92rem;font-weight:600;color:var(--gold);">📦 ${pkg.pkg_type}</div>
              ${pkg.description ? `<div style="font-size:0.75rem;color:var(--soft-gray);margin-top:0.15rem;">${pkg.description}</div>` : ''}
            </div>
            <button class="btn-danger" style="font-size:0.7rem;padding:0.3rem 0.6rem;" onclick="deletePackage('${pkg.id}')">🗑</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.35rem;margin-bottom:0.65rem;">
            ${photos.slice(0,4).map(p => `<div style="aspect-ratio:1;overflow:hidden;border-radius:5px;background:#111;"><img src="${cldThumb(p.url)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/></div>`).join('')}
            ${photos.length > 4 ? `<div style="aspect-ratio:1;border-radius:5px;background:rgba(212,175,55,0.1);display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:var(--gold);">+${photos.length - 4}</div>` : ''}
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
            <div style="font-family:monospace;font-size:0.68rem;color:var(--soft-gray);word-break:break-all;flex:1;">${pkgLink}</div>
            <button onclick="navigator.clipboard.writeText('${pkgLink}').then(()=>showToast('✅ Copied!'))" style="background:rgba(212,175,55,0.1);border:1px solid var(--gold);border-radius:6px;color:var(--gold);font-size:0.7rem;padding:0.25rem 0.6rem;cursor:pointer;">📋 Copy</button>
          </div>
          <div style="font-size:0.68rem;color:var(--soft-gray);margin-top:0.35rem;">${photos.length} photo(s)</div>
        </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = '<p style="color:red;font-size:0.8rem;">Error loading packages. Make sure the enquiry_packages table exists in Supabase.</p>';
  }
}

async function deletePackage(id) {
  if (!confirm('Delete this package? This cannot be undone.')) return;
  try {
    await sbFetch(`enquiry_packages?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    showToast('Package deleted');
    loadEnquiryPackages();
  } catch(e) { showToast('Error deleting package'); }
}

// Package public view — shown when URL has ?pkg=<id>
async function loadPublicPackageView(pkgId) {
  hideAllScreens();
  const screen = document.createElement('div');
  screen.id = 'screen-pkg-view';
  screen.style.cssText = 'min-height:100vh;padding:1.5rem;max-width:680px;margin:0 auto;';
  document.body.appendChild(screen);
  screen.innerHTML = '<div class="loading"><div class="spinner"></div>Loading package...</div>';
  try {
    const data = await sbFetch(`enquiry_packages?id=eq.${pkgId}&select=*`);
    if (!data || !data.length) { screen.innerHTML = '<p style="color:red;text-align:center;padding:3rem;">Package not found.</p>'; return; }
    const pkg = data[0];
    const photos = safeParseJson(pkg.photos, []);
    screen.innerHTML = `
      <div style="text-align:center;margin-bottom:2rem;">
        <div style="font-family:'Cinzel',serif;font-size:1.6rem;background:var(--gold-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Rishiani Studio Flow</div>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.8rem;color:var(--gold);margin-top:1rem;">📦 ${pkg.pkg_type}</h2>
        ${pkg.description ? `<p style="color:var(--soft-gray);font-size:0.9rem;margin-top:0.5rem;">${pkg.description}</p>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.75rem;margin-bottom:2rem;">
        ${photos.map(p => `<div style="aspect-ratio:4/3;overflow:hidden;border-radius:10px;"><img src="${cldThumb(p.url)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/></div>`).join('')}
      </div>
      ${!photos.length ? '<p style="text-align:center;color:var(--soft-gray);padding:2rem;">No photos uploaded for this package yet.</p>' : ''}
      <div style="background:rgba(212,175,55,0.08);border:1px solid var(--gold);border-radius:12px;padding:1.5rem;text-align:center;">
        <p style="font-size:0.9rem;color:var(--charcoal);margin-bottom:0.75rem;">Interested in this package? Contact the studio.</p>
        <p style="font-size:0.75rem;color:var(--soft-gray);">You can also reply to the studio WhatsApp or call them to confirm your booking.</p>
      </div>`;
  } catch(e) {
    screen.innerHTML = '<p style="color:red;text-align:center;padding:3rem;">Error loading package.</p>';
  }
}

// ══════════════════════════════════════════
