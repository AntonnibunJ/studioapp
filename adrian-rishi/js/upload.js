//  WATERMARK TOGGLE
// ══════════════════════════════════════════
// Studio owner's personal toggle for viewing/downloading Client Picks (bride/groom
// selections) without the watermark. This is saved per-studio in localStorage and is
// purely for the owner's own use (editing/delivery) — it never affects what the client sees.
function ownerPicksWmKey() {
  return 'owner_picks_wm_disabled_' + (currentStudio ? currentStudio.code : '');
}

function loadOwnerPicksWmPref() {
  ownerPicksWmDisabled = !!lsGet(ownerPicksWmKey());
  setOwnerPicksWatermark(!ownerPicksWmDisabled, false);
}

function setOwnerPicksWatermark(visible, persist = true) {
  ownerPicksWmDisabled = !visible;
  const enableBtn  = document.getElementById('opwm-enable-btn');
  const disableBtn = document.getElementById('opwm-disable-btn');
  const status     = document.getElementById('opwm-status');
  if (!enableBtn) return;
  if (visible) {
    enableBtn.style.background = 'var(--accent)'; enableBtn.style.borderColor = 'var(--accent)'; enableBtn.style.color = 'white';
    disableBtn.style.background = 'transparent'; disableBtn.style.borderColor = 'var(--border)'; disableBtn.style.color = 'var(--text2)';
    status.textContent = 'Currently showing: Watermark Visible';
  } else {
    disableBtn.style.background = 'var(--accent)'; disableBtn.style.borderColor = 'var(--accent)'; disableBtn.style.color = 'white';
    enableBtn.style.background = 'transparent'; enableBtn.style.borderColor = 'var(--border)'; enableBtn.style.color = 'var(--text2)';
    status.textContent = 'Currently showing: Watermark Removed (your view only)';
  }
  if (persist) {
    lsSet(ownerPicksWmKey(), ownerPicksWmDisabled);
    showToast(visible ? '🔒 Watermark will show in Client Picks' : '🔓 Watermark removed — for your view only');
    loadOwnerSelections();
  }
}





function setWatermark(enabled) {
  watermarkEnabled = enabled;
  const enableBtn  = document.getElementById('wm-enable-btn');
  const disableBtn = document.getElementById('wm-disable-btn');
  const status     = document.getElementById('wm-status');
  if (!enableBtn) return;
  if (enabled) {
    enableBtn.style.background  = 'var(--gold)';
    enableBtn.style.color       = 'white';
    enableBtn.style.borderColor = 'var(--gold)';
    disableBtn.style.background = 'var(--cream)';
    disableBtn.style.color      = 'var(--soft-gray)';
    disableBtn.style.borderColor = 'var(--border)';
    status.textContent = '🔒 Watermark: Enabled — watermark image (or studio name) will appear on photos';
    status.style.color = 'var(--gold)';
    showToast('Watermark enabled');
  } else {
    disableBtn.style.background  = 'var(--danger)';
    disableBtn.style.color       = 'white';
    disableBtn.style.borderColor = 'var(--danger)';
    enableBtn.style.background   = 'var(--cream)';
    enableBtn.style.color        = 'var(--soft-gray)';
    enableBtn.style.borderColor  = 'var(--border)';
    status.textContent = '🔓 Watermark: Disabled — photos will upload without watermark';
    status.style.color = 'var(--danger)';
    showToast('Watermark disabled');
  }
}
async function uploadToCloudinary(file, folder = 'wedding-studio') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_PRESET);
  formData.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    // Surface Cloudinary's actual error message (e.g. rate limit, invalid
    // preset, file too large) instead of a generic failure.
    throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
  }
  return data.secure_url;
}

