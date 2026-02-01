// ========== History ==========

let currentModalRecordId = null;

// Renderizar histórico
async function renderHistory() {
  const records = await getAllRecords();
  const list = document.getElementById('recordsList');
  const empty = document.getElementById('emptyState');

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

    if (r.type === 'photo') {
      mediaHtml = `<img src="${r.photo}" alt="Foto">`;
      typeLabel = '📸 Foto';
      saveBtn = `<button class="btn btn-secondary btn-small" onclick="saveMediaToGallery(${r.id})">💾 Foto</button>`;
    } else if (r.type === 'video') {
      mediaHtml = `<video src="${r.video}" controls></video>`;
      typeLabel = '🎬 Vídeo';
      saveBtn = `<button class="btn btn-secondary btn-small" onclick="saveMediaToGallery(${r.id})">💾 Vídeo</button>`;
    } else {
      typeLabel = '📍 Localização';
    }

    return `
      <div class="record-item" data-id="${r.id}">
        ${mediaHtml}
        <div class="record-content">
          <span class="record-type ${r.type}">${typeLabel}</span>
          <div class="record-date">${new Date(r.createdAt).toLocaleString('pt-BR')}</div>
          <div class="record-coords" onclick="copyToClipboard('${formatCoords(r.lat, r.lng)}')" style="cursor:pointer;" title="Clique para copiar">
            ${formatCoords(r.lat, r.lng)}
          </div>
          ${r.notes ? `<div class="record-notes">${r.notes}</div>` : ''}
          <div class="btn-group">
            <button class="btn btn-secondary btn-small" onclick="copyRecordData(${r.id})">📋 Copiar</button>
            ${saveBtn}
            <button class="btn btn-primary btn-small" onclick="shareRecord(${r.id})">📤 Enviar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Copiar dados do registro
async function copyRecordData(id) {
  const record = await getRecord(id);
  const text = `📍 Coordenadas: ${formatCoords(record.lat, record.lng)}${record.notes ? `\n📝 Observações: ${record.notes}` : ''}\n📅 ${new Date(record.createdAt).toLocaleString('pt-BR')}`;
  await copyToClipboard(text);
}

// Salvar mídia na galeria (download)
async function saveMediaToGallery(id) {
  const record = await getRecord(id);
  if (record.type !== 'photo' && record.type !== 'video') return;

  const dateStr = new Date(record.createdAt).toISOString().slice(0, 10);
  if (record.type === 'photo') {
    const filename = `geofoto_${dateStr}_${record.id}.jpg`;
    downloadFile(record.photo, filename);
    showToast('Foto salva!');
  } else if (record.type === 'video') {
    const filename = `geovideo_${dateStr}_${record.id}.mp4`;
    downloadFile(record.video, filename);
    showToast('Vídeo salvo!');
  }
}

// Compartilhar registro
async function shareRecord(id) {
  const record = await getRecord(id);
  const text = `📍 Coordenadas: ${formatCoords(record.lat, record.lng)}${record.notes ? `\n📝 Observações: ${record.notes}` : ''}\n📅 ${new Date(record.createdAt).toLocaleString('pt-BR')}`;

  if ((record.type === 'photo' || record.type === 'video') && navigator.canShare) {
    try {
      // Converter base64 para blob
      const mediaData = record.type === 'photo' ? record.photo : record.video;
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
        const mediaData = record.type === 'photo' ? record.photo : record.video;
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

// Inicializar modal e eventos do histórico
function initHistory() {
  document.getElementById('recordsList').addEventListener('click', async (e) => {
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
      mediaHtml = `<img src="${record.photo}" style="width:100%;border-radius:8px;margin-bottom:12px;">`;
    } else if (record.type === 'video') {
      mediaHtml = `<video src="${record.video}" controls style="width:100%;border-radius:8px;margin-bottom:12px;"></video>`;
    }

    const content = `
      ${mediaHtml}
      <div class="coords-display" onclick="copyToClipboard('${formatCoords(record.lat, record.lng)}')" style="cursor:pointer;">
        <div class="label">COORDENADAS (clique para copiar)</div>
        ${formatCoords(record.lat, record.lng)}
      </div>
      ${record.notes ? `<div style="margin-top:12px;"><strong>Observações:</strong><p style="margin-top:4px;white-space:pre-wrap;">${record.notes}</p></div>` : ''}
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

  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      document.getElementById('detailModal').classList.remove('show');
    }
  });
}
