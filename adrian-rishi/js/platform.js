//  SUBSCRIPTION SYSTEM (Phase 1)
// ══════════════════════════════════════════
let subscriptionPlans = []; // loaded from Supabase `subscription_plans`

async function refreshSubscriptionPlans() {
  try {
    subscriptionPlans = await sbFetch('subscription_plans?select=*&order=display_order.asc');
  } catch (e) {
    console.warn('Could not load subscription plans:', e.message);
    subscriptionPlans = [];
  }
  return subscriptionPlans;
}

function getPlanById(id) {
  return subscriptionPlans.find(p => p.id === id) || null;
}

// Effective status accounts for a plan that has silently run past its end date,
// without needing a server-side cron job.
function computeEffectiveStatus(studio) {
  if (!studio) return 'none';
  const raw = studio.subscriptionStatus || 'none';
  if (raw === 'suspended' || raw === 'paused' || raw === 'none' || raw === 'cancelled') return raw;
  if ((raw === 'active' || raw === 'trial') && studio.subscriptionEnd) {
    if (new Date(studio.subscriptionEnd).getTime() < Date.now()) return 'expired';
  }
  return raw;
}

function daysRemaining(studio) {
  if (!studio || !studio.subscriptionEnd) return 0;
  const ms = new Date(studio.subscriptionEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

function subscriptionStatusLabel(status) {
  return {
    active: '🟢 Active', trial: '🟢 Trial', expired: '🔴 Expired',
    suspended: '🟠 Suspended', paused: '⏸️ Paused', none: '⚪ No Plan',
    cancelled: '⚫ Cancelled'
  }[status] || status;
}

// Gate for any studio/client action that should stop working once a subscription lapses.
// Platform Admin is never gated.
function canPerformAction() {
  if (currentRole === 'platform') return true;
  const status = computeEffectiveStatus(currentStudio);
  return status === 'active' || status === 'trial';
}

function requireActiveSubscription(actionLabel) {
  if (canPerformAction()) return true;
  showToast(`🔒 ${actionLabel || 'This action'} is disabled — the studio's subscription is ${computeEffectiveStatus(currentStudio)}.`);
  return false;
}

// Applies a plan to a studio immediately (self-service, no payment gateway yet).
// Used by both the Studio Owner ("Renew Now" / "Upgrade") and the Platform Admin (override).
async function activateSubscriptionPlan(studioCode, planId, opts = {}) {
  const plan = getPlanById(planId);
  if (!plan) { showToast('Plan not found'); return; }
  const now = new Date();
  const end = new Date(now.getTime() + plan.duration_days * 86400000);
  const studio = studiosDB[studioCode];
  const history = Array.isArray(studio?.paymentHistory) ? studio.paymentHistory.slice() : [];
  history.unshift({
    date: now.toISOString(),
    plan: plan.name,
    price: plan.price,
    currency: plan.currency,
    note: opts.note || 'Self-activated (no payment gateway connected)'
  });
  const update = {
    subscription_plan_id: plan.id,
    subscription_status: 'active',
    subscription_start: now.toISOString(),
    subscription_end: end.toISOString(),
    subscription_paused_at: null,
    payment_history: JSON.stringify(history)
  };
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(studioCode)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(update)
    });
    await refreshStudiosDB();
    if (currentStudio && currentStudio.code === studioCode) {
      currentStudio = { code: studioCode, ...studiosDB[studioCode] };
      saveSession();
    }
    showToast(`✅ ${plan.name} plan activated!`);
  } catch (e) {
    showToast('Error activating plan: ' + e.message);
  }
}

// Admin-only overrides
async function adminSetSubscriptionStatus(studioCode, status) {
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(studioCode)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ subscription_status: status })
    });
    await refreshStudiosDB();
    showToast('✅ Subscription status updated');
    loadStudiosList(); loadPlatformDashboard();
  } catch (e) { showToast('Error: ' + e.message); }
}

async function adminExtendSubscription(studioCode, days) {
  const studio = studiosDB[studioCode];
  if (!studio) return;
  const base = studio.subscriptionEnd && new Date(studio.subscriptionEnd) > new Date()
    ? new Date(studio.subscriptionEnd) : new Date();
  const newEnd = new Date(base.getTime() + days * 86400000);
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(studioCode)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ subscription_end: newEnd.toISOString(), subscription_status: 'active' })
    });
    await refreshStudiosDB();
    showToast(`✅ Extended by ${days} days`);
    loadStudiosList(); loadPlatformDashboard();
  } catch (e) { showToast('Error: ' + e.message); }
}

async function adminPauseSubscription(studioCode) {
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(studioCode)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ subscription_status: 'paused', subscription_paused_at: new Date().toISOString() })
    });
    await refreshStudiosDB();
    showToast('⏸️ Subscription paused');
    loadStudiosList();
  } catch (e) { showToast('Error: ' + e.message); }
}

