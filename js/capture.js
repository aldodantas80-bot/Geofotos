// ========== Capture (Foto, Vídeo, Localização) ==========

// Estado da captura
let currentPhotos = []; // Múltiplas fotos
let currentPhotoCoords = null;
let currentPhotoAccuracy = null;
let currentPhotoLocationInfo = null;
let currentVideoData = null;
let currentVideoCoords = null;
let currentVideoAccuracy = null;
let currentVideoLocationInfo = null;
let currentLocationCoords = null;
let currentLocationAccuracy = null;
let currentLocationInfo = null;

// Tags selecionadas para cada tipo
let currentPhotoTags = [];
let currentVideoTags = [];
let currentLocationTags = [];

// Monitor de GPS em tempo real
let gpsWatchId = null;
let gpsMonitorPaused = false;
let lastGpsUpdate = null;

function startGpsMonitor() {
  if (!navigator.geolocation) {
    updateGpsMonitorUI({ error: 'GPS não suportado' });
    return;
  }

  // Mostra estado de busca inicial
  updateGpsMonitorUI({ searching: true });

  const options = {
    enableHighAccuracy: true,
    timeout: 30000,
    maximumAge: 0
  };

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      if (gpsMonitorPaused) return;

      lastGpsUpdate = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date()
      };

      updateGpsMonitorUI(lastGpsUpdate);
    },
    (error) => {
      if (gpsMonitorPaused) return;

      let errorMsg = 'Erro ao obter localização';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg = 'Permissão negada. Ative o GPS.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMsg = 'Localização indisponível';
          break;
        case error.TIMEOUT:
          errorMsg = 'Buscando sinal...';
          updateGpsMonitorUI({ searching: true, message: errorMsg });
          return;
      }
      updateGpsMonitorUI({ error: errorMsg });
    },
    options
  );
}

function stopGpsMonitor() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
}

function toggleGpsMonitor() {
  gpsMonitorPaused = !gpsMonitorPaused;
  const btn = document.getElementById('toggleGpsBtn');
  const iconWrapper = document.getElementById('gpsIconWrapper');
  const headerIndicator = document.getElementById('headerGpsIndicator');

  if (gpsMonitorPaused) {
    // Mostrar ícone de play
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>`;
    btn.title = 'Retomar monitoramento';
    if (iconWrapper) iconWrapper.className = 'gps-icon-wrapper';
    if (headerIndicator) headerIndicator.classList.remove('active');
    document.getElementById('gpsStatus').textContent = 'Pausado';
    document.getElementById('gpsStatus').className = 'gps-status waiting';
    document.getElementById('gpsBar').className = 'gps-bar';
  } else {
    // Mostrar ícone de pause
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="6" y="4" width="4" height="16"/>
      <rect x="14" y="4" width="4" height="16"/>
    </svg>`;
    btn.title = 'Pausar monitoramento';
    if (lastGpsUpdate) {
      updateGpsMonitorUI(lastGpsUpdate);
    } else {
      updateGpsMonitorUI({ searching: true });
    }
  }
}

