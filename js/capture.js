// ========== Capture (Foto, Vídeo, Localização) ==========

// Estado da captura
let currentPhotoData = null;
let currentPhotoCoords = null;
let currentVideoData = null;
let currentVideoCoords = null;
let currentLocationCoords = null;

// Inicializar captura
function initCapture() {
  // ========== Foto + Localização ==========
  const cameraInput = document.getElementById('cameraInput');
  const takePhotoBtn = document.getElementById('takePhotoBtn');
  const photoPreview = document.getElementById('photoPreview');
  const previewImg = document.getElementById('previewImg');
  const previewCoords = document.getElementById('previewCoords');
  const notesInput = document.getElementById('notesInput');

  takePhotoBtn.addEventListener('click', () => cameraInput.click());

  cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Converter para base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      currentPhotoData = ev.target.result;
      previewImg.src = currentPhotoData;
      photoPreview.style.display = 'block';
      notesInput.value = '';
      previewCoords.textContent = 'Obtendo localização...';

      try {
        const pos = await getCurrentPosition();
        currentPhotoCoords = pos;
        previewCoords.textContent = formatCoords(pos.lat, pos.lng);
      } catch (err) {
        previewCoords.textContent = err.message;
        currentPhotoCoords = null;
      }
    };
    reader.readAsDataURL(file);
    cameraInput.value = '';
  });

  document.getElementById('cancelPhotoBtn').addEventListener('click', () => {
    photoPreview.style.display = 'none';
    currentPhotoData = null;
    currentPhotoCoords = null;
  });

  document.getElementById('savePhotoBtn').addEventListener('click', async () => {
    if (!currentPhotoCoords) {
      showToast('Aguarde a localização');
      return;
    }

    const record = {
      type: 'photo',
      photo: currentPhotoData,
      lat: currentPhotoCoords.lat,
      lng: currentPhotoCoords.lng,
      notes: notesInput.value.trim(),
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    photoPreview.style.display = 'none';
    currentPhotoData = null;
    currentPhotoCoords = null;
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
      previewVideoCoords.textContent = 'Obtendo localização...';

      try {
        const pos = await getCurrentPosition();
        currentVideoCoords = pos;
        previewVideoCoords.textContent = formatCoords(pos.lat, pos.lng);
      } catch (err) {
        previewVideoCoords.textContent = err.message;
        currentVideoCoords = null;
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
      notes: videoNotesInput.value.trim(),
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    videoPreview.style.display = 'none';
    previewVideo.src = '';
    currentVideoData = null;
    currentVideoCoords = null;
  });

  // ========== Apenas Localização ==========
  const locationPreview = document.getElementById('locationPreview');
  const locationCoords = document.getElementById('locationCoords');
  const locationNotesInput = document.getElementById('locationNotesInput');

  document.getElementById('getLocationBtn').addEventListener('click', async () => {
    locationPreview.style.display = 'block';
    locationCoords.textContent = 'Obtendo localização...';
    locationNotesInput.value = '';

    try {
      const pos = await getCurrentPosition();
      currentLocationCoords = pos;
      locationCoords.textContent = formatCoords(pos.lat, pos.lng);
    } catch (err) {
      locationCoords.textContent = err.message;
      currentLocationCoords = null;
    }
  });

  document.getElementById('cancelLocationBtn').addEventListener('click', () => {
    locationPreview.style.display = 'none';
    currentLocationCoords = null;
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
      notes: locationNotesInput.value.trim(),
      createdAt: new Date().toISOString()
    };

    await saveRecord(record);
    showToast('Salvo com sucesso!');
    locationPreview.style.display = 'none';
    currentLocationCoords = null;
  });
}
