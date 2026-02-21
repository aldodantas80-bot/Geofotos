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

// ========== Cache de geocodificação ==========
// Evita chamadas redundantes para coordenadas próximas (dentro de ~50m)
const geoCache = {
  address: new Map(),
  highway: new Map(),
  pois: new Map(),
  maxAge: 10 * 60 * 1000, // 10 minutos
  gridSize: 0.0005, // ~55m de resolução

  _key(lat, lng) {
    // Arredonda para grid para agrupar coordenadas próximas
    const gridLat = Math.round(lat / this.gridSize) * this.gridSize;
    const gridLng = Math.round(lng / this.gridSize) * this.gridSize;
    return `${gridLat.toFixed(4)},${gridLng.toFixed(4)}`;
  },

  get(type, lat, lng) {
    const key = this._key(lat, lng);
    const entry = this[type].get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.maxAge) {
      this[type].delete(key);
      return null;
    }
    return entry.data;
  },

  set(type, lat, lng, data) {
    const key = this._key(lat, lng);
    this[type].set(key, { data, timestamp: Date.now() });
    // Limitar tamanho do cache (máx 100 entradas por tipo)
    if (this[type].size > 100) {
      const firstKey = this[type].keys().next().value;
      this[type].delete(firstKey);
    }
  }
};

// ========== Fetch com timeout ==========
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ========== Retry com backoff exponencial ==========
async function fetchWithRetry(url, options = {}, { maxRetries = 2, timeoutMs = 15000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (response.ok) return response;
      // Não fazer retry para erros 4xx (erro do cliente)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') {
        lastError = new Error('Tempo esgotado na requisição');
      }
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// Geocodificação reversa - retorna endereço simplificado
async function reverseGeocode(lat, lng) {
  // Verificar cache
  const cached = geoCache.get('address', lat, lng);
  if (cached) return cached;

  try {
    await waitRateLimit();
    const response = await fetchWithRetry(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'GeoFotos-App/1.0' } },
      { maxRetries: 2, timeoutMs: 10000 }
    );
    const data = await response.json();

    const road = data.address?.road || null;
    const houseNumber = data.address?.house_number || null;
    const neighbourhood = data.address?.neighbourhood || data.address?.suburb || null;
    const city = data.address?.city || data.address?.town || data.address?.village || null;
    const state = data.address?.state || null;
    const postcode = data.address?.postcode || null;
    const hamlet = data.address?.hamlet || null;
    const county = data.address?.county || null;

    // Montar endereço simplificado: Rua, Número, Bairro, CEP, Cidade/Estado
    const parts = [];
    if (road) {
      let roadPart = road;
      if (houseNumber) roadPart += `, ${houseNumber}`;
      parts.push(roadPart);
    }
    if (neighbourhood) parts.push(neighbourhood);
    // Em áreas rurais sem bairro, usar hamlet ou county como referência
    if (!neighbourhood && !road) {
      if (hamlet) parts.push(hamlet);
      if (county) parts.push(county);
    }
    if (postcode) parts.push(postcode);
    if (city) {
      let cityState = city;
      if (state) cityState += `/${state}`;
      parts.push(cityState);
    } else if (state) {
      // Área rural sem cidade - mostrar pelo menos o estado
      parts.push(state);
    }
    const formattedAddress = parts.join(', ') || data.display_name || null;

    const result = {
      formattedAddress,
      fullAddress: data.display_name || null,
      road,
      houseNumber,
      neighbourhood,
      city,
      state,
      postcode,
      hamlet,
      county
    };

    // Salvar no cache
    geoCache.set('address', lat, lng, result);
    return result;
  } catch (err) {
    console.log('Erro geocodificação:', err);
    return null;
  }
}