async function adminResumeSubscription(studioCode) {
  const studio = studiosDB[studioCode];
  if (!studio || !studio.subscriptionPausedAt) {
    await adminSetSubscriptionStatus(studioCode, 'active'); return;
  }
  const pausedMs = Date.now() - new Date(studio.subscriptionPausedAt).getTime();
  const newEnd = studio.subscriptionEnd
    ? new Date(new Date(studio.subscriptionEnd).getTime() + pausedMs)
    : new Date(Date.now() + 30 * 86400000);
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(studioCode)}`, {
      method: 'PATCH', prefer: 'return=minimal',
      body: JSON.stringify({ subscription_status: 'active', subscription_end: newEnd.toISOString(), subscription_paused_at: null })
    });
    await refreshStudiosDB();
    showToast('▶️ Subscription resumed');
    loadStudiosList();
  } catch (e) { showToast('Error: ' + e.message); }
}

// ── Plan Manager CRUD (Platform Admin) ──
async function createSubscriptionPlan(planData) {
  try {
    await sbFetch('subscription_plans', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(planData) });
    await refreshSubscriptionPlans();
    showToast('✅ Plan created');
  } catch (e) { showToast('Error creating plan: ' + e.message); }
}

async function updateSubscriptionPlan(id, planData) {
  try {
    await sbFetch(`subscription_plans?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(planData) });
    await refreshSubscriptionPlans();
    showToast('✅ Plan updated');
  } catch (e) { showToast('Error updating plan: ' + e.message); }
}

async function deleteSubscriptionPlan(id) {
  if (!confirm('Delete this plan? Studios already on it keep their current cycle, but it will no longer be selectable.')) return;
  try {
    await sbFetch(`subscription_plans?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    await refreshSubscriptionPlans();
    showToast('Plan deleted');
    renderPlanManagerList();
  } catch (e) { showToast('Error deleting plan: ' + e.message); }
}

async function togglePlanStatus(id) {
  const plan = getPlanById(id);
  if (!plan) return;
  await updateSubscriptionPlan(id, { status: plan.status === 'active' ? 'disabled' : 'active' });
  renderPlanManagerList();
}

async function movePlanOrder(id, dir) {
  const sorted = [...subscriptionPlans].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const idx = sorted.findIndex(p => p.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx], b = sorted[swapIdx];
  const aOrder = a.display_order || 0, bOrder = b.display_order || 0;
  await sbFetch(`subscription_plans?id=eq.${a.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ display_order: bOrder }) });
  await sbFetch(`subscription_plans?id=eq.${b.id}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ display_order: aOrder }) });
  await refreshSubscriptionPlans();
  renderPlanManagerList();
}

// ── Studio Owner: self-service subscription card ──
function renderStudioSubscriptionCard() {
  const summaryEl  = document.getElementById('studio-sub-summary');
  const warningEl  = document.getElementById('studio-sub-warning');
  const pickerEl   = document.getElementById('studio-plan-picker');
  const historyEl  = document.getElementById('studio-sub-history');
  if (!summaryEl || !currentStudio) return;

  const status = computeEffectiveStatus(currentStudio);
  const plan = getPlanById(currentStudio.subscriptionPlanId);

  summaryEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
      <div>Status: <strong>${subscriptionStatusLabel(status)}</strong></div>
      <div>Current Plan: <strong>${plan ? plan.name : 'None'}</strong></div>
    </div>
    ${currentStudio.subscriptionEnd ? `<div style="margin-top:0.4rem;">Renewal / Expiry: <strong>${new Date(currentStudio.subscriptionEnd).toLocaleDateString('en-IN')}</strong> · ${daysRemaining(currentStudio)} days remaining</div>` : ''}
  `;

  warningEl.innerHTML = (status === 'expired' || status === 'suspended' || status === 'cancelled')
    ? `<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:0.8rem 1rem;font-size:0.82rem;color:var(--danger);margin-bottom:1rem;">
        🔒 Your subscription is <strong>${status}</strong>. Uploads, new projects, new clients and client access are paused. Nothing has been deleted — pick a plan below to restore full access instantly.
       </div>`
    : (status === 'active' && daysRemaining(currentStudio) <= 5)
      ? `<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:0.8rem 1rem;font-size:0.82rem;color:#b45309;margin-bottom:1rem;">
          ⏳ Your plan renews in ${daysRemaining(currentStudio)} day(s). Renew now to avoid any interruption.
         </div>`
      : '';

  const activePlans = subscriptionPlans.filter(p => p.status === 'active');
  pickerEl.innerHTML = activePlans.length
    ? activePlans.map(p => `
      <div style="border:1px solid var(--border);border-radius:12px;padding:0.9rem 1.1rem;display:flex;justify-content:space-between;align-items:center;${currentStudio.subscriptionPlanId === p.id ? 'border-color:var(--accent);background:rgba(74,63,107,0.05);' : ''}">
        <div>
          <div style="font-weight:600;">${p.name} ${p.popular ? '⭐' : ''} ${p.recommended ? '🏆' : ''}</div>
          <div style="font-size:0.8rem;color:var(--text3);">${formatMoney(p.price, p.currency)} / ${p.duration_days} days ${p.offer_text ? '· ' + p.offer_text : ''}</div>
        </div>
        <button class="btn-small platform" onclick="studioSelectPlan('${p.id}')">${status === 'active' && currentStudio.subscriptionPlanId === p.id ? 'Renew' : (status === 'active' ? 'Switch' : 'Activate')}</button>
      </div>`).join('')
    : '<p style="font-size:0.82rem;color:var(--text3);">No plans are available yet — contact your Platform Admin.</p>';

  const cancelEl = document.getElementById('studio-sub-cancel');
  if (cancelEl) {
    cancelEl.innerHTML = (status === 'active' || status === 'trial')
      ? `<button class="btn-small" style="background:none;border:1px solid var(--danger);color:var(--danger);" onclick="studioCancelPlan()">Cancel Plan</button>`
      : '';
  }

  const hist = currentStudio.paymentHistory || [];
  historyEl.innerHTML = hist.length ? hist.map(h => `
    <div style="padding:0.4rem 0;border-bottom:1px solid var(--border);">
      ${new Date(h.date).toLocaleDateString('en-IN')} — ${h.plan} — ${formatMoney(h.price, h.currency)}
    </div>`).join('') : '<div style="color:var(--text3);">No payment history yet.</div>';
}

