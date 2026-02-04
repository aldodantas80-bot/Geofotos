const CACHE_NAME = 'geofotos-v16';
const BASE_PATH = '/Geofotos';
const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icons/icon-192.png`,
  `${BASE_PATH}/icons/icon-512.png`,
  `${BASE_PATH}/css/styles.css`,
  `${BASE_PATH}/js/utils.js`,
  `${BASE_PATH}/js/db.js`,
  `${BASE_PATH}/js/speech.js`,
  `${BASE_PATH}/js/capture.js`,
  `${BASE_PATH}/js/history.js`,
  `${BASE_PATH}/js/backup.js`,
  `${BASE_PATH}/js/map.js`,
  `${BASE_PATH}/js/app.js`,
  `${BASE_PATH}/sw.js`,
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto, adicionando arquivos...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Todos os arquivos cacheados com sucesso!');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Erro ao cachear arquivos:', error);
      })
  );
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker ativado!');
      return self.clients.claim();
    })
  );
});

// Fetch - Cache first, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((response) => {
            // Só cacheia respostas válidas
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone));
            return response;
          })
          .catch(() => {
            // Offline e não está no cache - retorna página offline se disponível
            console.log('Falha ao buscar:', event.request.url);
          });
      })
  );
});
