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

  // Inicializa os controles de pontos notáveis
  initHighwayControls();

  // Atualiza camada de pontos quando o zoom muda
  mapInstance.on('zoomend', () => {
    if (window.HighwayPoints && window.HighwayPoints.isVisible()) {
      window.HighwayPoints.update(mapInstance);
    }
  });
}

// Inicializa controles de pontos notáveis
function initHighwayControls() {
  const toggleBtn = document.getElementById('toggleHighwayBtn');
  const filtersPanel = document.getElementById('highwayFiltersPanel');
  const closeFiltersBtn = document.getElementById('closeFiltersBtn');
  const filterBR = document.getElementById('filterBR');
  const filterTipo = document.getElementById('filterTipo');
  const filterSearch = document.getElementById('filterSearch');
  const filterStats = document.getElementById('filterStats');

  // Toggle da camada
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (window.HighwayPoints) {
        const isVisible = window.HighwayPoints.toggle(mapInstance);
        toggleBtn.classList.toggle('active', isVisible);
        filtersPanel.style.display = isVisible ? 'block' : 'none';
        updateFilterStats();
      }
    });
  }

  // Fechar painel de filtros
  if (closeFiltersBtn) {
    closeFiltersBtn.addEventListener('click', () => {
      filtersPanel.style.display = 'none';
    });
  }

  // Filtros
  if (filterBR) {
    filterBR.addEventListener('change', () => {
      applyHighwayFilters();
    });
  }

  if (filterTipo) {
    filterTipo.addEventListener('change', () => {
      applyHighwayFilters();
    });
  }

  if (filterSearch) {
    let searchTimeout;
    filterSearch.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        applyHighwayFilters();
      }, 300);
    });
  }
}

// Aplica filtros
function applyHighwayFilters() {
  const filterBR = document.getElementById('filterBR');
  const filterTipo = document.getElementById('filterTipo');
  const filterSearch = document.getElementById('filterSearch');

  if (window.HighwayPoints) {
    window.HighwayPoints.setFilters({
      br: filterBR ? filterBR.value : 'all',
      tipo: filterTipo ? filterTipo.value : 'all',
      search: filterSearch ? filterSearch.value : ''
    }, mapInstance);

    updateFilterStats();
  }
}

// Atualiza estatísticas do filtro
function updateFilterStats() {
  const filterStats = document.getElementById('filterStats');
  if (filterStats && window.HighwayPoints) {
    const stats = window.HighwayPoints.getStats();
    filterStats.textContent = `${stats.total} pontos disponíveis`;
  }
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