async function studioSelectPlan(planId) {
  const plan = getPlanById(planId);
  if (!plan) return;
  if (!confirm(`Activate "${plan.name}" for ${formatMoney(plan.price, plan.currency)}? Since no payment gateway is connected yet, this activates immediately without collecting payment.`)) return;
  await activateSubscriptionPlan(currentStudio.code, planId);
  renderStudioSubscriptionCard();
}

// Studio Owner self-service cancellation. Access continues until the
// current cycle's expiry date, after which the studio simply won't
// auto-renew (there is no auto-renew today, but this makes intent explicit
// and immediately blocks switching/renewing until they reactivate).
async function studioCancelPlan() {
  if (!currentStudio) return;
  const status = computeEffectiveStatus(currentStudio);
  if (status !== 'active' && status !== 'trial') { showToast('No active plan to cancel.'); return; }
  const endLabel = currentStudio.subscriptionEnd ? new Date(currentStudio.subscriptionEnd).toLocaleDateString('en-IN') : 'the end of your current cycle';
  if (!confirm(`Cancel your subscription? You'll keep access until ${endLabel}, after which uploads, new projects and client access will be paused until you pick a plan again.`)) return;
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(currentStudio.code)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ subscription_status: 'cancelled' })
    });
    await refreshStudiosDB();
    currentStudio = { code: currentStudio.code, ...studiosDB[currentStudio.code] };
    saveSession();
    showToast('Subscription cancelled.');
    renderStudioSubscriptionCard();
  } catch (e) { showToast('Error cancelling: ' + e.message); }
}

// ══════════════════════════════════════════