// Buscar rodovia (federal e estadual) e KM aproximado via Overpass API
async function findHighwayInfo(lat, lng) {
  // Verificar cache
  const cached = geoCache.get('highway', lat, lng);
  if (cached) return cached;

  try {
    const radius = 200; // metros
    // Buscar rodovias federais (BR-) e estaduais (XX- onde XX é sigla do estado)
    const query = `
      [out:json][timeout:10];
      (
        way["ref"~"^(BR|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SE|SP|TO)-"](around:${radius},${lat},${lng});
      );
      out tags;

      node["highway"="milestone"](around:1000,${lat},${lng});
      out body;
    `;

    const response = await fetchWithRetry('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, { maxRetries: 1, timeoutMs: 12000 });

    const data = await response.json();

    let highway = null;
    let highwayName = null;
    let milestone = null;

    // Buscar rodovia - priorizar federal (BR-) sobre estadual
    const highways = [];
    for (const el of data.elements) {
      if (el.type === 'way' && el.tags?.ref) {
        highways.push({
          ref: el.tags.ref,
          name: el.tags.name || null,
          isFederal: el.tags.ref.startsWith('BR-')
        });
      }
    }
    // Ordenar: federais primeiro
    highways.sort((a, b) => (b.isFederal ? 1 : 0) - (a.isFederal ? 1 : 0));
    if (highways.length > 0) {
      highway = highways[0].ref;
      highwayName = highways[0].name;
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

    const result = { highway, highwayName, milestone };
    geoCache.set('highway', lat, lng, result);
    return result;
  } catch (err) {
    console.log('Erro ao buscar rodovia:', err);
    return { highway: null, highwayName: null, milestone: null };
  }
}

// ========== CAMADA 1: Overpass API expandida ==========
// Busca POIs com tags ampliadas incluindo features naturais
async function findNearbyPOIsOverpass(lat, lng) {
  try {
    const radius = 300; // metros
    const query = `
      [out:json][timeout:15];
      (
        // Amenidades e comércio
        nwr["amenity"]["name"](around:${radius},${lat},${lng});
        nwr["shop"]["name"](around:${radius},${lat},${lng});

        // Turismo e histórico
        nwr["tourism"](around:${radius},${lat},${lng});
        nwr["historic"](around:${radius},${lat},${lng});

        // Estruturas construídas (pontes, viadutos, torres, etc)
        nwr["man_made"]["name"](around:${radius},${lat},${lng});
        nwr["bridge"]["name"](around:${radius},${lat},${lng});
        way["bridge"="yes"]["name"](around:${radius},${lat},${lng});
        way["bridge"="viaduct"]["name"](around:${radius},${lat},${lng});

        // Lazer (parques, praças)
        nwr["leisure"]["name"](around:${radius},${lat},${lng});

        // Obras de arte pública
        nwr["tourism"="artwork"](around:${radius},${lat},${lng});
        nwr["artwork_type"](around:${radius},${lat},${lng});

        // Edifícios nomeados relevantes
        nwr["building"]["name"]["building"!="yes"]["building"!="residential"]["building"!="apartments"]["building"!="house"](around:${radius},${lat},${lng});

        // Lugares nomeados
        nwr["place"]["name"](around:${radius},${lat},${lng});

        // Features naturais (rios, riachos, morros, serras, lagoas)
        nwr["natural"]["name"](around:${radius},${lat},${lng});
        nwr["waterway"]["name"](around:${radius},${lat},${lng});

        // Junções e cruzamentos nomeados
        nwr["junction"]["name"](around:${radius},${lat},${lng});
      );
      out center tags;
    `;

    const response = await fetchWithRetry('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, { maxRetries: 1, timeoutMs: 18000 });

    const data = await response.json();

    return data.elements
      .filter(el => el.tags?.name)
      .map(el => {
        const elLat = el.lat || el.center?.lat;
        const elLng = el.lon || el.center?.lon;
        if (!elLat || !elLng) return null;
        const dist = haversineDistance(lat, lng, elLat, elLng);
        const typeInfo = extractPOIType(el.tags);
        return {
          name: el.tags.name,
          type: typeInfo.type,
          category: typeInfo.category,
          icon: getPOIIcon(typeInfo.type, typeInfo.category),
          distance: Math.round(dist),
          source: 'overpass',
          relevance: calculateRelevance(typeInfo.category, dist)
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.log('Erro Overpass POIs:', err);
    return [];
  }
}

// ========== CAMADA 2: Nominatim Search com viewbox ==========
// Busca features nomeadas próximas usando o endpoint /search
async function findNearbyPOIsNominatim(lat, lng) {
  try {
    await waitRateLimit();

    // Criar viewbox de ~300m ao redor do ponto
    const delta = 0.0027; // ~300m em graus
    const viewbox = `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`;

    const response = await fetchWithRetry(
      `https://nominatim.openstreetmap.org/search?format=json&viewbox=${viewbox}&bounded=1&limit=20&accept-language=pt-BR&addressdetails=1`,
      { headers: { 'User-Agent': 'GeoFotos-App/1.0' } },
      { maxRetries: 1, timeoutMs: 10000 }
    );
    const data = await response.json();

    return data
      .filter(item => item.name && item.lat && item.lon)
      .map(item => {
        const dist = haversineDistance(lat, lng, parseFloat(item.lat), parseFloat(item.lon));
        const category = mapNominatimClass(item.class, item.type);
        return {
          name: item.name,
          type: item.type,
          category: category,
          icon: getPOIIcon(item.type, category),
          distance: Math.round(dist),
          source: 'nominatim',
          relevance: calculateRelevance(category, dist)
        };
      })
      .filter(p => p.distance <= 300); // filtrar apenas os próximos
  } catch (err) {
    console.log('Erro Nominatim search:', err);
    return [];
  }
}

// ========== CAMADA 3: Wikidata SPARQL para landmarks culturais ==========
// Busca entidades com coordenadas próximas (monumentos, obras de arte, estruturas notáveis)
async function findNearbyPOIsWikidata(lat, lng) {
  try {
    const radiusKm = 0.3; // 300 metros

    // Query SPARQL para buscar entidades geolocalizadas próximas
    const sparqlQuery = `
      SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?instanceof ?instanceofLabel WHERE {
        SERVICE wikibase:around {
          ?item wdt:P625 ?location .
          bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
          bd:serviceParam wikibase:radius "${radiusKm}" .
        }
        ?item wdt:P625 ?location .
        BIND(geof:latitude(?location) AS ?lat)
        BIND(geof:longitude(?location) AS ?lon)
        OPTIONAL { ?item wdt:P31 ?instanceof . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
      }
      LIMIT 30
    `;

    const url = 'https://query.wikidata.org/sparql';
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'GeoFotos-App/1.0'
      },
      body: `query=${encodeURIComponent(sparqlQuery)}`
    }, { maxRetries: 1, timeoutMs: 12000 });
    const data = await response.json();

    // Agrupar por item (pode ter múltiplos instanceof)
    const itemsMap = new Map();

    for (const binding of data.results.bindings) {
      const itemId = binding.item.value;
      const itemLat = parseFloat(binding.lat.value);
      const itemLng = parseFloat(binding.lon.value);
      const dist = haversineDistance(lat, lng, itemLat, itemLng);

      if (!itemsMap.has(itemId)) {
        const instanceLabel = binding.instanceofLabel?.value || '';
        const category = mapWikidataInstance(instanceLabel);
        itemsMap.set(itemId, {
          name: binding.itemLabel?.value || '',
          description: binding.itemDescription?.value || '',
          type: instanceLabel,
          category: category,
          icon: getPOIIcon(instanceLabel.toLowerCase(), category),
          distance: Math.round(dist),
          source: 'wikidata',
          relevance: calculateRelevance(category, dist, true) // bonus cultural
        });
      }
    }

    return Array.from(itemsMap.values())
      .filter(item => item.name && !item.name.startsWith('Q')); // filtrar itens sem label
  } catch (err) {
    console.log('Erro Wikidata:', err);
    return [];
  }
}

// ========== Função híbrida: combina as 3 camadas ==========
async function findNearbyPOIs(lat, lng) {
  // Verificar cache
  const cached = geoCache.get('pois', lat, lng);
  if (cached) return cached;

  try {
    // Executar as 3 camadas em paralelo com tolerância a falhas
    const results = await Promise.allSettled([
      findNearbyPOIsOverpass(lat, lng),
      findNearbyPOIsNominatim(lat, lng),
      findNearbyPOIsWikidata(lat, lng)
    ]);

    // Combinar resultados bem-sucedidos (ignorar camadas que falharam)
    const allPOIs = [];
    const sources = ['Overpass', 'Nominatim', 'Wikidata'];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        allPOIs.push(...result.value);
      } else {
        console.log(`Camada ${sources[i]} falhou:`, result.reason?.message);
      }
    });

    // Deduplicar por nome similar e proximidade
    const uniquePOIs = deduplicatePOIs(allPOIs);

    // Ordenar por relevância (maior = mais relevante)
    uniquePOIs.sort((a, b) => b.relevance - a.relevance);

    // Retornar os 3 mais relevantes
    const topPOIs = uniquePOIs.slice(0, 3);

    // Salvar no cache
    geoCache.set('pois', lat, lng, topPOIs);
    return topPOIs;
  } catch (err) {
    console.log('Erro ao buscar POIs:', err);
    return [];
  }
}