// Resizes/re-compresses oversized photos in the browser before upload, so
// large phone-camera files (often 8-20MB at 12-48MP) transfer much faster
// over mobile networks. Caps the long edge at 3000px (still far more than
// needed for full-screen viewing or standard print sizes) at 88% JPEG
// quality — visually indistinguishable from the original at normal viewing
// distances, but a fraction of the upload size. EXIF orientation is
// preserved via createImageBitmap so photos never end up sideways.
// Falls back to the original, untouched file if anything goes wrong, if
// the browser lacks support, or if compressing wouldn't actually shrink it.
async function compressImageForUpload(file, maxDimension = 3000, quality = 0.88) {
  if (!file.type || !file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    if (scale >= 1) { bitmap.close?.(); return file; }
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    console.warn('Client-side compression skipped for', file.name, e);
    return file;
  }
}

// Uploads + saves a single file, retrying once on failure before giving up.
// Fires background requests for the thumbnail-sized AND lightbox-preview
// sized URLs so Cloudinary generates and caches both immediately, instead
// of waiting for the first grid view / first lightbox open to trigger the
// resize on-demand. Fire-and-forget: if this fails for any reason it's
// silently ignored — everything still works, it just generates on first
// view like before.
function prewarmThumb(url) {
  try {
    const img1 = new Image();
    img1.src = cldThumb(url);
    const img2 = new Image();
    img2.src = cldPreview(url);
  } catch (e) { /* non-critical, ignore */ }
}

async function uploadOneFile(file, projectId, category, folder, attempt = 1) {
  try {
    const uploadFile = await compressImageForUpload(file);
    let url = await uploadToCloudinary(uploadFile, folder);
    if (!url) throw new Error('No URL returned from Cloudinary');
    const finalUrl = watermarkEnabled ? await applyWatermarkToUrl(url) : url;
    await sbFetch('photos', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        category,
        url: finalUrl,
        public_id: '',
        studio_code: currentStudio.code,
        watermarked: watermarkEnabled
      })
    });
    return { file, success: true, url: finalUrl };
  } catch (e) {
    if (attempt < 3) {
      // Wait a moment before retrying — if the failure was caused by too
      // many simultaneous requests (rate limiting), retrying instantly
      // just fails again for the same reason. A short backoff gives the
      // server room to recover. Up to 2 retries (3 attempts total).
      await new Promise(r => setTimeout(r, 1500 * attempt));
      return uploadOneFile(file, projectId, category, folder, attempt + 1);
    }
    console.error('Upload failed for', file.name, e);
    return { file, success: false, error: e?.message || String(e) };
  }
}

