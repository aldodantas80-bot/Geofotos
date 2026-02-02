/**
 * Módulo de Pontos Notáveis das Rodovias Federais
 * Gerencia a exibição, filtragem e cálculo de KM aproximado
 */

// Estado do módulo
let highwayPoints = [];
let highwayLayer = null;
let clusterGroup = null;
let isLayerVisible = false;
let currentFilters = {
    br: 'all',
    tipo: 'all',
    search: ''
};

// Configuração de ícones por tipo
const POINT_ICONS = {
    prf: { emoji: '🚔', color: '#FFD700', priority: 1 },
    ponte: { emoji: '🌉', color: '#4A90D9', priority: 2 },
    viaduto: { emoji: '🛤️', color: '#6B8E23', priority: 2 },
    acesso: { emoji: '↗️', color: '#32CD32', priority: 3 },
    posto: { emoji: '⛽', color: '#FF6347', priority: 3 },
    fiscal: { emoji: '🏛️', color: '#9370DB', priority: 2 },
    retorno: { emoji: '↩️', color: '#FFA500', priority: 4 },
    industria: { emoji: '🏭', color: '#808080', priority: 4 },
    comercio: { emoji: '🏪', color: '#20B2AA', priority: 4 },
    passarela: { emoji: '🚶', color: '#DDA0DD', priority: 3 },
    referencia: { emoji: '📍', color: '#CD853F', priority: 4 }
};

// Tipos para exibição no filtro
const TIPOS_LABEL = {
    prf: 'Posto PRF',
    ponte: 'Ponte',
    viaduto: 'Viaduto',
    acesso: 'Acesso',
    posto: 'Posto de Combustível',
    fiscal: 'Posto Fiscal',
    retorno: 'Retorno',
    industria: 'Indústria',
    comercio: 'Comércio',
    passarela: 'Passarela',
    referencia: 'Referência'
};

/**
 * Carrega os pontos notáveis do arquivo JSON
 */
async function loadHighwayPoints() {
    try {
        const response = await fetch('./data/highway-points.json');
        if (!response.ok) throw new Error('Falha ao carregar pontos');
        const data = await response.json();
        highwayPoints = data.points || [];
        console.log(`✅ Carregados ${highwayPoints.length} pontos notáveis`);
        return highwayPoints;
    } catch (error) {
        console.error('Erro ao carregar pontos notáveis:', error);
        return [];
    }
}

/**
 * Cria um ícone customizado para o marcador
 */