function updateGpsMonitorUI(data) {
  const statusEl = document.getElementById('gpsStatus');
  const accuracyEl = document.getElementById('gpsAccuracy');
  const coordsEl = document.getElementById('gpsCoordsLive');
  const barEl = document.getElementById('gpsBar');
  const iconWrapper = document.getElementById('gpsIconWrapper');
  const headerIndicator = document.getElementById('headerGpsIndicator');

  if (data.error) {
    statusEl.textContent = data.error;
    statusEl.className = 'gps-status error';
    accuracyEl.textContent = '';
    coordsEl.textContent = '';
    barEl.className = 'gps-bar low';
    if (iconWrapper) iconWrapper.className = 'gps-icon-wrapper low';
    if (headerIndicator) headerIndicator.classList.remove('active');
    return;
  }

  if (data.searching) {
    statusEl.textContent = data.message || 'Buscando satélites...';
    statusEl.className = 'gps-status waiting';
    accuracyEl.textContent = '';
    coordsEl.textContent = '';
    barEl.className = 'gps-bar searching';
    if (iconWrapper) iconWrapper.className = 'gps-icon-wrapper searching';
    if (headerIndicator) headerIndicator.classList.remove('active');
    return;
  }

  const label = getAccuracyLabel(data.accuracy);
  const levelClass = data.accuracy <= 5 ? 'excellent' :
                     data.accuracy <= 15 ? 'good' :
                     data.accuracy <= 50 ? 'moderate' : 'low';

  statusEl.textContent = `${label.text}`;
  statusEl.className = `gps-status ${levelClass}`;
  accuracyEl.textContent = `±${Math.round(data.accuracy)}m`;
  coordsEl.textContent = `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`;
  barEl.className = `gps-bar ${levelClass}`;
  if (iconWrapper) iconWrapper.className = `gps-icon-wrapper ${levelClass}`;
  if (headerIndicator) headerIndicator.classList.add('active');
}

function initGpsMonitor() {
  document.getElementById('toggleGpsBtn').addEventListener('click', toggleGpsMonitor);
  startGpsMonitor();
}

// Renderizar galeria de fotos no preview
function renderPhotoGallery() {
  const gallery = document.getElementById('photoGallery');
  if (currentPhotos.length === 0) {
    gallery.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Nenhuma foto capturada</p>';
    return;
  }
  gallery.innerHTML = currentPhotos.map((photo, index) => `
    <div class="photo-gallery-item">
      <img src="${photo}" alt="Foto ${index + 1}">
      <button class="remove-photo" onclick="removePhoto(${index})">×</button>
    </div>
  `).join('');
}

// Remover foto específica
function removePhoto(index) {
  currentPhotos.splice(index, 1);
  renderPhotoGallery();
  if (currentPhotos.length === 0) {
    document.getElementById('photoPreview').style.display = 'none';
    currentPhotoCoords = null;
    currentPhotoAccuracy = null;
  }
}

// Renderizar tags selecionadas
function renderSelectedTags(containerId, tagsArray, type) {
  const container = document.getElementById(containerId);
  if (tagsArray.length === 0) {
    container.innerHTML = '<span style="color: var(--text-secondary); font-size: 12px;">Nenhuma tag selecionada</span>';
    return;
  }
  container.innerHTML = tagsArray.map(tag => `
    <span class="tag">
      ${tag}
      <span class="tag-remove" onclick="removeTag('${type}', '${tag}')">×</span>
    </span>
  `).join('');
}

// Renderizar sugestões de tags
async function renderSuggestedTags(containerId, inputId, type) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);
  const existingTags = await getAllTags();
  const currentTags = type === 'photo' ? currentPhotoTags : type === 'video' ? currentVideoTags : currentLocationTags;

  const availableTags = existingTags.filter(tag => !currentTags.includes(tag));

  if (availableTags.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = availableTags.slice(0, 10).map(tag => `
    <span class="suggested-tag" onclick="addTag('${type}', '${tag}')">${tag}</span>
  `).join('');
}

// Adicionar tag
function addTag(type, tag) {
  let tagsArray, containerId, suggestedId, inputId;

  if (type === 'photo') {
    tagsArray = currentPhotoTags;
    containerId = 'selectedTagsPhoto';
    suggestedId = 'suggestedTagsPhoto';
    inputId = 'tagInputPhoto';
  } else if (type === 'video') {
    tagsArray = currentVideoTags;
    containerId = 'selectedTagsVideo';
    suggestedId = 'suggestedTagsVideo';
    inputId = 'tagInputVideo';
  } else {
    tagsArray = currentLocationTags;
    containerId = 'selectedTagsLocation';
    suggestedId = 'suggestedTagsLocation';
    inputId = 'tagInputLocation';
  }

  if (!tagsArray.includes(tag)) {
    tagsArray.push(tag);
    addTagToDB(tag); // Salva no banco para sugestões futuras
    renderSelectedTags(containerId, tagsArray, type);
    renderSuggestedTags(suggestedId, inputId, type);
  }

  document.getElementById(inputId).value = '';
}