// ========== Funções auxiliares ==========

// Extrair tipo e categoria das tags OSM
function extractPOIType(tags) {
  // Prioridade de categorias (mais específico primeiro)
  if (tags.historic) return { type: tags.historic, category: 'historic' };
  if (tags.tourism === 'artwork' || tags.artwork_type) return { type: tags.artwork_type || 'artwork', category: 'artwork' };
  if (tags.tourism) return { type: tags.tourism, category: 'tourism' };
  if (tags.man_made) return { type: tags.man_made, category: 'structure' };
  if (tags.bridge) return { type: 'bridge', category: 'structure' };
  if (tags.natural) return { type: tags.natural, category: 'natural' };
  if (tags.waterway) return { type: tags.waterway, category: 'natural' };
  if (tags.junction) return { type: 'junction', category: 'structure' };
  if (tags.leisure) return { type: tags.leisure, category: 'leisure' };
  if (tags.amenity) return { type: tags.amenity, category: 'amenity' };
  if (tags.shop) return { type: tags.shop, category: 'shop' };
  if (tags.building && tags.building !== 'yes') return { type: tags.building, category: 'building' };
  if (tags.place) return { type: tags.place, category: 'place' };
  return { type: 'other', category: 'other' };
}

// Mapear classe Nominatim para categoria
function mapNominatimClass(osmClass, osmType) {
  const classMap = {
    'historic': 'historic',
    'tourism': 'tourism',
    'amenity': 'amenity',
    'shop': 'shop',
    'leisure': 'leisure',
    'man_made': 'structure',
    'building': 'building',
    'place': 'place',
    'highway': 'structure',
    'natural': 'natural',
    'waterway': 'natural',
    'junction': 'structure'
  };
  return classMap[osmClass] || 'other';
}