//  PLATFORM: DASHBOARD
// ══════════════════════════════════════════
async function loadPlatformDashboard() {
  const studios = Object.values(studiosDB);
  document.getElementById('stat-studios').textContent = studios.length;

  // Revenue estimate — sum of plan price for currently active/trial subscribers
  let revenue = 0;
  studios.forEach(s => {
    const status = computeEffectiveStatus(s);
    if (status === 'active' || status === 'trial') {
      const plan = getPlanById(s.subscriptionPlanId);
      if (plan) revenue += Number(plan.price) || 0;
    }
  });
  document.getElementById('stat-revenue').textContent = '₹' + revenue;

  // All-time total revenue — sum of every payment ever recorded, regardless of current status
  let totalRevenueAllTime = 0;
  studios.forEach(s => {
    (s.paymentHistory || []).forEach(h => { totalRevenueAllTime += Number(h.price) || 0; });
  });
  const totalRevEl = document.getElementById('stat-total-revenue');
  if (totalRevEl) totalRevEl.textContent = '₹' + totalRevenueAllTime;


  // Recent studios list
  const el = document.getElementById('recent-studios-list');
  if (!studios.length) { el.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No studios yet.</p>'; return; }
  el.innerHTML = studios.slice(0, 5).map(s => {
    const status = computeEffectiveStatus(s);
    const plan = getPlanById(s.subscriptionPlanId);
    return `
    <div class="studio-item">
      <div class="studio-avatar-placeholder"><i class="ri-camera-line icon-inline"></i></div>
      <div class="studio-info">
        <div class="studio-name">${s.displayName || s.name}</div>
        <div class="studio-details">${subscriptionStatusLabel(status)} · Plan: ${plan ? plan.name : 'None'} · Login: ${Object.keys(studiosDB).find(k => studiosDB[k] === s) || ''}</div>
      </div>
    </div>`;
  }).join('');

  loadStudiosList();
}

async function openStatDetail(type) {
  const panel = document.getElementById('stat-detail-panel');
  const title = document.getElementById('stat-detail-title');
  const content = document.getElementById('stat-detail-content');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth' });
  content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

  if (type === 'studios') {
    title.textContent = '🏢 All Studios';
    const studios = Object.entries(studiosDB);
    if (!studios.length) { content.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No studios yet.</p>'; return; }
    content.innerHTML = studios.map(([code, s]) => {
      const status = computeEffectiveStatus(s);
      const plan = getPlanById(s.subscriptionPlanId);
      return `
      <div class="studio-item" style="margin-bottom:0.6rem;">
        <div class="studio-avatar-placeholder"><i class="ri-camera-line icon-inline"></i></div>
        <div class="studio-info">
          <div class="studio-name">${s.displayName || s.name}</div>
          <div class="studio-details">Code: <strong>${code}</strong> · ${subscriptionStatusLabel(status)} · Plan: ${plan ? plan.name : 'None'}</div>
        </div>
        <div class="studio-actions">
          <button class="btn-small platform" onclick="openEditStudio('${code}');document.getElementById('stat-detail-panel').style.display='none'">Edit</button>
          <button class="btn-danger" onclick="deleteStudio('${code}');openStatDetail('studios')"><i class="ri-delete-bin-line icon-inline"></i> Remove</button>
        </div>
      </div>`;
    }).join('');

  } else if (type === 'projects') {
    title.textContent = '📋 All Projects';
    try {
      const projs = await sbFetch('wedding_projects?select=*&order=created_at.desc');
      if (!projs.length) { content.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No projects yet.</p>'; return; }
      content.innerHTML = projs.map(p => `
        <div class="project-item" style="margin-bottom:0.5rem;">
          <div>
            <div class="project-name">${p.name}</div>
            <div class="project-meta">Client Code: <strong>${p.client_code}</strong></div>
          </div>
          <div class="project-actions">
            <button class="btn-danger" onclick="adminDeleteProject('${p.id}', this)">✕ Delete</button>
          </div>
        </div>`).join('');
    } catch(e) { content.innerHTML = '<p style="color:red;font-size:0.8rem;">Error loading projects.</p>'; }

  } else if (type === 'photos') {
    title.textContent = '🖼️ All Photos';
    try {
      const projs = await sbFetch('wedding_projects?select=*');
      const photos = await sbFetch('photos?select=*&order=created_at.desc&limit=50');
      if (!photos.length) { content.innerHTML = '<div class="empty-state"><div class="empty-icon">📷</div><p>No photos yet.</p></div>'; return; }
      // Group by project
      const byProj = {};
      photos.forEach(ph => {
        if (!byProj[ph.project_id]) byProj[ph.project_id] = [];
        byProj[ph.project_id].push(ph);
      });
      content.innerHTML = Object.entries(byProj).map(([pid, phs]) => {
        const proj = projs.find(p => p.id === pid);
        return `
          <div style="margin-bottom:1.2rem;">
            <div style="font-size:0.8rem;font-weight:500;margin-bottom:0.5rem;color:var(--platform);">
              📋 ${proj ? proj.name : 'Unknown Project'} <span style="color:var(--soft-gray);font-weight:400;">(${phs.length} photos)</span>
            </div>
            <div class="photo-grid" style="grid-template-columns:repeat(3,1fr);">
              ${phs.map((ph, i) => `
                <div class="photo-card" id="admin-photo-${ph.id}">
                  <div class="photo-img-wrap" ${pmAttr({id:ph.id,category:ph.category,url:ph.url,created_at:ph.created_at,watermarked:ph.watermarked,project:proj?proj.name:'Unknown'})} onclick="openLightbox(${JSON.stringify(phs.map(x=>x.url))},${i},'${ph.category}')">
                    <img src="${cldThumb(ph.url)}" loading="lazy"/>
                    <div class="photo-zoom-hint">🔍</div>
                  </div>
                  <div style="padding:0.3rem 0.4rem;"><span class="category-badge" style="font-size:0.58rem;">${ph.category}</span></div>
                  <div style="padding:0 0.4rem 0.4rem;">
                    <button class="btn-danger" style="width:100%;font-size:0.65rem;padding:0.3rem;" onclick="adminDeletePhoto('${ph.id}')"><i class="ri-delete-bin-line icon-inline"></i> Remove</button>
                  </div>
                </div>`).join('')}
            </div>
          </div>`;
      }).join('');
    } catch(e) { content.innerHTML = '<p style="color:red;font-size:0.8rem;">Error loading photos.</p>'; }

  } else if (type === 'revenue') {
    title.textContent = '💰 Revenue Breakdown (Active Subscribers)';
    const studios = Object.entries(studiosDB).filter(([code, s]) => {
      const status = computeEffectiveStatus(s);
      return status === 'active' || status === 'trial';
    });
    let total = 0;
    const rows = studios.map(([code, s]) => {
      const plan = getPlanById(s.subscriptionPlanId);
      const price = plan ? Number(plan.price) || 0 : 0;
      total += price;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:0.88rem;font-weight:500;">${s.displayName || s.name}</div>
          <div style="font-size:0.7rem;color:var(--soft-gray);">Plan: ${plan ? plan.name : 'None'}</div>
        </div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:var(--platform);font-weight:600;">${formatMoney(price, plan ? plan.currency : 'INR')}</div>
      </div>`;
    });
    if (!rows.length) { content.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No active subscribers yet.</p>'; return; }
    content.innerHTML = rows.join('') +
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 0;margin-top:0.3rem;">
        <div style="font-weight:500;">Total Revenue (Active)</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:var(--platform);font-weight:600;">₹${total}</div>
      </div>`;

  } else if (type === 'total-revenue') {
    title.textContent = '💰 Total Revenue (All-Time)';
    const studios = Object.entries(studiosDB).filter(([code, s]) => (s.paymentHistory || []).length);
    let grandTotal = 0;
    const rows = studios.map(([code, s]) => {
      const hist = s.paymentHistory || [];
      const studioTotal = hist.reduce((sum, h) => sum + (Number(h.price) || 0), 0);
      grandTotal += studioTotal;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:0.88rem;font-weight:500;">${s.displayName || s.name}</div>
          <div style="font-size:0.7rem;color:var(--soft-gray);">${hist.length} payment${hist.length !== 1 ? 's' : ''} recorded</div>
        </div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:var(--platform);font-weight:600;">₹${studioTotal}</div>
      </div>`;
    });
    if (!rows.length) { content.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No payments recorded yet.</p>'; return; }
    content.innerHTML = rows.join('') +
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 0;margin-top:0.3rem;">
        <div style="font-weight:500;">Grand Total (All-Time)</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:var(--platform);font-weight:600;">₹${grandTotal}</div>
      </div>`;
  }
}

async function adminDeleteProject(id, btn) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  try {
    await sbFetch(`wedding_projects?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
    showToast('Project deleted');
    openStatDetail('projects');
    loadPlatformDashboard();
  } catch(e) { showToast('Error deleting project'); }
}

async function adminDeletePhoto(photoId) {
  if (!confirm('Remove this photo?')) return;
  try {
    await sbFetch(`photos?id=eq.${photoId}`, { method: 'DELETE', prefer: 'return=minimal' });
    showToast('Photo removed');
    const card = document.getElementById(`admin-photo-${photoId}`);
    if (card) card.remove();
    loadPlatformDashboard();
  } catch(e) { showToast('Error removing photo'); }
}

async function loadStudiosList() {
  const newPlanSelect = document.getElementById('new-studio-plan');
  if (newPlanSelect) {
    newPlanSelect.innerHTML = '<option value="">No plan (assign later)</option>' +
      subscriptionPlans.filter(p => p.status === 'active').map(p =>
        `<option value="${p.id}">${p.name} — ${formatMoney(p.price, p.currency)}</option>`).join('');
  }
  const el = document.getElementById('studios-list');
  let studios = Object.entries(studiosDB);
  if (!studios.length) { el.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No studios added yet.</p>'; return; }

  const search = (document.getElementById('studio-search')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('studio-status-filter')?.value || 'all';
  studios = studios.filter(([code, s]) => {
    const matchesSearch = !search || code.toLowerCase().includes(search) || (s.displayName || '').toLowerCase().includes(search);
    const matchesStatus = statusFilter === 'all' || computeEffectiveStatus(s) === statusFilter;
    return matchesSearch && matchesStatus;
  });
  if (!studios.length) { el.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No studios match your search/filter.</p>'; return; }

  // Fetch projects for grouping (no photo details)
  let allProjects = [];
  try { allProjects = await sbFetch('wedding_projects?select=id,name,client_code,studio_code,created_at&order=created_at.desc'); } catch {}
  const baseUrl = window.location.origin + window.location.pathname;
  el.innerHTML = studios.map(([code, s]) => {
    const studioProjects = allProjects.filter(p => p.studio_code === code);
    const studioLink = `${baseUrl}?studio=${code}`;
    const status = computeEffectiveStatus(s);
    const plan = getPlanById(s.subscriptionPlanId);
    const projectRows = studioProjects.length
      ? studioProjects.map(p => {
          const date = p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '';
          return `<div style="padding:0.5rem 0.75rem;border-bottom:1px solid var(--border);font-size:0.82rem;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:500;">${p.name}</div>
              <div style="font-size:0.7rem;color:var(--soft-gray);">Code: ${p.client_code} · Created: ${date}</div>
            </div>
          </div>`;
        }).join('')
      : '<div style="padding:0.5rem 0.75rem;font-size:0.8rem;color:var(--soft-gray);">No projects yet</div>';
    return `
    <div class="studio-item" style="flex-direction:column;align-items:stretch;padding:0;">
      <div style="display:flex;align-items:center;gap:1rem;padding:1.1rem 1.2rem;">
        <div class="studio-avatar-placeholder"><i class="ri-camera-line icon-inline"></i></div>
        <div class="studio-info">
          <div class="studio-name">${s.displayName || s.name}</div>
          <div class="studio-details">Code: ${code} · ${subscriptionStatusLabel(status)} · Plan: ${plan ? plan.name : 'None'}${s.subscriptionEnd ? ' · ' + daysRemaining(s) + 'd left' : ''}</div>
          <div style="font-size:0.68rem;color:var(--platform-light);margin-top:0.2rem;word-break:break-all;">${studioLink}</div>
        </div>
        <div class="studio-actions" style="flex-direction:column;gap:0.35rem;">
          <button class="btn-small platform" onclick="openEditStudio('${code}')">Manage</button>
          <button class="btn-danger" onclick="deleteStudio('${code}')">Delete</button>
          <button class="btn-small" onclick="toggleStudioProjects('projects-${code}')" style="background:var(--soft-gray);">📋</button>
        </div>
      </div>
      <div id="projects-${code}" style="display:none;border-top:1px solid var(--border);">
        <div style="padding:0.4rem 1.2rem;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--platform);background:rgba(74,63,107,0.05);">Projects (${studioProjects.length})</div>
        ${projectRows}
      </div>
    </div>`;
  }).join('');
}

function exportSubscribersCSV() {
  const rows = [['Studio Code','Name','Status','Plan','Price','Renewal/Expiry Date','Days Remaining']];
  Object.entries(studiosDB).forEach(([code, s]) => {
    const status = computeEffectiveStatus(s);
    const plan = getPlanById(s.subscriptionPlanId);
    rows.push([
      code, s.displayName || s.name, status, plan ? plan.name : 'None',
      plan ? plan.price : '', s.subscriptionEnd ? new Date(s.subscriptionEnd).toLocaleDateString('en-IN') : '',
      s.subscriptionEnd ? daysRemaining(s) : ''
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'subscribers.csv';
  a.click();
}

function toggleStudioProjects(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function openEditStudio(code) {
  const s = studiosDB[code];
  if (!s) return;
  document.getElementById('edit-studio-code-ref').value = code;
  document.getElementById('edit-studio-display-name').value = s.displayName || s.name || '';
  document.getElementById('edit-studio-password').value = '';

  const status = computeEffectiveStatus(s);
  const plan = getPlanById(s.subscriptionPlanId);
  const summaryEl = document.getElementById('edit-studio-sub-summary');
  summaryEl.innerHTML = `
    <div>Status: <strong>${subscriptionStatusLabel(status)}</strong></div>
    <div>Current Plan: <strong>${plan ? plan.name : 'None'}</strong></div>
    ${s.subscriptionEnd ? `<div>Renews / Expires: <strong>${new Date(s.subscriptionEnd).toLocaleDateString('en-IN')}</strong> (${daysRemaining(s)} days left)</div>` : ''}
  `;
  const planSelect = document.getElementById('edit-studio-sub-plan');
  planSelect.innerHTML = subscriptionPlans.filter(p => p.status === 'active').map(p =>
    `<option value="${p.id}">${p.name} — ${formatMoney(p.price, p.currency)}</option>`).join('') || '<option value="">No plans configured yet</option>';

  const histEl = document.getElementById('edit-studio-payment-history');
  const hist = s.paymentHistory || [];
  histEl.innerHTML = hist.length ? hist.map(h => `
    <div style="padding:0.4rem 0;border-bottom:1px solid var(--border);">
      ${new Date(h.date).toLocaleDateString('en-IN')} — ${h.plan} — ${formatMoney(h.price, h.currency)}
      <div style="font-size:0.7rem;color:var(--text3);">${h.note || ''}</div>
    </div>`).join('') : '<div style="color:var(--text3);">No payment history yet.</div>';

  const modal = document.getElementById('edit-studio-modal');
  modal.style.display = 'block';
  modal.scrollIntoView({ behavior: 'smooth' });
}

async function adminApplyPlanFromEdit() {
  const code = document.getElementById('edit-studio-code-ref').value;
  const planId = document.getElementById('edit-studio-sub-plan').value;
  if (!code || !planId) { showToast('Select a plan first'); return; }
  await activateSubscriptionPlan(code, planId, { note: 'Activated by Platform Admin' });
  openEditStudio(code);
  loadStudiosList();
}

async function saveEditStudio() {
  const code = document.getElementById('edit-studio-code-ref').value;
  if (!code || !studiosDB[code]) return;
  const displayName = document.getElementById('edit-studio-display-name').value.trim();
  const newPass = document.getElementById('edit-studio-password').value;
  const baseUpdate = { display_name: displayName };
  if (newPass) baseUpdate.password = newPass;

  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(baseUpdate)
    });
    await refreshStudiosDB();
    showToast('✅ Studio updated!');
    document.getElementById('edit-studio-modal').style.display = 'none';
    loadStudiosList();
    loadPlatformDashboard();
    loadPlatformStudiosStats();
  } catch(e) { showToast('Error updating studio: ' + e.message); }
}

async function loadPlatformStudiosStats() {
  const studios = Object.values(studiosDB);
  let revenue = 0;
  studios.forEach(s => {
    const status = computeEffectiveStatus(s);
    if (status === 'active' || status === 'trial') {
      const plan = getPlanById(s.subscriptionPlanId);
      if (plan) revenue += Number(plan.price) || 0;
    }
  });
  const sEl = document.getElementById('pstud-stat-studios');
  const rEl = document.getElementById('pstud-stat-revenue');
  if (sEl) sEl.textContent = studios.length;
  if (rEl) rEl.textContent = '₹' + revenue;

}

async function createStudio() {
  const name = document.getElementById('new-studio-name').value.trim();
  const code = document.getElementById('new-studio-code').value.trim().toUpperCase();
  const pass = document.getElementById('new-studio-pass').value;
  const studioWhatsapp  = (document.getElementById('new-studio-whatsapp')?.value || '').trim() || PLATFORM_WHATSAPP;
  const studioAddress   = (document.getElementById('new-studio-address')?.value || '').trim();
  const studioEmail     = (document.getElementById('new-studio-email')?.value || '').trim() || PLATFORM_EMAIL;
  const enableEnquiry   = document.getElementById('new-studio-enable-enquiry')?.checked || false;
  const enableDigital   = document.getElementById('new-studio-enable-digital')?.checked || false;
  const planId          = document.getElementById('new-studio-plan')?.value || '';
  if (!name || !code || !pass) { showToast('Please fill in all fields'); return; }
  if (studiosDB[code]) { showToast('That studio code already exists'); return; }
  const payload = { code, display_name: name, password: pass,
    logo_url: '', custom_folder1: 'Custom Folder 1',
    whatsapp: studioWhatsapp, address: studioAddress, email: studioEmail,
    enable_enquiry: enableEnquiry, enable_digital: enableDigital,
    subscription_status: 'none', payment_history: '[]' };
  try {
    await sbFetch('studios', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(payload) });
    await refreshStudiosDB();
    if (planId) {
      await activateSubscriptionPlan(code, planId, { note: 'Assigned at creation by Platform Admin' });
    }
    showToast('✅ Studio added!' + (planId ? '' : ' (no plan assigned yet)'));
    const baseUrl = window.location.origin + window.location.pathname;
    const studioLink = `${baseUrl}?studio=${code}`;
    document.getElementById('studio-link-text').textContent = studioLink;
    document.getElementById('studio-link-result').style.display = 'block';
    window._lastStudioLink = studioLink;
    document.getElementById('new-studio-name').value = '';
    document.getElementById('new-studio-code').value = '';
    document.getElementById('new-studio-pass').value = '';
    if (document.getElementById('new-studio-whatsapp')) document.getElementById('new-studio-whatsapp').value = '';
    if (document.getElementById('new-studio-address')) document.getElementById('new-studio-address').value = '';
    if (document.getElementById('new-studio-email')) document.getElementById('new-studio-email').value = '';
    if (document.getElementById('new-studio-enable-enquiry')) document.getElementById('new-studio-enable-enquiry').checked = false;
    if (document.getElementById('new-studio-enable-digital')) document.getElementById('new-studio-enable-digital').checked = false;
    if (document.getElementById('new-studio-plan')) document.getElementById('new-studio-plan').value = '';
    loadStudiosList();
    loadPlatformDashboard();
  } catch(e) {
    showToast('Error saving studio: ' + e.message);
  }
}

function copyStudioLink() {
  const link = window._lastStudioLink || '';
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => showToast('✅ Studio link copied!')).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('✅ Link copied!');
  });
}

async function deleteStudio(code) {
  if (!confirm(`Remove studio "${code}"? This cannot be undone.`)) return;
  try {
    await sbFetch(`studios?code=eq.${encodeURIComponent(code)}`, { method: 'DELETE', prefer: 'return=minimal' });
    await refreshStudiosDB();
    showToast('Studio removed');
    loadStudiosList();
  } catch(e) { showToast('Error removing studio: ' + e.message); }
}

// ══════════════════════════════════════════

//  PLATFORM SETTINGS
// ══════════════════════════════════════════
function loadPlatformSettings_form() {
  document.getElementById('platform-company-name').value = platformName;
  document.getElementById('platform-admin-user').value = PLATFORM_ADMIN_USER;
  if (platformLogoUrl) {
    document.getElementById('platform-logo-preview').src = platformLogoUrl;
    document.getElementById('platform-logo-preview').style.display = 'block';
    document.getElementById('platform-logo-placeholder').style.display = 'none';
  }
}

function savePlatformSettings() {
  const name = document.getElementById('platform-company-name').value.trim();
  const user = document.getElementById('platform-admin-user').value.trim();
  const pass = document.getElementById('platform-admin-pass').value;
  if (!name || !user) { showToast('Name and username are required'); return; }
  const settings = { name, adminUser: user, adminPass: pass || PLATFORM_ADMIN_PASS, logoUrl: platformLogoUrl };
  lsSet('platform_settings', settings);
  platformName = name; PLATFORM_ADMIN_USER = user;
  if (pass) PLATFORM_ADMIN_PASS = pass;
  applyPlatformBranding();
  showToast('✅ Settings saved!');
}

// ══════════════════════════════════════════

//  PLAN MANAGER (Platform Admin)
// ══════════════════════════════════════════
function renderPlanManagerList() {
  const el = document.getElementById('plan-manager-list');
  if (!el) return;
  if (!subscriptionPlans.length) { el.innerHTML = '<p style="color:var(--soft-gray);font-size:0.82rem;">No plans yet — create one above.</p>'; return; }
  const sorted = [...subscriptionPlans].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  el.innerHTML = sorted.map((p, i) => `
    <div class="studio-item" style="flex-direction:column;align-items:stretch;padding:1rem 1.2rem;border-left:4px solid ${p.color_theme || 'var(--accent)'};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="studio-name">${p.name} ${p.popular ? '⭐ Popular' : ''} ${p.recommended ? '🏆 Recommended' : ''}</div>
          <div class="studio-details">${formatMoney(p.price, p.currency)} / ${p.duration_days} days ${p.discount_percent ? '· ' + p.discount_percent + '% off' : ''}</div>
          ${p.offer_text ? `<div style="font-size:0.75rem;color:var(--accent);margin-top:0.2rem;">${p.offer_text}</div>` : ''}
          ${p.description ? `<div style="font-size:0.75rem;color:var(--text3);margin-top:0.2rem;">${p.description}</div>` : ''}
          <div style="font-size:0.72rem;margin-top:0.3rem;color:${p.status === 'active' ? 'var(--success)' : 'var(--danger)'};">${p.status === 'active' ? '🟢 Enabled' : '🔴 Disabled'}</div>
        </div>
        <div class="studio-actions" style="flex-direction:column;gap:0.35rem;">
          <button class="btn-small platform" onclick="openEditPlanPrompt('${p.id}')">Edit</button>
          <button class="btn-small" style="background:var(--soft-gray);" onclick="togglePlanStatus('${p.id}')">${p.status === 'active' ? 'Disable' : 'Enable'}</button>
          <button class="btn-small" onclick="movePlanOrder('${p.id}', -1)">↑</button>
          <button class="btn-small" onclick="movePlanOrder('${p.id}', 1)">↓</button>
          <button class="btn-danger" onclick="deleteSubscriptionPlan('${p.id}')">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

async function handleCreatePlan() {
  const name = document.getElementById('new-plan-name').value.trim();
  const duration = parseInt(document.getElementById('new-plan-duration').value) || 0;
  const price = parseFloat(document.getElementById('new-plan-price').value) || 0;
  const currency = document.getElementById('new-plan-currency').value.trim() || 'INR';
  const discount = parseFloat(document.getElementById('new-plan-discount').value) || 0;
  const offer = document.getElementById('new-plan-offer').value.trim();
  const description = document.getElementById('new-plan-description').value.trim();
  const popular = document.getElementById('new-plan-popular').checked;
  const recommended = document.getElementById('new-plan-recommended').checked;
  if (!name || !duration || !price) { showToast('Name, duration and price are required'); return; }
  const maxOrder = subscriptionPlans.reduce((m, p) => Math.max(m, p.display_order || 0), 0);
  await createSubscriptionPlan({
    name, duration_days: duration, price, currency, discount_percent: discount,
    trial_days: 0, offer_text: offer, description, popular, recommended,
    status: 'active', display_order: maxOrder + 1
  });
  ['new-plan-name','new-plan-duration','new-plan-price','new-plan-discount','new-plan-offer','new-plan-description']
    .forEach(id => document.getElementById(id).value = id === 'new-plan-currency' ? 'INR' : '');
  document.getElementById('new-plan-popular').checked = false;
  document.getElementById('new-plan-recommended').checked = false;
  renderPlanManagerList();
}

function openEditPlanPrompt(id) {
  const p = getPlanById(id);
  if (!p) return;
  const name = prompt('Plan name:', p.name); if (name === null) return;
  const price = prompt('Price:', p.price); if (price === null) return;
  const duration = prompt('Duration (days):', p.duration_days); if (duration === null) return;
  const offer = prompt('Offer text (blank for none):', p.offer_text || '');
  updateSubscriptionPlan(id, {
    name, price: parseFloat(price) || p.price, duration_days: parseInt(duration) || p.duration_days,
    offer_text: offer || ''
  }).then(renderPlanManagerList);
}

async function handlePlatformLogo(event) {
  const file = event.target.files[0];
  if (!file) return;
  const url = await uploadToCloudinary(file, 'platform-logos');
  if (url) {
    platformLogoUrl = url;
    const prev = document.getElementById('platform-logo-preview');
    prev.src = url; prev.style.display = 'block';
    document.getElementById('platform-logo-placeholder').style.display = 'none';
    showToast('Logo uploaded!');
    const settings = lsGet('platform_settings') || {};
    settings.logoUrl = url;
    lsSet('platform_settings', settings);
    applyPlatformBranding();
  }
}

// ══════════════════════════════════════════

//  PLATFORM STATS STUDIOS TAB
// ══════════════════════════════════════════

// ══════════════════════════════════════════
