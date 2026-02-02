// ========== Capture (Foto, Vídeo, Localização) ==========

// Estado da captura
let currentPhotos = []; // Múltiplas fotos
let currentPhotoCoords = null;
let currentPhotoAccuracy = null;
let currentVideoData = null;
let currentVideoCoords = null;
let currentVideoAccuracy = null;
let currentLocationCoords = null;
let currentLocationAccuracy = null;

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
  const icon = document.getElementById('gpsIcon');

  if (gpsMonitorPaused) {
    btn.textContent = '▶️';
    btn.title = 'Retomar monitoramento';
    icon.classList.add('paused');
    icon.classList.remove('active');
    document.getElementById('gpsStatus').textContent = 'Pausado';
    document.getElementById('gpsStatus').className = 'gps-status waiting';
    document.getElementById('gpsBar').className = 'gps-bar';
  } else {
    btn.textContent = '⏸️';
    btn.title = 'Pausar monitoramento';
    icon.classList.remove('paused');
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
  const iconEl = document.getElementById('gpsIcon');

  if (data.error) {
    statusEl.textContent = data.error;
    statusEl.className = 'gps-status error';
    accuracyEl.textContent = '';
    coordsEl.textContent = '';
    barEl.className = 'gps-bar low';
    iconEl.classList.remove('active');
    return;
  }

  if (data.searching) {
    statusEl.textContent = data.message || 'Buscando satélites...';
    statusEl.className = 'gps-status waiting';
    accuracyEl.textContent = '';
    coordsEl.textContent = '';
    barEl.className = 'gps-bar searching';
    iconEl.classList.add('active');
    return;
  }

  const label = getAccuracyLabel(data.accuracy);
  const levelClass = data.accuracy <= 5 ? 'excellent' :
                     data.accuracy <= 15 ? 'good' :
                     data.accuracy <= 50 ? 'moderate' : 'low';

  statusEl.textContent = `${label.icon} ${label.text}`;
  statusEl.className = `gps-status ${levelClass}`;
  accuracyEl.textContent = `±${Math.round(data.accuracy)}m`;
  coordsEl.textContent = `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`;
  barEl.className = `gps-bar ${levelClass}`;
  iconEl.classList.add('active');
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

// ========== KM Aproximado da Rodovia ==========

// Mostra o KM aproximado para a localização atual
// Só exibe se estiver realmente próximo da rodovia (até 500m)
function showKmApproximado(lat, lng, type) {
  const displayId = `${type}KmDisplay`;
  const infoId = `${type}KmInfo`;
  const nearbyId = `${type}KmNearby`;
  const display = document.getElementById(displayId);
  const info = document.getElementById(infoId);
  const nearby = document.getElementById(nearbyId);

  if (!display || !window.HighwayPoints) {
    return;
  }

  const suggestion = window.HighwayPoints.getSuggestion(lat, lng);

  // Só mostra se estiver a menos de 500m da rodovia
  // Distância maior que isso significa que o usuário não está na rodovia
  if (!suggestion || suggestion.distancia > 0.5) {
    display.style.display = 'none';
    return;
  }

  display.style.display = 'block';

  // Definir precisão visual
  display.setAttribute('data-precisao', suggestion.precisao || 'alta');

  // Info principal
  const prefix = suggestion.estimado ? '~' : '';
  info.textContent = `BR-${suggestion.br}, km ${prefix}${suggestion.km.toFixed(1)}`;

  // Ponto próximo
  if (suggestion.pontoProximo) {
    nearby.textContent = `Próximo a: ${suggestion.pontoProximo.descricao}`;
  } else {
    nearby.textContent = '';
  }

  // Armazenar a sugestão para uso posterior
  display.dataset.suggestion = JSON.stringify(suggestion);
}

// Usar referência do KM nas observações
function useKmReference(type) {
  const displayId = `${type}KmDisplay`;
  const display = document.getElementById(displayId);
  const notesInputId = type === 'photo' ? 'notesInput' :
                       type === 'video' ? 'videoNotesInput' : 'locationNotesInput';
  const notesInput = document.getElementById(notesInputId);

  if (!display || !notesInput) return;

  try {
    const suggestion = JSON.parse(display.dataset.suggestion);
    if (suggestion) {
      const prefix = suggestion.estimado ? '~' : '';
      const reference = `BR-${suggestion.br}, km ${prefix}${suggestion.km.toFixed(1)}`;
      const nearby = suggestion.pontoProximo ? ` - ${suggestion.pontoProximo.descricao}` : '';

      // Adicionar no início das observações
      const currentNotes = notesInput.value.trim();
      if (currentNotes) {
        notesInput.value = `${reference}${nearby}\n${currentNotes}`;
      } else {
        notesInput.value = `${reference}${nearby}`;
      }

      showToast('Referência adicionada!');
    }
  } catch (e) {
    console.error('Erro ao usar referência:', e);
  }
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

        try {
          const pos = await getCurrentPosition();
          currentPhotoCoords = pos;
          currentPhotoAccuracy = pos.accuracy;
          previewCoords.innerHTML = formatCoords(pos.lat, pos.lng) + formatAccuracyIndicator(pos.accuracy);
          // Mostrar KM aproximado
          showKmApproximado(pos.lat, pos.lng, 'photo');
        } catch (err) {
          previewCoords.innerHTML = err.message;
          currentPhotoCoords = null;
          currentPhotoAccuracy = null;
          document.getElementById('photoKmDisplay').style.display = 'none';
        }
      }
    };
    reader.readAsDataURL(file);
    cameraInput.value = '';
  });

  document.getElementById('cancelPhotoBtn').addEventListener('click', () => {
    photoPreview.style.display = 'none';
    currentPhotos = [];
    currentPhotoCoords = null;
    currentPhotoAccuracy = null;
    currentPhotoTags = [];
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
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    photoPreview.style.display = 'none';
    currentPhotos = [];
    currentPhotoCoords = null;
    currentPhotoAccuracy = null;
    currentPhotoTags = [];
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

  // Botão para usar referência de KM
  document.getElementById('useKmRefPhoto').addEventListener('click', () => {
    useKmReference('photo');
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

      try {
        const pos = await getCurrentPosition();
        currentVideoCoords = pos;
        currentVideoAccuracy = pos.accuracy;
        previewVideoCoords.innerHTML = formatCoords(pos.lat, pos.lng) + formatAccuracyIndicator(pos.accuracy);
        // Mostrar KM aproximado
        showKmApproximado(pos.lat, pos.lng, 'video');
      } catch (err) {
        previewVideoCoords.innerHTML = err.message;
        currentVideoCoords = null;
        currentVideoAccuracy = null;
        document.getElementById('videoKmDisplay').style.display = 'none';
      }
    };
    reader.readAsDataURL(file);
    videoInput.value = '';
  });

  document.getElementById('cancelVideoBtn').addEventListener('click', () => {
    videoPreview.style.display = 'none';
    previewVideo.src = '';
    currentVideoData = null;
    currentVideoCoords = null;
    currentVideoAccuracy = null;
    currentVideoTags = [];
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
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    videoPreview.style.display = 'none';
    previewVideo.src = '';
    currentVideoData = null;
    currentVideoCoords = null;
    currentVideoAccuracy = null;
    currentVideoTags = [];
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

  // Botão para usar referência de KM
  document.getElementById('useKmRefVideo').addEventListener('click', () => {
    useKmReference('video');
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

    try {
      const pos = await getCurrentPosition();
      currentLocationCoords = pos;
      currentLocationAccuracy = pos.accuracy;
      locationCoords.innerHTML = formatCoords(pos.lat, pos.lng) + formatAccuracyIndicator(pos.accuracy);
      // Mostrar KM aproximado
      showKmApproximado(pos.lat, pos.lng, 'location');
    } catch (err) {
      locationCoords.innerHTML = err.message;
      currentLocationCoords = null;
      currentLocationAccuracy = null;
      document.getElementById('locationKmDisplay').style.display = 'none';
    }
  });

  document.getElementById('cancelLocationBtn').addEventListener('click', () => {
    locationPreview.style.display = 'none';
    currentLocationCoords = null;
    currentLocationAccuracy = null;
    currentLocationTags = [];
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
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    locationPreview.style.display = 'none';
    currentLocationCoords = null;
    currentLocationAccuracy = null;
    currentLocationTags = [];
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

  // Botão para usar referência de KM
  document.getElementById('useKmRefLocation').addEventListener('click', () => {
    useKmReference('location');
  });
}