// Mapear instância Wikidata para categoria
function mapWikidataInstance(instanceLabel) {
  const label = instanceLabel.toLowerCase();
  if (label.includes('monument') || label.includes('memorial') || label.includes('histórico')) return 'historic';
  if (label.includes('artwork') || label.includes('sculpture') || label.includes('escultura') || label.includes('mural')) return 'artwork';
  if (label.includes('bridge') || label.includes('viaduct') || label.includes('ponte') || label.includes('viaduto')) return 'structure';
  if (label.includes('church') || label.includes('igreja') || label.includes('chapel')) return 'religious';
  if (label.includes('museum') || label.includes('museu')) return 'tourism';
  if (label.includes('park') || label.includes('parque') || label.includes('square') || label.includes('praça')) return 'leisure';
  if (label.includes('building') || label.includes('edificio') || label.includes('edifício')) return 'building';
  return 'landmark';
}

// Calcular relevância do POI
function calculateRelevance(category, distance, isCultural = false) {
  // Base: quanto mais perto, maior a relevância (até 100 pontos por proximidade)
  const proximityScore = Math.max(0, 100 - (distance / 5));

  // Bonus por categoria (landmarks culturais e naturais são mais interessantes como referência)
  const categoryBonus = {
    'historic': 50,
    'artwork': 50,
    'structure': 40,  // viadutos, pontes
    'natural': 35,    // rios, morros, serras
    'tourism': 35,
    'religious': 30,
    'landmark': 45,
    'leisure': 25,
    'amenity': 15,
    'building': 20,
    'shop': 10,
    'place': 15,
    'other': 5
  };

  const catScore = categoryBonus[category] || 10;

  // Bonus extra para itens do Wikidata (culturalmente relevantes)
  const culturalBonus = isCultural ? 20 : 0;

  return proximityScore + catScore + culturalBonus;
}

