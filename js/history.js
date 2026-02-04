// ========== History ==========

let currentModalRecordId = null;

// Filtros
let currentFilter = { search: '', type: 'all', sort: 'newest', tag: '' };

// Modo seleção
let selectionMode = false;
let selectedIds = [];

// Edição
let editingRecordId = null;
let editingTags = [];

// Função para filtrar registros
function filterRecords(records) {
  let filtered = [...records];

  // Filtro por busca
  if (currentFilter.search) {
    const search = currentFilter.search.toLowerCase();
    filtered = filtered.filter(r =>
      (r.notes && r.notes.toLowerCase().includes(search)) ||
      (r.tags && r.tags.some(t => t.toLowerCase().includes(search)))
    );
  }

  // Filtro por tipo
  if (currentFilter.type !== 'all') {
    filtered = filtered.filter(r => r.type === currentFilter.type);
  }

  // Filtro por tag
  if (currentFilter.tag) {
    filtered = filtered.filter(r => r.tags && r.tags.includes(currentFilter.tag));
  }

  // Ordenação
  if (currentFilter.sort === 'newest') {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (currentFilter.sort === 'oldest') {
    filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (currentFilter.sort === 'withNotes') {
    filtered.sort((a, b) => {
      const aHasNotes = a.notes && a.notes.trim().length > 0;
      const bHasNotes = b.notes && b.notes.trim().length > 0;
      if (aHasNotes && !bHasNotes) return -1;
      if (!aHasNotes && bHasNotes) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  return filtered;
}

// Obter foto principal (compatível com registros antigos)
function getMainPhoto(record) {
  if (record.photos && record.photos.length > 0) {
    return record.photos[0];
  }
  if (record.photo) {
    return record.photo;
  }
  return null;
}

// Obter todas as fotos (compatível com registros antigos)
function getAllPhotos(record) {
  if (record.photos && record.photos.length > 0) {
    return record.photos;
  }
  if (record.photo) {
    return [record.photo];
  }
  return [];
}

// Formatar indicador de precisão
function formatAccuracyBadge(accuracy) {
  if (!accuracy) return '';
  const label = getAccuracyLabel(accuracy);
  return `<span style="font-size: 10px; color: ${label.color};">${label.icon} ~${Math.round(accuracy)}m</span>`;
}

// Renderizar tags
function renderRecordTags(tags) {
  if (!tags || tags.length === 0) return '';
  return `<div class="record-tags" style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;">
    ${tags.map(tag => `<span class="tag" style="font-size: 10px; padding: 2px 6px;">${tag}</span>`).join('')}
  </div>`;
}

// Resumo de localização para listagem
function formatRecordLocationSummary(record) {
  if (!record.locationInfo) return '';
  const li = record.locationInfo;
  let parts = [];

  if (li.highway?.highway) {
    let hw = li.highway.highway;
    if (li.highway.milestone?.km) hw += ` KM ${li.highway.milestone.km}`;
    parts.push(`🛣️ ${hw}`);
  }

  if (li.address?.city) {
    let loc = li.address.city;
    if (li.address.state) loc += `/${li.address.state}`;
    parts.push(loc);
  }

  if (parts.length === 0) return '';
  return `<div class="record-location-summary" style="font-size:12px;color:var(--text-secondary);margin-bottom:var(--space-2);">${parts.join(' - ')}</div>`;
}

// Renderizar histórico
async function renderHistory() {
  const allRecords = await getAllRecords();
  const records = filterRecords(allRecords);
  const list = document.getElementById('recordsList');
  const empty = document.getElementById('emptyState');

  // Atualiza barra de seleção
  updateSelectionBar();

  if (records.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = records.map(r => {
    let mediaHtml = '';
    let typeLabel = '';
    let saveBtn = '';

    const mainPhoto = getMainPhoto(r);
    const photoCount = getAllPhotos(r).length;

    if (r.type === 'photo' && mainPhoto) {
      mediaHtml = `<div style="position: relative;">
        <img src="${mainPhoto}" alt="Foto">
        ${photoCount > 1 ? `<span style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">+${photoCount - 1}</span>` : ''}
      </div>`;
      typeLabel = 'Foto';
      saveBtn = `<button class="btn btn-ghost btn-small" onclick="saveMediaToGallery(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar</button>`;
    } else if (r.type === 'video') {
      mediaHtml = `<video src="${r.video}" controls></video>`;
      typeLabel = 'Vídeo';
      saveBtn = `<button class="btn btn-ghost btn-small" onclick="saveMediaToGallery(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar</button>`;
    } else {
      typeLabel = 'Localização';
    }

    const isSelected = selectedIds.includes(r.id);
    const selectableClass = selectionMode ? 'selectable' : '';
    const selectedClass = isSelected ? 'selected' : '';

    return `
      <div class="record-item ${selectableClass} ${selectedClass}" data-id="${r.id}" onclick="${selectionMode ? `toggleRecordSelection(${r.id})` : ''}">
        ${selectionMode ? '<div class="select-checkbox"></div>' : ''}
        ${mediaHtml}
        <div class="record-content">
          <span class="record-type ${r.type}">${typeLabel}</span>
          <div class="record-date">${new Date(r.createdAt).toLocaleString('pt-BR')} ${formatAccuracyBadge(r.accuracy)}</div>
          <div class="record-coords" onclick="event.stopPropagation(); copyToClipboard('${formatCoords(r.lat, r.lng)}')" style="cursor:pointer;" title="Clique para copiar">
            ${formatCoords(r.lat, r.lng)}
          </div>
          ${formatRecordLocationSummary(r)}
          ${r.notes ? `<div class="record-notes">${r.notes}</div>` : ''}
          ${renderRecordTags(r.tags)}
          <div class="btn-group" style="margin-top:12px;gap:8px;">
            <button class="btn btn-ghost btn-small" onclick="event.stopPropagation(); copyRecordData(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar</button>
            <button class="btn btn-ghost btn-small" onclick="event.stopPropagation(); openInMaps(${r.lat}, ${r.lng})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg> Mapa</button>
            ${saveBtn ? saveBtn.replace('onclick="', 'onclick="event.stopPropagation(); ') : ''}
            <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); shareRecord(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Enviar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Copiar dados do registro
async function copyRecordData(id) {
  const record = await getRecord(id);
  let text = `📍 Coordenadas: ${formatCoords(record.lat, record.lng)}`;
  if (record.accuracy) {
    text += ` (precisão: ~${Math.round(record.accuracy)}m)`;
  }
  if (record.locationInfo) {
    text += '\n' + formatLocationInfo(record.locationInfo);
  }
  if (record.notes) {
    text += `\n📝 Observações: ${record.notes}`;
  }
  if (record.tags && record.tags.length > 0) {
    text += `\n🏷️ Tags: ${record.tags.join(', ')}`;
  }
  text += `\n📅 ${new Date(record.createdAt).toLocaleString('pt-BR')}`;
  await copyToClipboard(text);
}

// Salvar mídia na galeria (download)
async function saveMediaToGallery(id) {
  const record = await getRecord(id);
  if (record.type !== 'photo' && record.type !== 'video') return;

  const dateStr = new Date(record.createdAt).toISOString().slice(0, 10);
  if (record.type === 'photo') {
    const photos = getAllPhotos(record);
    photos.forEach((photo, index) => {
      const filename = `geofoto_${dateStr}_${record.id}_${index + 1}.jpg`;
      downloadFile(photo, filename);
    });
    showToast(`${photos.length} foto(s) salva(s)!`);
  } else if (record.type === 'video') {
    const filename = `geovideo_${dateStr}_${record.id}.mp4`;
    downloadFile(record.video, filename);
    showToast('Vídeo salvo!');
  }
}

// Compartilhar registro
async function shareRecord(id) {
  const record = await getRecord(id);
  let text = `📍 Coordenadas: ${formatCoords(record.lat, record.lng)}`;
  if (record.accuracy) {
    text += ` (precisão: ~${Math.round(record.accuracy)}m)`;
  }
  if (record.locationInfo) {
    text += '\n' + formatLocationInfo(record.locationInfo);
  }
  if (record.notes) {
    text += `\n📝 Observações: ${record.notes}`;
  }
  if (record.tags && record.tags.length > 0) {
    text += `\n🏷️ Tags: ${record.tags.join(', ')}`;
  }
  text += `\n📅 ${new Date(record.createdAt).toLocaleString('pt-BR')}`;

  const mainPhoto = getMainPhoto(record);

  if ((record.type === 'photo' || record.type === 'video') && navigator.canShare) {
    try {
      // Converter base64 para blob
      const mediaData = record.type === 'photo' ? mainPhoto : record.video;
      const response = await fetch(mediaData);
      const blob = await response.blob();
      const isVideo = record.type === 'video';
      const filename = isVideo ? `geovideo_${Date.now()}.mp4` : `geofoto_${Date.now()}.jpg`;
      const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
      const file = new File([blob], filename, { type: mimeType });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'GeoFotos',
          text: text,
          files: [file]
        });
        return;
      }
    } catch (err) {
      console.log('Erro ao compartilhar com arquivo:', err);

      // Fallback iOS: baixar mídia + copiar texto
      if (isIOS && (record.type === 'photo' || record.type === 'video')) {
        await copyToClipboard(text);
        const mediaData = record.type === 'photo' ? mainPhoto : record.video;
        const ext = record.type === 'video' ? 'mp4' : 'jpg';
        downloadFile(mediaData, `geo${record.type}_${Date.now()}.${ext}`);
        showToast(`Texto copiado! ${record.type === 'video' ? 'Vídeo' : 'Foto'} salvo.`);
        return;
      }
    }
  }

  // Fallback: compartilhar só texto
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'GeoFotos',
        text: text
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        await copyToClipboard(text);
      }
    }
  } else {
    await copyToClipboard(text);
  }
}

// ========== Modo Seleção ==========

function toggleSelectionMode() {
  selectionMode = !selectionMode;
  selectedIds = [];
  const btn = document.getElementById('selectModeBtn');
  if (selectionMode) {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg> Cancelar`;
  } else {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg> Selecionar`;
  }
  renderHistory();
}

function toggleRecordSelection(id) {
  const index = selectedIds.indexOf(id);
  if (index > -1) {
    selectedIds.splice(index, 1);
  } else {
    selectedIds.push(id);
  }
  renderHistory();
}

function updateSelectionBar() {
  const bar = document.getElementById('selectionBar');
  const count = document.getElementById('selectedCount');

  if (selectionMode && selectedIds.length > 0) {
    bar.style.display = 'flex';
    count.textContent = `${selectedIds.length} selecionado(s)`;
  } else {
    bar.style.display = 'none';
  }
}

async function shareSelectedRecords() {
  if (selectedIds.length === 0) {
    showToast('Selecione pelo menos um registro');
    return;
  }

  let combinedText = '📍 GeoFotos - Registros Selecionados\n\n';

  for (const id of selectedIds) {
    const record = await getRecord(id);
    const icon = record.type === 'photo' ? '📸' : record.type === 'video' ? '🎬' : '📍';
    combinedText += `${icon} ${new Date(record.createdAt).toLocaleString('pt-BR')}\n`;
    combinedText += `   📍 ${formatCoords(record.lat, record.lng)}`;
    if (record.accuracy) {
      combinedText += ` (~${Math.round(record.accuracy)}m)`;
    }
    combinedText += '\n';
    if (record.locationInfo) {
      combinedText += '   ' + formatLocationInfo(record.locationInfo).replace(/\n/g, '\n   ') + '\n';
    }
    if (record.notes) {
      combinedText += `   📝 ${record.notes}\n`;
    }
    if (record.tags && record.tags.length > 0) {
      combinedText += `   🏷️ ${record.tags.join(', ')}\n`;
    }
    combinedText += '\n';
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'GeoFotos - Registros',
        text: combinedText
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        await copyToClipboard(combinedText);
      }
    }
  } else {
    await copyToClipboard(combinedText);
  }

  selectionMode = false;
  selectedIds = [];
  document.getElementById('selectModeBtn').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
    <polyline points="9 11 12 14 22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg> Selecionar`;
  renderHistory();
}

// ========== Edição ==========

async function openEditModal(id) {
  const record = await getRecord(id);
  editingRecordId = id;
  editingTags = record.tags ? [...record.tags] : [];

  document.getElementById('editNotesInput').value = record.notes || '';
  renderEditTags();
  renderEditSuggestedTags();

  document.getElementById('editModal').classList.add('show');
}

function renderEditTags() {
  const container = document.getElementById('editSelectedTags');
  if (editingTags.length === 0) {
    container.innerHTML = '<span style="color: var(--text-secondary); font-size: 12px;">Nenhuma tag</span>';
    return;
  }
  container.innerHTML = editingTags.map(tag => `
    <span class="tag">
      ${tag}
      <span class="tag-remove" onclick="removeEditTag('${tag}')">×</span>
    </span>
  `).join('');
}

async function renderEditSuggestedTags() {
  const container = document.getElementById('editSuggestedTags');
  const existingTags = await getAllTags();
  const availableTags = existingTags.filter(tag => !editingTags.includes(tag));

  if (availableTags.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = availableTags.slice(0, 10).map(tag => `
    <span class="suggested-tag" onclick="addEditTag('${tag}')">${tag}</span>
  `).join('');
}

function addEditTag(tag) {
  if (!editingTags.includes(tag)) {
    editingTags.push(tag);
    addTagToDB(tag);
    renderEditTags();
    renderEditSuggestedTags();
  }
  document.getElementById('editTagInput').value = '';
}

function removeEditTag(tag) {
  const index = editingTags.indexOf(tag);
  if (index > -1) {
    editingTags.splice(index, 1);
    renderEditTags();
    renderEditSuggestedTags();
  }
}

async function saveEdit() {
  if (!editingRecordId) return;

  const notes = document.getElementById('editNotesInput').value.trim();

  await updateRecord(editingRecordId, {
    notes: notes,
    tags: [...editingTags]
  });

  document.getElementById('editModal').classList.remove('show');
  document.getElementById('detailModal').classList.remove('show');
  showToast('Registro atualizado!');
  renderHistory();

  editingRecordId = null;
  editingTags = [];
}

// Renderizar locationInfo no modal de detalhes
function renderModalLocationInfo(locationInfo) {
  if (!locationInfo) return '';
  let html = '<div class="location-info-container" style="margin-top:12px;">';

  const displayAddr = getDisplayAddress(locationInfo.address);
  if (displayAddr) {
    html += `<div class="location-info-item">
      <div class="location-info-label">ENDEREÇO</div>
      <div class="location-info-value">${displayAddr}</div>
    </div>`;
  }

  if (locationInfo.highway?.highway) {
    let hwText = locationInfo.highway.highway;
    if (locationInfo.highway.milestone?.km) {
      hwText += ` - KM ${locationInfo.highway.milestone.km}`;
    }
    html += `<div class="location-info-item">
      <div class="location-info-label">RODOVIA</div>
      <div class="location-info-value">🛣️ ${hwText}</div>
    </div>`;
  }

  if (locationInfo.pois?.length > 0) {
    html += `<div class="location-info-item">
      <div class="location-info-label">REFERÊNCIAS PRÓXIMAS</div>
      ${locationInfo.pois.map(p => `<div class="location-info-poi">${p.icon} ${p.name} (${p.distance}m)</div>`).join('')}
    </div>`;
  }

  html += '</div>';
  return html;
}

// Buscar endereço para registro antigo que não tem locationInfo
async function fetchLocationInfoForRecord(id) {
  const container = document.getElementById('modalLocationInfo');
  if (!container) return;

  container.innerHTML = '<div style="margin-top:12px;"><span class="location-info-loading">Buscando endereço e referências...</span></div>';

  try {
    const record = await getRecord(id);
    const info = await getLocationInfo(record.lat, record.lng);

    // Salvar no registro
    await updateRecord(id, { locationInfo: info });

    // Renderizar no modal
    container.innerHTML = renderModalLocationInfo(info) ||
      '<div style="margin-top:12px;"><span class="location-info-empty">Nenhuma informação encontrada</span></div>';

    showToast('Endereço encontrado e salvo!');
    // Atualizar lista
    renderHistory();
  } catch (err) {
    container.innerHTML = '<div style="margin-top:12px;"><span class="location-info-empty">Não foi possível obter endereço (sem internet?)</span></div>';
  }
}

// Inicializar modal e eventos do histórico
function initHistory() {
  // Filtros
  document.getElementById('searchInput').addEventListener('input', (e) => {
    currentFilter.search = e.target.value;
    renderHistory();
  });

  document.getElementById('filterType').addEventListener('change', (e) => {
    currentFilter.type = e.target.value;
    renderHistory();
  });

  document.getElementById('filterSort').addEventListener('change', (e) => {
    currentFilter.sort = e.target.value;
    renderHistory();
  });

  // Modo seleção
  document.getElementById('selectModeBtn').addEventListener('click', toggleSelectionMode);
  document.getElementById('cancelSelectionBtn').addEventListener('click', () => {
    selectionMode = false;
    selectedIds = [];
    document.getElementById('selectModeBtn').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg> Selecionar`;
    renderHistory();
  });
  document.getElementById('shareSelectedBtn').addEventListener('click', shareSelectedRecords);

  // Modal de detalhes
  document.getElementById('recordsList').addEventListener('click', async (e) => {
    if (selectionMode) return;

    const item = e.target.closest('.record-item');
    if (!item || e.target.closest('.btn')) return;

    const id = parseInt(item.dataset.id);
    const record = await getRecord(id);
    currentModalRecordId = id;

    // Mostrar/esconder botão de salvar mídia
    const saveMediaBtn = document.getElementById('savePhotoModalBtn');
    if (record.type === 'photo') {
      saveMediaBtn.style.display = 'inline-flex';
      saveMediaBtn.textContent = '💾 Foto';
    } else if (record.type === 'video') {
      saveMediaBtn.style.display = 'inline-flex';
      saveMediaBtn.textContent = '💾 Vídeo';
    } else {
      saveMediaBtn.style.display = 'none';
    }

    let mediaHtml = '';
    if (record.type === 'photo') {
      const photos = getAllPhotos(record);
      if (photos.length === 1) {
        mediaHtml = `<img src="${photos[0]}" style="width:100%;border-radius:8px;margin-bottom:12px;">`;
      } else {
        mediaHtml = `<div class="photo-gallery" style="margin-bottom:12px;">
          ${photos.map(photo => `
            <div class="photo-gallery-item">
              <img src="${photo}" alt="Foto">
            </div>
          `).join('')}
        </div>`;
      }
    } else if (record.type === 'video') {
      mediaHtml = `<video src="${record.video}" controls style="width:100%;border-radius:8px;margin-bottom:12px;"></video>`;
    }

    const accuracyHtml = record.accuracy ?
      `<div style="margin-top:8px;font-size:12px;">${formatAccuracyBadge(record.accuracy)}</div>` : '';

    const tagsHtml = record.tags && record.tags.length > 0 ?
      `<div style="margin-top:12px;"><strong>Tags:</strong>${renderRecordTags(record.tags)}</div>` : '';

    const locationInfoHtml = record.locationInfo ? renderModalLocationInfo(record.locationInfo) :
      `<div style="margin-top:12px;">
        <button class="btn btn-outline btn-small" onclick="fetchLocationInfoForRecord(${record.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Buscar endereço
        </button>
      </div>`;

    const content = `
      ${mediaHtml}
      <div class="coords-display" onclick="copyToClipboard('${formatCoords(record.lat, record.lng)}')" style="cursor:pointer;">
        <div class="label">COORDENADAS (clique para copiar)</div>
        ${formatCoords(record.lat, record.lng)}
        ${accuracyHtml}
      </div>
      <div id="modalLocationInfo">${locationInfoHtml}</div>
      ${record.notes ? `<div style="margin-top:12px;"><strong>Observações:</strong><p style="margin-top:4px;white-space:pre-wrap;">${record.notes}</p></div>` : ''}
      ${tagsHtml}
      <div style="margin-top:12px;">
        <button class="btn btn-secondary btn-small" onclick="openInMaps(${record.lat}, ${record.lng})">🗺️ Abrir no Mapa</button>
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--text-secondary);">${new Date(record.createdAt).toLocaleString('pt-BR')}</div>
    `;

    document.getElementById('modalContent').innerHTML = content;
    document.getElementById('detailModal').classList.add('show');
  });

  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('detailModal').classList.remove('show');
  });

  document.getElementById('deleteRecordBtn').addEventListener('click', async () => {
    if (confirm('Excluir este registro?')) {
      await deleteRecord(currentModalRecordId);
      document.getElementById('detailModal').classList.remove('show');
      renderHistory();
      showToast('Registro excluído');
    }
  });

  document.getElementById('shareRecordBtn').addEventListener('click', () => {
    shareRecord(currentModalRecordId);
  });

  document.getElementById('savePhotoModalBtn').addEventListener('click', () => {
    saveMediaToGallery(currentModalRecordId);
  });

  document.getElementById('editRecordBtn').addEventListener('click', () => {
    openEditModal(currentModalRecordId);
  });

  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      document.getElementById('detailModal').classList.remove('show');
    }
  });

  // Modal de edição
  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    document.getElementById('editModal').classList.remove('show');
    editingRecordId = null;
    editingTags = [];
  });

  document.getElementById('saveEditBtn').addEventListener('click', saveEdit);

  // Botão cancelar no footer do modal de edição
  const cancelEditModalBtn = document.getElementById('cancelEditModalBtn');
  if (cancelEditModalBtn) {
    cancelEditModalBtn.addEventListener('click', () => {
      document.getElementById('editModal').classList.remove('show');
      editingRecordId = null;
      editingTags = [];
    });
  }

  document.getElementById('addEditTagBtn').addEventListener('click', () => {
    const input = document.getElementById('editTagInput');
    const tag = input.value.trim();
    if (tag) {
      addEditTag(tag);
    }
  });

  document.getElementById('editTagInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const tag = e.target.value.trim();
      if (tag) {
        addEditTag(tag);
      }
    }
  });

  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      document.getElementById('editModal').classList.remove('show');
      editingRecordId = null;
      editingTags = [];
    }
  });
}