// Remover tag
function removeTag(type, tag) {
  let tagsArray, containerId, suggestedId, inputId;

  if (type === 'photo') {
    tagsArray = currentPhotoTags;
    containerId = 'selectedTagsPhoto';
    suggestedId = 'suggestedTagsPhoto';
    inputId = 'tagInputPhoto';
  } else if (type === 'video') {
    tagsArray = currentVideoTags;
    containerId = 'selectedTagsVideo';
    suggestedId = 'suggestedTagsVideo';
    inputId = 'tagInputVideo';
  } else {
    tagsArray = currentLocationTags;
    containerId = 'selectedTagsLocation';
    suggestedId = 'suggestedTagsLocation';
    inputId = 'tagInputLocation';
  }

  const index = tagsArray.indexOf(tag);
  if (index > -1) {
    tagsArray.splice(index, 1);
    renderSelectedTags(containerId, tagsArray, type);
    renderSuggestedTags(suggestedId, inputId, type);
  }
}

// Formatar indicador de precisão
function formatAccuracyIndicator(accuracy) {
  if (!accuracy) return '';
  const label = getAccuracyLabel(accuracy);
  return `<div class="accuracy-indicator" style="font-size: 12px; margin-top: 4px; color: ${label.color};">
    Precisão: ${label.icon} ${label.text} (~${Math.round(accuracy)}m)
  </div>`;
}

// Mostrar botões de geocodificação
function showGeocodeButtons(type) {
  const btnsContainer = document.getElementById(`${type}GeocodeButtons`);
  if (btnsContainer) {
    btnsContainer.style.display = 'flex';
  }
  // Limpar resultados anteriores
  const locInfo = document.getElementById(`${type}LocationInfo`);
  if (locInfo) locInfo.innerHTML = '';
}

// Esconder botões de geocodificação
function hideGeocodeButtons(type) {
  const btnsContainer = document.getElementById(`${type}GeocodeButtons`);
  if (btnsContainer) {
    btnsContainer.style.display = 'none';
  }
  const locInfo = document.getElementById(`${type}LocationInfo`);
  if (locInfo) locInfo.innerHTML = '';
}

