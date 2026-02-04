// ========== Mapa com Leaflet ==========

let mapInstance = null;
let markers = [];

function initMap() {
  if (mapInstance) return;

  // Centraliza em Sergipe por padrão
  mapInstance = L.map('mapContainer').setView([-10.9472, -37.0731], 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapInstance);
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

function refreshMap() {
  if (mapInstance) {
    setTimeout(() => {
      mapInstance.invalidateSize();
      loadMapMarkers();
    }, 100);
  }
}