async function handleFileUpload(event) {
  if (!requireActiveSubscription('Uploading photos')) { event.target.value = ''; return; }
  const projectId = document.getElementById('upload-project').value;
  const category  = document.getElementById('upload-category').value.trim();
  if (!projectId) { showToast('Please select a project first'); return; }
  if (!category) { showToast('Please enter a category name'); return; }
  const files = Array.from(event.target.files);
  if (!files.length) return;
  addKnownCategory(category);
  const progress = document.getElementById('upload-progress');
  const fill     = document.getElementById('upload-fill');
  const status   = document.getElementById('upload-status');
  progress.style.display = 'block';
  fill.style.width = '0%';

  const folder = `wedding-studio/${currentStudio.code}/${projectId}/${category}`;
  const CONCURRENCY = 6;
  let nextIndex = 0;
  let done = 0;
  let failed = 0;
  const failureReasons = [];
  const uploadedUrls = [];
  const startTime = Date.now();

  function updateStatus() {
    const elapsedSec = (Date.now() - startTime) / 1000;
    const rate = done > 0 ? done / elapsedSec : 0; // files/sec
    const remaining = files.length - done;
    const etaSec = rate > 0 ? Math.round(remaining / rate) : null;
    const etaText = etaSec !== null && remaining > 0 ? ` — ~${etaSec}s remaining` : '';
    status.textContent = `Uploading ${done} of ${files.length}…${etaText}`;
    fill.style.width = `${(done / files.length) * 100}%`;
  }

  // Worker pulls the next file off the queue until none remain — this keeps
  // exactly CONCURRENCY uploads in flight at once regardless of how long
  // any individual upload takes.
  async function worker() {
    while (nextIndex < files.length) {
      const file = files[nextIndex++];
      const result = await uploadOneFile(file, projectId, category, folder);
      if (!result.success) { failed++; failureReasons.push(result.error); }
      else { uploadedUrls.push(result.url); }
      done++;
      updateStatus();
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
  await Promise.all(workers);

  // Prewarm thumbnails only after the upload batch itself is fully done, so
  // these background requests never compete for bandwidth with the actual
  // uploads in progress — keeps the upload phase as fast as possible.
  uploadedUrls.forEach(url => prewarmThumb(url));

  const okCount = files.length - failed;
  if (failed > 0) {
    const uniqueReasons = [...new Set(failureReasons)].slice(0, 2).join('; ');
    status.textContent = `✅ ${okCount} uploaded, ⚠️ ${failed} failed — ${uniqueReasons}`;
  } else {
    status.textContent = `✅ ${okCount} photo(s) uploaded!${watermarkEnabled ? ' (with watermark)' : ''}`;
  }
  event.target.value = '';
  setTimeout(() => { progress.style.display = 'none'; fill.style.width = '0%'; }, failed > 0 ? 8000 : 3000);
}

// ══════════════════════════════════════════

//  WATERMARK IMAGE UPLOAD
// ══════════════════════════════════════════
async function handleWatermarkUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  showToast('Uploading watermark...');
  const url = await uploadToCloudinary(file, `studio-watermarks/${currentStudio.code}`);
  if (url) {
    document.getElementById('watermark-url').value = url;
    const prev = document.getElementById('watermark-preview');
    prev.src = url; prev.style.display = 'block';
    document.getElementById('watermark-placeholder').style.display = 'none';
    document.getElementById('watermark-status').textContent = '✅ Watermark image uploaded — saved with branding';
    // Save watermark URL to studio in DB
    try {
      await sbFetch(`studios?code=eq.${encodeURIComponent(currentStudio.code)}`, {
        method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ watermark_url: url })
      });
      studiosDB[currentStudio.code].watermarkUrl = url;
      currentStudio.watermarkUrl = url;
      saveSession();
      showToast('✅ Watermark saved!');
    } catch(e) { showToast('Watermark uploaded but error saving to DB'); }
  } else {
    showToast('Error uploading watermark');
  }
}

// Strip watermark transformation from a Cloudinary URL (fallback for broken watermark URLs)
function stripWatermark(url) {
  if (!url) return url;
  // Remove any /upload/TRANSFORMATION/ segment back to clean /upload/
  return url.replace(/\/upload\/(?:l_[^/]+,?[^/]*\/)+/, '/upload/');
}

// Override applyWatermarkToUrl to use uploaded watermark image if available
async function applyWatermarkToUrl(imageUrl) {
  if (!watermarkEnabled || !imageUrl || !imageUrl.includes('cloudinary.com')) return imageUrl;
  const wmUrl = currentStudio.watermarkUrl || '';
  if (wmUrl && wmUrl.includes('cloudinary.com')) {
    // Extract public ID from watermark URL
    const match = wmUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    if (match) {
      const wmPublicId = match[1].replace(/\//g, ':');
      return imageUrl.replace('/upload/', `/upload/l_${wmPublicId},o_60,g_south_east,w_150,x_15,y_15/`);
    }
  }
  // Fall back to text watermark
  // Cloudinary text overlay needs special encoding: spaces → %20, NO encodeURIComponent
  const studioName = (currentStudio.displayName || currentStudio.name || 'Studio')
    .replace(/[^a-zA-Z0-9 ]/g, '')  // strip special chars
    .trim()
    .replace(/ /g, '%20');           // spaces must be %20 for Cloudinary overlay
  if (!studioName) return imageUrl;
  return imageUrl.replace('/upload/', `/upload/l_text:Arial_28_bold:${studioName},co_white,o_60,g_south_east,x_15,y_15/`);
}

// ══════════════════════════════════════════
