// ========== Mapa com Leaflet ==========

let mapInstance = null;
let markers = [];
let userLocationMarker = null;
let userLocationCircle = null;
let locationWatchId = null;

function initMap() {
  if (mapInstance) return;

  // Centraliza em Sergipe por padrão
  mapInstance = L.map('mapContainer').setView([-10.9472, -37.0731], 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapInstance);

  // Iniciar rastreamento de localização em tempo real
  startLocationTracking();
}

async function loadMapMarkers() {
  const records = await getAllRecords();

  // Limpa markers existentes
  markers.forEach(m => mapInstance.removeLayer(m));
  markers = [];

  if (records.length === 0) return;

  const bounds = [];

  records.forEach(record => {
    const icon = record.type === 'photo' ? '📸' : record.type === 'video' ? '🎬' : '📍';
    const dateStr = new Date(record.createdAt).toLocaleDateString('pt-BR');
    const notesPreview = record.notes ? record.notes.substring(0, 50) + (record.notes.length > 50 ? '...' : '') : 'Sem observações';

    const marker = L.marker([record.lat, record.lng])
      .addTo(mapInstance)
      .bindPopup(`
        <strong>${icon} ${dateStr}</strong><br>
        ${notesPreview}<br>
        <small>${record.lat.toFixed(6)}, ${record.lng.toFixed(6)}</small><br>
        <button onclick="openInMaps(${record.lat}, ${record.lng})" style="margin-top:8px;padding:4px 8px;cursor:pointer;">🗺️ Abrir no Maps</button>
      `);

    markers.push(marker);
    bounds.push([record.lat, record.lng]);
  });

  // Ajusta zoom para mostrar todos os pontos
  if (bounds.length > 0) {
    mapInstance.fitBounds(bounds, { padding: [20, 20] });
  }
}

// Rastreamento de localização em tempo real no mapa
function startLocationTracking() {
  if (!navigator.geolocation || !mapInstance) return;

  // Ícone azul pulsante para localização do usuário
  const userIcon = L.divIcon({
    className: 'user-location-icon',
    html: '<div class="user-location-dot"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      if (userLocationMarker) {
        userLocationMarker.setLatLng([lat, lng]);
      } else {
        userLocationMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
          .addTo(mapInstance)
          .bindPopup('Você está aqui');
      }

      if (userLocationCircle) {
        userLocationCircle.setLatLng([lat, lng]);
        userLocationCircle.setRadius(accuracy);
      } else {
        userLocationCircle = L.circle([lat, lng], {
          radius: accuracy,
          color: '#4A90D9',
          fillColor: '#4A90D9',
          fillOpacity: 0.12,
          weight: 1
        }).addTo(mapInstance);
      }
    },
    (error) => {
      console.log('Erro ao rastrear localização no mapa:', error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 5000
    }
  );
}

function stopLocationTracking() {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
}

function refreshMap() {
  if (mapInstance) {
    setTimeout(() => {
      mapInstance.invalidateSize();
      loadMapMarkers();
    }, 100);
  }
}
