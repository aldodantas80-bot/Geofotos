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
// Evita chamadas redundantes para coordenadas próximas
const geoCache = {
  address: new Map(),
  highway: new Map(),
  pois: new Map(),
  maxAge: 10 * 60 * 1000, // 10 minutos
  // Grids diferentes por tipo: endereço precisa de precisão maior
  gridSizes: {
    address: 0.0001, // ~11m - preciso para números de endereço
    highway: 0.001,  // ~110m - mesma rodovia numa faixa ampla
    pois: 0.0003     // ~33m - referências próximas (raio 100m)
  },

  _key(type, lat, lng) {
    const gridSize = this.gridSizes[type] || 0.0005;
    const gridLat = Math.round(lat / gridSize) * gridSize;
    const gridLng = Math.round(lng / gridSize) * gridSize;
    return `${gridLat.toFixed(6)},${gridLng.toFixed(6)}`;
  },

  get(type, lat, lng) {
    const key = this._key(type, lat, lng);
    const entry = this[type].get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.maxAge) {
      this[type].delete(key);
      return null;
    }
    return entry.data;
  },

  set(type, lat, lng, data) {
    const key = this._key(type, lat, lng);
    this[type].set(key, { data, timestamp: Date.now() });
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
// Usa geometria da rodovia + milestones em raio amplo para interpolação
async function findHighwayInfo(lat, lng) {
  const cached = geoCache.get('highway', lat, lng);
  if (cached) return cached;

  try {
    const searchRadius = 200;      // raio para identificar a rodovia
    const geoRadius = 2000;        // raio para geometria da rodovia (interpolação)
    const milestoneRadius = 5000;  // raio para marcos quilométricos

    // Query combinada: rodovias com geometria (2km) + milestones (5km)
    const refPattern = '^(BR|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SE|SP|TO)-';
    const query = `
      [out:json][timeout:20];
      (
        way["ref"~"${refPattern}"](around:${geoRadius},${lat},${lng});
      );
      out body geom;

      node["highway"="milestone"](around:${milestoneRadius},${lat},${lng});
      out body;
    `;

    const response = await fetchWithRetry('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, { maxRetries: 1, timeoutMs: 25000 });

    const data = await response.json();

    // Separar rodovias e milestones
    const highwayWays = [];
    const milestoneNodes = [];
    for (const el of data.elements) {
      if (el.type === 'way' && el.tags?.ref && el.geometry) {
        highwayWays.push(el);
      } else if (el.type === 'node' && el.tags?.highway === 'milestone') {
        milestoneNodes.push(el);
      }
    }

    if (highwayWays.length === 0) {
      const result = { highway: null, highwayName: null, milestone: null };
      geoCache.set('highway', lat, lng, result);
      return result;
    }

    // Encontrar a rodovia mais próxima do usuário
    let closestRef = null;
    let closestName = null;
    let closestDist = Infinity;
    let isFederalClosest = false;

    for (const way of highwayWays) {
      for (const pt of way.geometry) {
        const dist = haversineDistance(lat, lng, pt.lat, pt.lon);
        const isFederal = way.tags.ref.startsWith('BR-');
        // Priorizar federal se a distância é similar (dentro de 50m)
        if (dist < closestDist || (dist < closestDist + 50 && isFederal && !isFederalClosest)) {
          closestDist = dist;
          closestRef = way.tags.ref;
          closestName = way.tags.name || null;
          isFederalClosest = isFederal;
        }
      }
    }

    // Só considerar rodovias dentro do raio de busca
    if (closestDist > searchRadius) {
      const result = { highway: null, highwayName: null, milestone: null };
      geoCache.set('highway', lat, lng, result);
      return result;
    }

    // Filtrar segmentos da rodovia encontrada e encadear geometria
    const matchingWays = highwayWays.filter(w => w.tags.ref === closestRef);
    const polyline = chainWaySegments(matchingWays.map(w => w.geometry));

    // Extrair milestones com valor de km
    const milestones = milestoneNodes
      .map(node => {
        const km = extractMilestoneKm(node.tags);
        if (km === null) return null;
        return { lat: node.lat, lon: node.lon, km };
      })
      .filter(Boolean);

    // Tentar interpolação geométrica
    let milestone = null;
    if (polyline.length >= 2 && milestones.length > 0) {
      milestone = estimateKmByInterpolation(lat, lng, polyline, milestones);
    } else if (milestones.length > 0) {
      // Fallback: milestone mais próximo (sem interpolação)
      let nearest = null;
      let nearestDist = Infinity;
      for (const ms of milestones) {
        const dist = haversineDistance(lat, lng, ms.lat, ms.lon);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = ms;
        }
      }
      if (nearest) {
        milestone = {
          km: nearest.km,
          distance: Math.round(nearestDist),
          estimated: false
        };
      }
    }

    const result = { highway: closestRef, highwayName: closestName, milestone };
    geoCache.set('highway', lat, lng, result);
    return result;
  } catch (err) {
    console.log('Erro ao buscar rodovia:', err);
    return { highway: null, highwayName: null, milestone: null };
  }
}

// ========== CAMADA 1: Overpass API (POIs de alta relevância) ==========
// Busca apenas POIs que servem como referência real e reconhecível
async function findNearbyPOIsOverpass(lat, lng) {
  try {
    const radius = 100; // metros — raio curto para só trazer referências realmente próximas
    const query = `
      [out:json][timeout:15];
      (
        // Postos de combustível, hospitais, escolas, igrejas, delegacias, bombeiros
        nwr["amenity"~"fuel|hospital|clinic|school|place_of_worship|police|fire_station|bus_station"]["name"](around:${radius},${lat},${lng});

        // Supermercados e grandes comércios
        nwr["shop"~"supermarket|department_store|mall"]["name"](around:${radius},${lat},${lng});

        // Estruturas construídas (pontes, viadutos, torres)
        nwr["man_made"]["name"](around:${radius},${lat},${lng});
        nwr["bridge"]["name"](around:${radius},${lat},${lng});
        way["bridge"="yes"]["name"](around:${radius},${lat},${lng});
        way["bridge"="viaduct"]["name"](around:${radius},${lat},${lng});

        // Features naturais (rios, riachos, morros, serras, lagoas)
        nwr["natural"]["name"](around:${radius},${lat},${lng});
        nwr["waterway"]["name"](around:${radius},${lat},${lng});

        // Junções e cruzamentos nomeados
        nwr["junction"]["name"](around:${radius},${lat},${lng});

        // Histórico (monumentos, marcos)
        nwr["historic"]["name"](around:${radius},${lat},${lng});
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

    // Criar viewbox de ~100m ao redor do ponto
    const delta = 0.0009; // ~100m em graus
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
      .filter(p => p.distance <= 100); // filtrar apenas os realmente próximos
  } catch (err) {
    console.log('Erro Nominatim search:', err);
    return [];
  }
}

// ========== CAMADA 3: Wikidata SPARQL para landmarks culturais ==========
// Busca entidades com coordenadas próximas (monumentos, obras de arte, estruturas notáveis)
async function findNearbyPOIsWikidata(lat, lng) {
  try {
    const radiusKm = 0.1; // 100 metros

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

// ========== Interpolação geométrica de KM ==========

// Extrair valor de km das tags de um milestone
function extractMilestoneKm(tags) {
  // Prioridade: distance > pk > ref numérico
  const candidates = [
    tags.distance,
    tags.pk,
    tags['distance:ref'],
    tags['addr:milestone']
  ];
  for (const val of candidates) {
    if (!val) continue;
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num < 2000) return num;
  }
  // ref pode ser km OU nome da rodovia - só usar se for puramente numérico
  if (tags.ref && /^\d+(\.\d+)?$/.test(tags.ref.trim())) {
    const num = parseFloat(tags.ref);
    if (!isNaN(num) && num >= 0) return num;
  }
  return null;
}

// Projetar ponto P sobre o segmento de reta AB
// Retorna fração [0,1] ao longo do segmento e distância perpendicular
function projectPointOnSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  // Coordenadas cartesianas locais (correção de longitude pela latitude)
  const cosLat = Math.cos(pLat * Math.PI / 180);
  const ax = (aLng - pLng) * cosLat;
  const ay = aLat - pLat;
  const bx = (bLng - pLng) * cosLat;
  const by = bLat - pLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { fraction: 0, distance: haversineDistance(pLat, pLng, aLat, aLng) };
  }

  // Projeção do ponto P (na origem local) sobre o segmento
  let t = ((-ax) * dx + (-ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);

  return {
    fraction: t,
    distance: haversineDistance(pLat, pLng, projLat, projLng)
  };
}

// Projetar ponto sobre uma polilinha (sequência de pontos)
// Retorna distância ao longo da linha e distância perpendicular
function projectPointOnPolyline(pLat, pLng, polyline) {
  let minDist = Infinity;
  let bestSegment = 0;
  let bestFraction = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const proj = projectPointOnSegment(
      pLat, pLng,
      polyline[i].lat, polyline[i].lon,
      polyline[i + 1].lat, polyline[i + 1].lon
    );
    if (proj.distance < minDist) {
      minDist = proj.distance;
      bestSegment = i;
      bestFraction = proj.fraction;
    }
  }

  // Distância acumulada ao longo da polilinha até o ponto de projeção
  let distAlong = 0;
  for (let i = 0; i < bestSegment; i++) {
    distAlong += haversineDistance(
      polyline[i].lat, polyline[i].lon,
      polyline[i + 1].lat, polyline[i + 1].lon
    );
  }
  const segLen = haversineDistance(
    polyline[bestSegment].lat, polyline[bestSegment].lon,
    polyline[bestSegment + 1].lat, polyline[bestSegment + 1].lon
  );
  distAlong += bestFraction * segLen;

  return { distAlong, distFromLine: minDist };
}

// Encadear segmentos de rodovia em uma polilinha contínua
function chainWaySegments(geometries) {
  if (geometries.length === 0) return [];
  if (geometries.length === 1) return geometries[0];

  const segments = geometries.map((g, i) => ({ id: i, points: g }));
  const used = new Set([0]);
  let chain = [...segments[0].points];

  const THRESHOLD = 0.00015; // ~15m para considerar endpoints conectados

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < segments.length; i++) {
      if (used.has(i)) continue;

      const seg = segments[i];
      const segStart = seg.points[0];
      const segEnd = seg.points[seg.points.length - 1];
      const chainStart = chain[0];
      const chainEnd = chain[chain.length - 1];

      if (coordsClose(chainEnd, segStart, THRESHOLD)) {
        chain.push(...seg.points.slice(1));
        used.add(i); changed = true;
      } else if (coordsClose(chainEnd, segEnd, THRESHOLD)) {
        chain.push(...[...seg.points].reverse().slice(1));
        used.add(i); changed = true;
      } else if (coordsClose(chainStart, segEnd, THRESHOLD)) {
        chain.unshift(...seg.points.slice(0, -1));
        used.add(i); changed = true;
      } else if (coordsClose(chainStart, segStart, THRESHOLD)) {
        chain.unshift(...[...seg.points].reverse().slice(0, -1));
        used.add(i); changed = true;
      }
    }
  }
  return chain;
}

function coordsClose(p1, p2, threshold) {
  return Math.abs(p1.lat - p2.lat) < threshold &&
         Math.abs(p1.lon - p2.lon) < threshold;
}

// Estimar KM por interpolação geométrica
// Projeta o usuário e os milestones na polilinha da rodovia e interpola
function estimateKmByInterpolation(userLat, userLng, polyline, milestones) {
  const userProj = projectPointOnPolyline(userLat, userLng, polyline);

  // Projetar milestones na polilinha (rejeitar os que estão longe da rodovia)
  const projectedMs = milestones
    .map(ms => {
      const proj = projectPointOnPolyline(ms.lat, ms.lon, polyline);
      if (proj.distFromLine > 200) return null; // muito longe da rodovia
      return { km: ms.km, distAlong: proj.distAlong, distFromLine: proj.distFromLine };
    })
    .filter(Boolean)
    .sort((a, b) => a.distAlong - b.distAlong);

  if (projectedMs.length === 0) {
    // Nenhum milestone perto da rodovia - usar o mais próximo por distância direta
    let nearest = null;
    let nearestDist = Infinity;
    for (const ms of milestones) {
      const dist = haversineDistance(userLat, userLng, ms.lat, ms.lon);
      if (dist < nearestDist) { nearestDist = dist; nearest = ms; }
    }
    if (nearest && nearestDist < 5000) {
      return { km: nearest.km, distance: Math.round(nearestDist), estimated: true, method: 'nearest' };
    }
    return null;
  }

  const userDist = userProj.distAlong;

  // Encontrar milestones que "envolvem" a posição do usuário
  let before = null, after = null;
  for (const ms of projectedMs) {
    if (ms.distAlong <= userDist) before = ms;
    else if (!after) after = ms;
  }

  // Caso ideal: interpolação entre dois milestones
  if (before && after) {
    const range = after.distAlong - before.distAlong;
    if (range > 0) {
      const fraction = (userDist - before.distAlong) / range;
      const km = before.km + fraction * (after.km - before.km);
      return {
        km: Math.round(km * 10) / 10,
        estimated: true,
        method: 'interpolation',
        distance: Math.round(userProj.distFromLine)
      };
    }
  }

  // Extrapolação a partir de milestone(s) conhecidos
  const ref = before || after;
  if (ref) {
    const distDiff = (userDist - ref.distAlong) / 1000; // metros → km

    // Determinar direção do km (crescente ou decrescente ao longo da polilinha)
    let kmDirection = 1;
    if (projectedMs.length >= 2) {
      const first = projectedMs[0];
      const last = projectedMs[projectedMs.length - 1];
      const dDist = last.distAlong - first.distAlong;
      const dKm = last.km - first.km;
      if (Math.abs(dDist) > 10) kmDirection = dKm > 0 ? 1 : -1;
    }

    const km = ref.km + distDiff * kmDirection;
    return {
      km: Math.round(Math.abs(km) * 10) / 10,
      estimated: true,
      method: 'extrapolation',
      distance: Math.round(userProj.distFromLine)
    };
  }

  return null;
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
    if (locationInfo.highway.milestone?.km != null) {
      if (locationInfo.highway.milestone.estimated) {
        hwText += ` - ~KM ${locationInfo.highway.milestone.km} (estimado)`;
      } else {
        hwText += ` - KM ${locationInfo.highway.milestone.km}`;
        if (locationInfo.highway.milestone.distance > 50) {
          hwText += ` (~${locationInfo.highway.milestone.distance}m do marco)`;
        }
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
    if (info.highway.milestone?.km != null) {
      if (info.highway.milestone.estimated) {
        hwText += ` - ~KM ${info.highway.milestone.km} (estimado)`;
      } else {
        hwText += ` - KM ${info.highway.milestone.km}`;
      }
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
