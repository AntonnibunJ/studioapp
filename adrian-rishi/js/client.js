//  CLIENT: OWN PHOTOS UPLOAD
// ══════════════════════════════════════════
async function loadClientOwnPhotos() {
  const el = document.getElementById('client-own-photos');
  if (!el) return;
  const fn1 = document.getElementById('client-folder-name-1');
  if (fn1) fn1.value = customFolder1Name !== 'Custom Folder 1' ? customFolder1Name : '';
  try {
    const data = await sbFetch(`photos?project_id=eq.${currentProject.id}&category=like.client-%25&select=*&order=created_at.asc`);
    clientOwnPhotos = data;
    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="ri-image-line"></i></div><p>No photos uploaded yet</p></div>';
      return;
    }
    el.innerHTML = `<div class="photo-grid">${data.map((p,i) => `
      <div class="photo-card" id="client-own-card-${p.id}">
        <div class="photo-img-wrap" ${pmAttr({id:p.id,category:p.category,url:p.url,created_at:p.created_at,watermarked:p.watermarked})} onclick="openClientOwnPhoto(${i})">
          <img src="${cldThumb(p.url)}" loading="lazy" />
          <div class="photo-zoom-hint">🔍 View</div>
        </div>
        <div style="padding:0 0.5rem 0.5rem;padding-top:0.35rem;">
          <button class="btn-danger" style="width:100%;font-size:0.7rem;padding:0.35rem;" onclick="deleteClientOwnPhoto('${p.id}')"><i class="ri-delete-bin-line icon-inline"></i> Remove</button>
        </div>
      </div>`).join('')}
    </div>`;
  } catch(e) { el.innerHTML = '<p style="color:red;font-size:0.8rem;">Error loading.</p>'; }
}

function openClientOwnPhoto(index) {
  if (!clientOwnPhotos || !clientOwnPhotos.length) return;
  const urls = clientOwnPhotos.map(p => ({ url: p.url, id: p.id, category: 'My Photos' }));
  openLightboxFull(urls, index, 'My Photos', clientOwnPhotos[index]?.id || null);
}

async function deleteClientOwnPhoto(photoId) {
  if (!confirm('Remove this photo?')) return;
  try {
    await sbFetch(`photos?id=eq.${photoId}`, { method: 'DELETE', prefer: 'return=minimal' });
    showToast('Photo removed');
    const card = document.getElementById(`client-own-card-${photoId}`);
    if (card) card.remove();
  } catch(e) { showToast('Error removing photo'); }
}

function saveClientFolderNames() {
  const f1 = document.getElementById('client-folder-name-1').value.trim();
  if (f1) customFolder1Name = f1;
  updateCustomFolderLabels();
  showToast('✅ Folder name updated!');
}

async function handleClientUpload(event) {
  if (!requireActiveSubscription('Uploading photos')) { event.target.value = ''; return; }
  const folder  = 'client-' + (customFolder1Name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'custom');
  const files   = Array.from(event.target.files);
  if (!files.length) return;
  const progress = document.getElementById('client-upload-progress');
  const fill     = document.getElementById('client-upload-fill');
  const status   = document.getElementById('client-upload-status');
  progress.style.display = 'block';

  const cloudFolder = `wedding-studio/${currentProject.id}/${folder}`;
  const CONCURRENCY = 6;
  let nextIndex = 0;
  let done = 0;
  const uploadedUrls = [];

  async function uploadOne(file) {
    try {
      const uploadFile = await compressImageForUpload(file);
      const url = await uploadToCloudinary(uploadFile, cloudFolder);
      if (url) {
        await sbFetch('photos', { method: 'POST', body: JSON.stringify({ project_id: currentProject.id, category: folder, url, public_id: '' }) });
        uploadedUrls.push(url);
      }
    } catch(e) { console.error(e); }
    done++;
    status.textContent = `Uploading ${done} of ${files.length}…`;
    fill.style.width = `${(done / files.length) * 100}%`;
  }

  async function worker() {
    while (nextIndex < files.length) {
      await uploadOne(files[nextIndex++]);
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
  await Promise.all(workers);

  uploadedUrls.forEach(url => prewarmThumb(url));
  status.textContent = `✅ ${done} photo(s) uploaded!`;
  event.target.value = '';
  setTimeout(() => { progress.style.display = 'none'; fill.style.width = '0%'; }, 3000);
  loadClientOwnPhotos();
}

// ══════════════════════════════════════════