// Buscar endereço sob demanda para captura
async function fetchCaptureAddress(type) {
  let coords, locationInfoRef;
  if (type === 'photo') {
    coords = currentPhotoCoords;
  } else if (type === 'video') {
    coords = currentVideoCoords;
  } else {
    coords = currentLocationCoords;
  }

  if (!coords) {
    showToast('Aguarde a localização');
    return;
  }

  const btn = document.getElementById(`${type}AddressBtn`);
  const locInfo = document.getElementById(`${type}LocationInfo`);

  btn.disabled = true;
  btn.innerHTML = '<span class="geocode-btn-loading">Buscando...</span>';

  try {
    const result = await getAddressInfo(coords.lat, coords.lng);

    // Merge no locationInfo
    if (type === 'photo') {
      if (!currentPhotoLocationInfo) currentPhotoLocationInfo = {};
      currentPhotoLocationInfo.address = result.address;
      currentPhotoLocationInfo.highway = result.highway;
      renderLocationInfoPreview('photoLocationInfo', currentPhotoLocationInfo);
    } else if (type === 'video') {
      if (!currentVideoLocationInfo) currentVideoLocationInfo = {};
      currentVideoLocationInfo.address = result.address;
      currentVideoLocationInfo.highway = result.highway;
      renderLocationInfoPreview('videoLocationInfo', currentVideoLocationInfo);
    } else {
      if (!currentLocationInfo) currentLocationInfo = {};
      currentLocationInfo.address = result.address;
      currentLocationInfo.highway = result.highway;
      renderLocationInfoPreview('locationLocationInfo', currentLocationInfo);
    }
  } catch (err) {
    if (locInfo) {
      locInfo.innerHTML = '<span class="location-info-empty">Não foi possível obter endereço</span>';
    }
  }

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg> Endereço`;
}

// Buscar referências próximas sob demanda para captura
async function fetchCaptureReferences(type) {
  let coords;
  if (type === 'photo') {
    coords = currentPhotoCoords;
  } else if (type === 'video') {
    coords = currentVideoCoords;
  } else {
    coords = currentLocationCoords;
  }

  if (!coords) {
    showToast('Aguarde a localização');
    return;
  }

  const btn = document.getElementById(`${type}ReferencesBtn`);
  const locInfo = document.getElementById(`${type}LocationInfo`);

  btn.disabled = true;
  btn.innerHTML = '<span class="geocode-btn-loading">Buscando...</span>';

  try {
    const pois = await findNearbyPOIs(coords.lat, coords.lng);

    // Merge no locationInfo
    if (type === 'photo') {
      if (!currentPhotoLocationInfo) currentPhotoLocationInfo = {};
      currentPhotoLocationInfo.pois = pois;
      renderLocationInfoPreview('photoLocationInfo', currentPhotoLocationInfo);
    } else if (type === 'video') {
      if (!currentVideoLocationInfo) currentVideoLocationInfo = {};
      currentVideoLocationInfo.pois = pois;
      renderLocationInfoPreview('videoLocationInfo', currentVideoLocationInfo);
    } else {
      if (!currentLocationInfo) currentLocationInfo = {};
      currentLocationInfo.pois = pois;
      renderLocationInfoPreview('locationLocationInfo', currentLocationInfo);
    }

    if (pois.length === 0) {
      showToast('Nenhuma referência encontrada em 100m');
    }
  } catch (err) {
    if (locInfo) {
      locInfo.innerHTML = '<span class="location-info-empty">Não foi possível buscar referências</span>';
    }
  }

  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg> Referências`;
}