function createPointIcon(point) {
    const config = POINT_ICONS[point.tipo] || POINT_ICONS.referencia;

    return L.divIcon({
        className: 'highway-point-marker',
        html: `<div class="point-icon" style="background-color: ${config.color};" data-tipo="${point.tipo}">${config.emoji}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
    });
}

/**
 * Cria o conteúdo do popup para um ponto
 */
function createPopupContent(point) {
    const tipoLabel = TIPOS_LABEL[point.tipo] || 'Referência';

    return `
        <div class="highway-popup">
            <div class="popup-header">
                <span class="popup-br">BR-${point.br}</span>
                <span class="popup-km">km ${point.km.toFixed(1)}</span>
            </div>
            <div class="popup-title">${point.descricao}</div>
            <div class="popup-details">
                <span class="popup-tipo">${tipoLabel}</span>
                <span class="popup-sentido">${point.sentido}</span>
            </div>
            <div class="popup-municipio">📍 ${point.municipio} - ${point.uf}</div>
            <div class="popup-coords">${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</div>
            <button class="popup-maps-btn" onclick="openInMaps(${point.lat}, ${point.lng})">
                Abrir no Maps
            </button>
        </div>
    `;
}

/**
 * Abre coordenadas no Google Maps
 */
function openInMaps(lat, lng) {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(url, '_blank');
}

/**
 * Filtra os pontos com base nos filtros atuais
 */
function filterPoints() {
    return highwayPoints.filter(point => {
        // Filtro por BR
        if (currentFilters.br !== 'all' && point.br !== currentFilters.br) {
            return false;
        }

        // Filtro por tipo
        if (currentFilters.tipo !== 'all' && point.tipo !== currentFilters.tipo) {
            return false;
        }

        // Filtro por busca
        if (currentFilters.search) {
            const searchLower = currentFilters.search.toLowerCase();
            const matchDesc = point.descricao.toLowerCase().includes(searchLower);
            const matchMun = point.municipio.toLowerCase().includes(searchLower);
            const matchKm = point.km.toString().includes(searchLower);
            if (!matchDesc && !matchMun && !matchKm) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Determina a visibilidade do ponto baseado no zoom
 */
function shouldShowAtZoom(point, zoom) {
    const config = POINT_ICONS[point.tipo] || POINT_ICONS.referencia;

    // PRF sempre visível
    if (point.tipo === 'prf') return true;

    // Zoom baixo (< 10): só PRF
    if (zoom < 10) return false;

    // Zoom médio (10-12): PRF + pontes + viadutos + postos fiscais
    if (zoom < 12) {
        return config.priority <= 2;
    }

    // Zoom alto (12-14): + acessos + postos + passarelas
    if (zoom < 14) {
        return config.priority <= 3;
    }

    // Zoom muito alto (>= 14): todos
    return true;
}

/**
 * Atualiza a camada de pontos no mapa
 */
function updateHighwayLayer(map) {
    if (!map || !isLayerVisible) return;

    const zoom = map.getZoom();
    const filteredPoints = filterPoints();

    // Limpar camada existente
    if (clusterGroup) {
        clusterGroup.clearLayers();
    } else {
        // Criar cluster group se não existir
        clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 15,
            iconCreateFunction: function(cluster) {
                const count = cluster.getChildCount();
                let size = 'small';
                if (count > 50) size = 'large';
                else if (count > 20) size = 'medium';

                return L.divIcon({
                    html: `<div class="cluster-icon cluster-${size}">${count}</div>`,
                    className: 'highway-cluster',
                    iconSize: [36, 36]
                });
            }
        });
        map.addLayer(clusterGroup);
    }

    // Adicionar pontos filtrados
    filteredPoints.forEach(point => {
        if (shouldShowAtZoom(point, zoom)) {
            const marker = L.marker([point.lat, point.lng], {
                icon: createPointIcon(point)
            });
            marker.bindPopup(createPopupContent(point), {
                maxWidth: 280,
                className: 'highway-popup-container'
            });
            clusterGroup.addLayer(marker);
        }
    });
}

/**
 * Toggle da visibilidade da camada
 */
function toggleHighwayLayer(map) {
    isLayerVisible = !isLayerVisible;

    if (isLayerVisible) {
        updateHighwayLayer(map);
    } else {
        if (clusterGroup) {
            clusterGroup.clearLayers();
        }
    }

    // Atualizar botão
    const btn = document.getElementById('toggleHighwayBtn');
    if (btn) {
        btn.classList.toggle('active', isLayerVisible);
        btn.title = isLayerVisible ? 'Ocultar pontos notáveis' : 'Mostrar pontos notáveis';
    }

    // Mostrar/ocultar painel de filtros
    const panel = document.getElementById('highwayFiltersPanel');
    if (panel) {
        panel.style.display = isLayerVisible ? 'block' : 'none';
    }

    return isLayerVisible;
}

/**
 * Atualiza os filtros
 */
function setHighwayFilters(filters, map) {
    currentFilters = { ...currentFilters, ...filters };
    if (isLayerVisible) {
        updateHighwayLayer(map);
    }
}

/**
 * Calcula a distância entre dois pontos (Haversine)
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Encontra o ponto notável mais próximo
 */
function findNearestPoint(lat, lng, maxDistance = 2) {
    if (highwayPoints.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    highwayPoints.forEach(point => {
        const distance = calculateDistance(lat, lng, point.lat, point.lng);
        if (distance < minDistance && distance <= maxDistance) {
            minDistance = distance;
            nearest = { ...point, distance };
        }
    });

    return nearest;
}

/**
 * Encontra os dois pontos mais próximos para interpolação do KM
 */
function findSurroundingPoints(lat, lng, br = null) {
    // Filtrar por BR se especificado
    let points = br ? highwayPoints.filter(p => p.br === br) : highwayPoints;

    if (points.length < 2) return null;

    // Calcular distância para cada ponto
    const pointsWithDistance = points.map(p => ({
        ...p,
        distance: calculateDistance(lat, lng, p.lat, p.lng)
    }));

    // Ordenar por distância
    pointsWithDistance.sort((a, b) => a.distance - b.distance);

    // Pegar os dois mais próximos
    const closest = pointsWithDistance.slice(0, 2);

    // Verificar se estão em KMs diferentes (para interpolação)
    if (closest.length < 2) return null;

    return closest;
}

/**
 * Estima o KM aproximado baseado na localização atual
 * Usa interpolação linear entre os dois pontos mais próximos
 */
function estimateKM(lat, lng) {
    // Primeiro, encontrar a rodovia mais próxima
    const nearest = findNearestPoint(lat, lng, 5); // 5km de raio máximo

    if (!nearest) {
        return null;
    }

    // Encontrar pontos ao redor na mesma BR
    const surrounding = findSurroundingPoints(lat, lng, nearest.br);

    if (!surrounding || surrounding.length < 2) {
        // Retornar o ponto mais próximo
        return {
            br: nearest.br,
            km: nearest.km,
            estimado: false,
            pontoProximo: nearest,
            distancia: nearest.distance
        };
    }

    const [p1, p2] = surrounding;

    // Se a distância é muito grande, não é confiável
    if (p1.distance > 3) {
        return {
            br: nearest.br,
            km: nearest.km,
            estimado: false,
            pontoProximo: nearest,
            distancia: nearest.distance,
            precisao: 'baixa'
        };
    }

    // Interpolação linear
    // Calcular a proporção da distância
    const totalDist = p1.distance + p2.distance;
    const ratio = p1.distance / totalDist;

    // Estimar KM
    const kmDiff = p2.km - p1.km;
    const estimatedKm = p1.km + (kmDiff * ratio);

    // Determinar precisão baseado na distância
    let precisao = 'alta';
    if (p1.distance > 1) precisao = 'média';
    if (p1.distance > 2) precisao = 'baixa';

    return {
        br: nearest.br,
        km: Math.round(estimatedKm * 10) / 10, // Arredondar para 1 casa decimal
        estimado: true,
        pontoProximo: nearest,
        distancia: p1.distance,
        precisao,
        pontosReferencia: [p1, p2]
    };
}

/**
 * Formata a informação do KM para exibição
 */
function formatKMInfo(kmInfo) {
    if (!kmInfo) {
        return null;
    }

    const prefix = kmInfo.estimado ? '~' : '';
    const kmText = `BR-${kmInfo.br}, km ${prefix}${kmInfo.km.toFixed(1)}`;

    let details = '';
    if (kmInfo.pontoProximo) {
        details = `Próximo a: ${kmInfo.pontoProximo.descricao}`;
    }

    return {
        text: kmText,
        details,
        precisao: kmInfo.precisao || 'alta',
        distancia: kmInfo.distancia
    };
}

/**
 * Obtém sugestão de referência para a localização atual
 */
function getLocationSuggestion(lat, lng) {
    const kmInfo = estimateKM(lat, lng);

    if (!kmInfo) {
        return null;
    }

    const formatted = formatKMInfo(kmInfo);

    return {
        ...kmInfo,
        formatted,
        suggestion: `${formatted.text} - ${formatted.details}`
    };
}

/**
 * Obtém lista de rodovias disponíveis
 */
function getAvailableBRs() {
    const brs = [...new Set(highwayPoints.map(p => p.br))];
    return brs.sort();
}

/**
 * Obtém lista de tipos disponíveis
 */
function getAvailableTypes() {
    const tipos = [...new Set(highwayPoints.map(p => p.tipo))];
    return tipos.sort();
}

/**
 * Obtém estatísticas dos pontos
 */
function getPointsStats() {
    const stats = {
        total: highwayPoints.length,
        porBR: {},
        porTipo: {},
        porMunicipio: {}
    };

    highwayPoints.forEach(p => {
        stats.porBR[p.br] = (stats.porBR[p.br] || 0) + 1;
        stats.porTipo[p.tipo] = (stats.porTipo[p.tipo] || 0) + 1;
        stats.porMunicipio[p.municipio] = (stats.porMunicipio[p.municipio] || 0) + 1;
    });

    return stats;
}

// Exportar funções para uso global
window.HighwayPoints = {
    load: loadHighwayPoints,
    toggle: toggleHighwayLayer,
    update: updateHighwayLayer,
    setFilters: setHighwayFilters,
    findNearest: findNearestPoint,
    estimateKM,
    formatKMInfo,
    getSuggestion: getLocationSuggestion,
    getBRs: getAvailableBRs,
    getTypes: getAvailableTypes,
    getStats: getPointsStats,
    isVisible: () => isLayerVisible,
    getPoints: () => highwayPoints,
    TIPOS_LABEL
};
