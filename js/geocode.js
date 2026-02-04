// ========== Geocodificação Reversa e Referências ==========

// Controle de rate limit (Nominatim exige máximo 1 req/segundo)
let lastGeoRequest = 0;

async function waitRateLimit() {
  const now = Date.now();
  const elapsed = now - lastGeoRequest;
  if (elapsed < 1100) {
    await new Promise(resolve => setTimeout(resolve, 1100 - elapsed));
  }
  lastGeoRequest = Date.now();
}

// Geocodificação reversa - retorna endereço
async function reverseGeocode(lat, lng) {
  try {
    await waitRateLimit();
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'GeoFotos-App/1.0' } }
    );
    if (!response.ok) throw new Error('Erro na requisição');
    const data = await response.json();
    return {
      fullAddress: data.display_name || null,
      road: data.address?.road || null,
      neighbourhood: data.address?.neighbourhood || data.address?.suburb || null,
      city: data.address?.city || data.address?.town || data.address?.village || null,
      state: data.address?.state || null,
      postcode: data.address?.postcode || null
    };
  } catch (err) {
    console.log('Erro geocodificação:', err);
    return null;
  }
}

// Buscar rodovia federal e KM aproximado via Overpass API (OpenStreetMap)
async function findHighwayInfo(lat, lng) {
  try {
    const radius = 200; // metros
    const query = `
      [out:json][timeout:10];
      (
        way["ref"~"^BR-"](around:${radius},${lat},${lng});
      );
      out tags;

      node["highway"="milestone"](around:1000,${lat},${lng});
      out body;
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) throw new Error('Erro Overpass');
    const data = await response.json();

    let highway = null;
    let milestone = null;

    // Buscar rodovia federal
    for (const el of data.elements) {
      if (el.type === 'way' && el.tags?.ref) {
        highway = el.tags.ref;
        break;
      }
    }

    // Buscar marco quilométrico mais próximo
    let closestDist = Infinity;
    for (const el of data.elements) {
      if (el.type === 'node' && el.tags?.highway === 'milestone') {
        const dist = haversineDistance(lat, lng, el.lat, el.lon);
        if (dist < closestDist) {
          closestDist = dist;
          milestone = {
            km: el.tags.distance || el.tags['pk'] || el.tags['ref'] || null,
            distance: Math.round(dist)
          };
        }
      }
    }

    return { highway, milestone };
  } catch (err) {
    console.log('Erro ao buscar rodovia:', err);
    return { highway: null, milestone: null };
  }
}

// Buscar pontos de referência próximos via Overpass API
async function findNearbyPOIs(lat, lng) {
  try {
    const radius = 500; // metros
    const query = `
      [out:json][timeout:10];
      (
        node["amenity"](around:${radius},${lat},${lng});
        node["shop"](around:${radius},${lat},${lng});
        node["tourism"](around:${radius},${lat},${lng});
        node["name"]["place"](around:${radius},${lat},${lng});
        way["amenity"](around:${radius},${lat},${lng});
        way["shop"](around:${radius},${lat},${lng});
      );
      out center tags;
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) throw new Error('Erro Overpass');
    const data = await response.json();

    const pois = data.elements
      .filter(el => el.tags?.name)
      .map(el => {
        const elLat = el.lat || el.center?.lat;
        const elLng = el.lon || el.center?.lon;
        const dist = haversineDistance(lat, lng, elLat, elLng);
        const type = el.tags.amenity || el.tags.shop || el.tags.tourism || el.tags.place || '';
        const icon = getPOIIcon(type);
        return {
          name: el.tags.name,
          type: type,
          icon: icon,
          distance: Math.round(dist)
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5); // máximo 5 pontos

    return pois;
  } catch (err) {
    console.log('Erro ao buscar POIs:', err);
    return [];
  }
}

// Distância em metros entre dois pontos (fórmula de Haversine)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Ícone baseado no tipo de POI
function getPOIIcon(type) {
  const icons = {
    'fuel': '⛽', 'restaurant': '🍽️', 'fast_food': '🍔', 'cafe': '☕',
    'hospital': '🏥', 'pharmacy': '💊', 'school': '🏫', 'bank': '🏦',
    'police': '🚔', 'fire_station': '🚒', 'church': '⛪', 'supermarket': '🛒',
    'convenience': '🏪', 'hotel': '🏨', 'parking': '🅿️', 'bus_station': '🚏'
  };
  return icons[type] || '📌';
}

// Função principal: buscar todas as informações de localização
async function getLocationInfo(lat, lng) {
  const [address, highway, pois] = await Promise.all([
    reverseGeocode(lat, lng),
    findHighwayInfo(lat, lng),
    findNearbyPOIs(lat, lng)
  ]);

  return { address, highway, pois };
}

// Formatar informações de localização como texto (para copiar/compartilhar)
function formatLocationInfo(locationInfo) {
  let text = '';

  if (locationInfo?.address?.fullAddress) {
    text += `📌 Endereço: ${locationInfo.address.fullAddress}\n`;
  }

  if (locationInfo?.highway?.highway) {
    let hwText = `🛣️ Rodovia: ${locationInfo.highway.highway}`;
    if (locationInfo.highway.milestone?.km) {
      hwText += ` - KM ${locationInfo.highway.milestone.km}`;
      if (locationInfo.highway.milestone.distance > 50) {
        hwText += ` (aprox. ~${locationInfo.highway.milestone.distance}m do marco)`;
      }
    }
    text += hwText + '\n';
  }

  if (locationInfo?.pois?.length > 0) {
    text += `🏪 Referências:\n`;
    locationInfo.pois.forEach(poi => {
      text += `  ${poi.icon} ${poi.name} (${poi.distance}m)\n`;
    });
  }

  return text;
}

// Renderizar informações de localização no preview de captura
function renderLocationInfoPreview(containerId, info) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!info) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  if (info.address?.fullAddress) {
    html += `<div class="location-info-item">
      <div class="location-info-label">ENDEREÇO</div>
      <div class="location-info-value">${info.address.fullAddress}</div>
    </div>`;
  }

  if (info.highway?.highway) {
    let hwText = info.highway.highway;
    if (info.highway.milestone?.km) {
      hwText += ` - KM ${info.highway.milestone.km}`;
    }
    html += `<div class="location-info-item">
      <div class="location-info-label">RODOVIA</div>
      <div class="location-info-value">🛣️ ${hwText}</div>
    </div>`;
  }

  if (info.pois?.length > 0) {
    html += `<div class="location-info-item">
      <div class="location-info-label">REFERÊNCIAS PRÓXIMAS</div>
      ${info.pois.map(p => `<div class="location-info-poi">${p.icon} ${p.name} (${p.distance}m)</div>`).join('')}
    </div>`;
  }

  container.innerHTML = html || '<span class="location-info-empty">Nenhuma informação adicional encontrada</span>';
}