// Deduplicar POIs por nome similar
function deduplicatePOIs(pois) {
  const seen = new Map();

  for (const poi of pois) {
    const normalizedName = poi.name.toLowerCase().trim();

    // Verificar se já existe um similar
    let isDuplicate = false;
    for (const [existingName, existingPoi] of seen) {
      if (isSimilarName(normalizedName, existingName)) {
        // Manter o de maior relevância
        if (poi.relevance > existingPoi.relevance) {
          seen.delete(existingName);
          seen.set(normalizedName, poi);
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(normalizedName, poi);
    }
  }

  return Array.from(seen.values());
}

// Verificar se dois nomes são similares
function isSimilarName(name1, name2) {
  // Iguais
  if (name1 === name2) return true;

  // Um contém o outro
  if (name1.includes(name2) || name2.includes(name1)) return true;

  // Similaridade de Jaccard nos tokens
  const tokens1 = new Set(name1.split(/\s+/));
  const tokens2 = new Set(name2.split(/\s+/));
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;

  return union > 0 && (intersection / union) > 0.6;
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

// Ícone baseado no tipo e categoria do POI
function getPOIIcon(type, category) {
  // Ícones por tipo específico
  const typeIcons = {
    // Amenidades
    'fuel': '⛽', 'restaurant': '🍽️', 'fast_food': '🍔', 'cafe': '☕',
    'hospital': '🏥', 'pharmacy': '💊', 'school': '🏫', 'bank': '🏦',
    'police': '🚔', 'fire_station': '🚒', 'place_of_worship': '⛪', 'supermarket': '🛒',
    'convenience': '🏪', 'hotel': '🏨', 'parking': '🅿️', 'bus_station': '🚏',
    'university': '🎓', 'library': '📚', 'cinema': '🎬', 'theatre': '🎭',

    // Estruturas e construções
    'bridge': '🌉', 'viaduct': '🌉', 'tower': '🗼', 'water_tower': '🗼',
    'lighthouse': '🗼', 'pier': '🌊', 'windmill': '🌬️',

    // Turismo
    'museum': '🏛️', 'attraction': '⭐', 'viewpoint': '👁️', 'zoo': '🦁',
    'theme_park': '🎢', 'aquarium': '🐠', 'gallery': '🖼️',

    // Arte e cultura
    'artwork': '🎨', 'sculpture': '🗿', 'statue': '🗽', 'mural': '🎨',
    'monument': '🏛️', 'memorial': '🕯️',

    // Histórico
    'castle': '🏰', 'ruins': '🏚️', 'archaeological_site': '🏺', 'fort': '🏰',
    'battlefield': '⚔️', 'building': '🏛️', 'church': '⛪', 'chapel': '⛪',

    // Lazer
    'park': '🌳', 'garden': '🌷', 'playground': '🛝', 'sports_centre': '🏟️',
    'stadium': '🏟️', 'swimming_pool': '🏊', 'beach': '🏖️',

    // Lugares
    'square': '🏛️', 'neighbourhood': '🏘️', 'suburb': '🏘️',

    // Features naturais
    'river': '🏞️', 'stream': '🏞️', 'creek': '🏞️', 'canal': '🏞️',
    'lake': '🏞️', 'pond': '🏞️', 'reservoir': '🏞️',
    'peak': '⛰️', 'hill': '⛰️', 'mountain': '⛰️', 'ridge': '⛰️',
    'cliff': '🏔️', 'valley': '🏔️', 'cave_entrance': '🕳️',
    'spring': '💧', 'waterfall': '💧', 'wetland': '🌿',
    'wood': '🌲', 'tree': '🌳', 'rock': '🪨',

    // Junções
    'junction': '🔀'
  };

  // Ícones por categoria (fallback)
  const categoryIcons = {
    'historic': '🏛️',
    'artwork': '🎨',
    'structure': '🌉',
    'natural': '🏞️',
    'tourism': '📍',
    'religious': '⛪',
    'leisure': '🌳',
    'amenity': '📌',
    'shop': '🏪',
    'building': '🏢',
    'landmark': '🏛️',
    'place': '📍'
  };

  // Tentar ícone específico primeiro
  if (type && typeIcons[type.toLowerCase()]) {
    return typeIcons[type.toLowerCase()];
  }

  // Fallback para categoria
  if (category && categoryIcons[category]) {
    return categoryIcons[category];
  }

  return '📌';
}

// Buscar endereço + rodovia (sob demanda)
async function getAddressInfo(lat, lng) {
  const [address, highway] = await Promise.all([
    reverseGeocode(lat, lng),
    findHighwayInfo(lat, lng)
  ]);
  return { address, highway };
}

// Função completa: buscar todas as informações de localização
async function getLocationInfo(lat, lng) {
  const [address, highway, pois] = await Promise.all([
    reverseGeocode(lat, lng),
    findHighwayInfo(lat, lng),
    findNearbyPOIs(lat, lng)
  ]);

  return { address, highway, pois };
}

// Obter endereço formatado (usa formattedAddress se disponível, senão fullAddress)
function getDisplayAddress(address) {
  if (!address) return null;
  return address.formattedAddress || address.fullAddress || null;
}

// Formatar informações de localização como texto (para copiar/compartilhar)
function formatLocationInfo(locationInfo) {
  let text = '';

  const displayAddr = getDisplayAddress(locationInfo?.address);
  if (displayAddr) {
    text += `📌 Endereço: ${displayAddr}\n`;
  }

  if (locationInfo?.highway?.highway) {
    let hwText = `🛣️ Rodovia: ${locationInfo.highway.highway}`;
    if (locationInfo.highway.highwayName) {
      hwText += ` (${locationInfo.highway.highwayName})`;
    }
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

  const displayAddr = getDisplayAddress(info.address);
  if (displayAddr) {
    html += `<div class="location-info-item">
      <div class="location-info-label">ENDEREÇO</div>
      <div class="location-info-value">${displayAddr}</div>
    </div>`;
  }

  if (info.highway?.highway) {
    let hwText = info.highway.highway;
    if (info.highway.highwayName) {
      hwText += ` (${info.highway.highwayName})`;
    }
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
