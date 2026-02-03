// ========== Database (IndexedDB) ==========

const DB_NAME = 'geofotos';
const DB_VERSION = 2;
const STORE_NAME = 'records';
const TAGS_STORE = 'tags';
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains(TAGS_STORE)) {
        database.createObjectStore(TAGS_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function saveRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecords() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.reverse());
    request.onerror = () => reject(request.error);
  });
}

async function deleteRecord(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getRecord(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearAllRecords() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Atualizar registro existente
async function updateRecord(id, updates) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      const updated = { ...record, ...updates, updatedAt: new Date().toISOString() };
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// ========== Tags ==========

async function saveTags(tags) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAGS_STORE, 'readwrite');
    const store = tx.objectStore(TAGS_STORE);
    // Limpa e salva todas as tags
    store.clear();
    tags.forEach(tag => {
      store.add({ name: tag });
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllTags() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAGS_STORE, 'readonly');
    const store = tx.objectStore(TAGS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.map(t => t.name));
    request.onerror = () => reject(request.error);
  });
}

async function getAllTagsWithIds() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAGS_STORE, 'readonly');
    const store = tx.objectStore(TAGS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteTag(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAGS_STORE, 'readwrite');
    const store = tx.objectStore(TAGS_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function renameTag(id, newName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAGS_STORE, 'readwrite');
    const store = tx.objectStore(TAGS_STORE);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const tag = getRequest.result;
      if (tag) {
        tag.name = newName;
        const putRequest = store.put(tag);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        reject(new Error('Tag não encontrada'));
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function renameTagInRecords(oldName, newName) {
  const records = await getAllRecords();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const record of records) {
    if (record.tags && record.tags.includes(oldName)) {
      record.tags = record.tags.map(t => t === oldName ? newName : t);
      store.put(record);
    }
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removeTagFromRecords(tagName) {
  const records = await getAllRecords();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const record of records) {
    if (record.tags && record.tags.includes(tagName)) {
      record.tags = record.tags.filter(t => t !== tagName);
      store.put(record);
    }
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function addTagToDB(tagName) {
  const existingTags = await getAllTags();
  if (!existingTags.includes(tagName)) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TAGS_STORE, 'readwrite');
      const store = tx.objectStore(TAGS_STORE);
      const request = store.add({ name: tagName });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// ========== Geolocation ==========

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada neste navegador'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      }),
      (err) => {
        let msg;
        switch(err.code) {
          case err.PERMISSION_DENIED:
            msg = 'Permissão negada. Vá em Ajustes > Safari > Localização e permita.';
            break;
          case err.POSITION_UNAVAILABLE:
            msg = 'Localização indisponível. Verifique se o GPS está ativado.';
            break;
          case err.TIMEOUT:
            msg = 'Tempo esgotado. Tente novamente em local com melhor sinal.';
            break;
          default:
            msg = 'Erro desconhecido ao obter localização.';
        }
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