// Inicializar captura
function initCapture() {
  // ========== Foto + Localização ==========
  const cameraInput = document.getElementById('cameraInput');
  const takePhotoBtn = document.getElementById('takePhotoBtn');
  const photoPreview = document.getElementById('photoPreview');
  const previewCoords = document.getElementById('previewCoords');
  const notesInput = document.getElementById('notesInput');

  takePhotoBtn.addEventListener('click', () => cameraInput.click());

  // Botão para adicionar mais fotos
  document.getElementById('addMorePhotosBtn').addEventListener('click', () => {
    cameraInput.click();
  });

  cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Converter para base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      currentPhotos.push(ev.target.result);
      renderPhotoGallery();
      photoPreview.style.display = 'block';

      if (currentPhotos.length === 1) {
        // Primeira foto - obtém localização
        notesInput.value = '';
        currentPhotoTags = [];
        renderSelectedTags('selectedTagsPhoto', currentPhotoTags, 'photo');
        renderSuggestedTags('suggestedTagsPhoto', 'tagInputPhoto', 'photo');
        previewCoords.innerHTML = 'Obtendo localização...';
        hideGeocodeButtons('photo');

        try {
          const pos = await getCurrentPosition();
          currentPhotoCoords = pos;
          currentPhotoAccuracy = pos.accuracy;
          currentPhotoLocationInfo = null;
          previewCoords.innerHTML = formatCoords(pos.lat, pos.lng) + formatAccuracyIndicator(pos.accuracy);
          showGeocodeButtons('photo');
        } catch (err) {
          previewCoords.innerHTML = err.message;
          currentPhotoCoords = null;
          currentPhotoAccuracy = null;
          currentPhotoLocationInfo = null;
        }
      }
    };
    reader.readAsDataURL(file);
    cameraInput.value = '';
  });

  // Botões de geocodificação - Foto
  document.getElementById('photoAddressBtn').addEventListener('click', () => fetchCaptureAddress('photo'));
  document.getElementById('photoReferencesBtn').addEventListener('click', () => fetchCaptureReferences('photo'));

  document.getElementById('cancelPhotoBtn').addEventListener('click', () => {
    photoPreview.style.display = 'none';
    currentPhotos = [];
    currentPhotoCoords = null;
    currentPhotoAccuracy = null;
    currentPhotoLocationInfo = null;
    currentPhotoTags = [];
    hideGeocodeButtons('photo');
    renderPhotoGallery();
  });

  document.getElementById('savePhotoBtn').addEventListener('click', async () => {
    if (!currentPhotoCoords) {
      showToast('Aguarde a localização');
      return;
    }

    if (currentPhotos.length === 0) {
      showToast('Capture pelo menos uma foto');
      return;
    }

    const record = {
      type: 'photo',
      photos: currentPhotos, // Array de fotos
      lat: currentPhotoCoords.lat,
      lng: currentPhotoCoords.lng,
      accuracy: currentPhotoAccuracy,
      notes: notesInput.value.trim(),
      tags: [...currentPhotoTags],
      locationInfo: currentPhotoLocationInfo,
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    photoPreview.style.display = 'none';
    currentPhotos = [];
    currentPhotoCoords = null;
    currentPhotoAccuracy = null;
    currentPhotoLocationInfo = null;
    currentPhotoTags = [];
    hideGeocodeButtons('photo');
    renderPhotoGallery();
  });

  // Event listeners para tags de foto
  document.getElementById('addTagBtnPhoto').addEventListener('click', () => {
    const input = document.getElementById('tagInputPhoto');
    const tag = input.value.trim();
    if (tag) {
      addTag('photo', tag);
    }
  });

  document.getElementById('tagInputPhoto').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const tag = e.target.value.trim();
      if (tag) {
        addTag('photo', tag);
      }
    }
  });

  // ========== Vídeo + Localização ==========
  const videoInput = document.getElementById('videoInput');
  const takeVideoBtn = document.getElementById('takeVideoBtn');
  const videoPreview = document.getElementById('videoPreview');
  const previewVideo = document.getElementById('previewVideo');
  const previewVideoCoords = document.getElementById('previewVideoCoords');
  const videoNotesInput = document.getElementById('videoNotesInput');

  takeVideoBtn.addEventListener('click', () => videoInput.click());

  videoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Converter para base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      currentVideoData = ev.target.result;
      previewVideo.src = currentVideoData;
      videoPreview.style.display = 'block';
      videoNotesInput.value = '';
      currentVideoTags = [];
      renderSelectedTags('selectedTagsVideo', currentVideoTags, 'video');
      renderSuggestedTags('suggestedTagsVideo', 'tagInputVideo', 'video');
      previewVideoCoords.innerHTML = 'Obtendo localização...';
      hideGeocodeButtons('video');

      try {
        const pos = await getCurrentPosition();
        currentVideoCoords = pos;
        currentVideoAccuracy = pos.accuracy;
        currentVideoLocationInfo = null;
        previewVideoCoords.innerHTML = formatCoords(pos.lat, pos.lng) + formatAccuracyIndicator(pos.accuracy);
        showGeocodeButtons('video');
      } catch (err) {
        previewVideoCoords.innerHTML = err.message;
        currentVideoCoords = null;
        currentVideoAccuracy = null;
        currentVideoLocationInfo = null;
      }
    };
    reader.readAsDataURL(file);
    videoInput.value = '';
  });

  // Botões de geocodificação - Vídeo
  document.getElementById('videoAddressBtn').addEventListener('click', () => fetchCaptureAddress('video'));
  document.getElementById('videoReferencesBtn').addEventListener('click', () => fetchCaptureReferences('video'));

  document.getElementById('cancelVideoBtn').addEventListener('click', () => {
    videoPreview.style.display = 'none';
    previewVideo.src = '';
    currentVideoData = null;
    currentVideoCoords = null;
    currentVideoAccuracy = null;
    currentVideoLocationInfo = null;
    currentVideoTags = [];
    hideGeocodeButtons('video');
  });

  document.getElementById('saveVideoBtn').addEventListener('click', async () => {
    if (!currentVideoCoords) {
      showToast('Aguarde a localização');
      return;
    }

    const record = {
      type: 'video',
      video: currentVideoData,
      lat: currentVideoCoords.lat,
      lng: currentVideoCoords.lng,
      accuracy: currentVideoAccuracy,
      notes: videoNotesInput.value.trim(),
      tags: [...currentVideoTags],
      locationInfo: currentVideoLocationInfo,
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    videoPreview.style.display = 'none';
    previewVideo.src = '';
    currentVideoData = null;
    currentVideoCoords = null;
    currentVideoAccuracy = null;
    currentVideoLocationInfo = null;
    currentVideoTags = [];
    hideGeocodeButtons('video');
  });

  // Event listeners para tags de vídeo
  document.getElementById('addTagBtnVideo').addEventListener('click', () => {
    const input = document.getElementById('tagInputVideo');
    const tag = input.value.trim();
    if (tag) {
      addTag('video', tag);
    }
  });

  document.getElementById('tagInputVideo').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const tag = e.target.value.trim();
      if (tag) {
        addTag('video', tag);
      }
    }
  });

  // ========== Apenas Localização ==========
  const locationPreview = document.getElementById('locationPreview');
  const locationCoords = document.getElementById('locationCoords');
  const locationNotesInput = document.getElementById('locationNotesInput');

  document.getElementById('getLocationBtn').addEventListener('click', async () => {
    locationPreview.style.display = 'block';
    locationCoords.innerHTML = 'Obtendo localização...';
    locationNotesInput.value = '';
    currentLocationTags = [];
    renderSelectedTags('selectedTagsLocation', currentLocationTags, 'location');
    renderSuggestedTags('suggestedTagsLocation', 'tagInputLocation', 'location');
    hideGeocodeButtons('location');

    try {
      const pos = await getCurrentPosition();
      currentLocationCoords = pos;
      currentLocationAccuracy = pos.accuracy;
      currentLocationInfo = null;
      locationCoords.innerHTML = formatCoords(pos.lat, pos.lng) + formatAccuracyIndicator(pos.accuracy);
      showGeocodeButtons('location');
    } catch (err) {
      locationCoords.innerHTML = err.message;
      currentLocationCoords = null;
      currentLocationAccuracy = null;
      currentLocationInfo = null;
    }
  });

  // Botões de geocodificação - Localização
  document.getElementById('locationAddressBtn').addEventListener('click', () => fetchCaptureAddress('location'));
  document.getElementById('locationReferencesBtn').addEventListener('click', () => fetchCaptureReferences('location'));

  document.getElementById('cancelLocationBtn').addEventListener('click', () => {
    locationPreview.style.display = 'none';
    currentLocationCoords = null;
    currentLocationAccuracy = null;
    currentLocationInfo = null;
    currentLocationTags = [];
    hideGeocodeButtons('location');
  });

  document.getElementById('saveLocationBtn').addEventListener('click', async () => {
    if (!currentLocationCoords) {
      showToast('Aguarde a localização');
      return;
    }

    const record = {
      type: 'location',
      lat: currentLocationCoords.lat,
      lng: currentLocationCoords.lng,
      accuracy: currentLocationAccuracy,
      notes: locationNotesInput.value.trim(),
      tags: [...currentLocationTags],
      locationInfo: currentLocationInfo,
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    locationPreview.style.display = 'none';
    currentLocationCoords = null;
    currentLocationAccuracy = null;
    currentLocationInfo = null;
    currentLocationTags = [];
    hideGeocodeButtons('location');
  });

  // Event listeners para tags de localização
  document.getElementById('addTagBtnLocation').addEventListener('click', () => {
    const input = document.getElementById('tagInputLocation');
    const tag = input.value.trim();
    if (tag) {
      addTag('location', tag);
    }
  });

  document.getElementById('tagInputLocation').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const tag = e.target.value.trim();
      if (tag) {
        addTag('location', tag);
      }
    }
  });

}
