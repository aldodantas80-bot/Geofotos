// ========== App (Main Initialization) ==========

// ========== Tag Manager ==========
async function initTagsManager() {
  await renderTagsManager();
}

async function renderTagsManager() {
  const listEl = document.getElementById('tagsManagerList');
  const emptyEl = document.getElementById('tagsManagerEmpty');
  if (!listEl || !emptyEl) return;

  const tags = await getAllTagsWithIds();

  if (tags.length === 0) {
    listEl.innerHTML = '';
    listEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  listEl.style.display = 'flex';

  listEl.innerHTML = tags.map(tag => `
    <div class="tag-manager-item" data-id="${tag.id}" data-name="${tag.name}">
      <span class="tag-manager-name">${tag.name}</span>
      <div class="tag-manager-actions">
        <button class="btn-tag-edit" title="Renomear">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-tag-delete" title="Excluir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // Attach event listeners
  listEl.querySelectorAll('.btn-tag-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.tag-manager-item');
      startEditTag(item);
    });
  });

  listEl.querySelectorAll('.btn-tag-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const item = e.target.closest('.tag-manager-item');
      const id = parseInt(item.dataset.id);
      const name = item.dataset.name;
      if (confirm(`Excluir a tag "${name}"? Ela será removida de todos os registros.`)) {
        await deleteTag(id);
        await removeTagFromRecords(name);
        showToast(`Tag "${name}" excluída`);
        await renderTagsManager();
      }
    });
  });
}

function startEditTag(item) {
  const nameEl = item.querySelector('.tag-manager-name');
  const actionsEl = item.querySelector('.tag-manager-actions');
  const oldName = item.dataset.name;

  // Replace name with input
  nameEl.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-manager-input';
  input.value = oldName;
  nameEl.parentNode.insertBefore(input, nameEl.nextSibling);
  input.focus();
  input.select();

  // Replace actions with save/cancel
  actionsEl.style.display = 'none';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-tag-save';
  saveBtn.title = 'Salvar';
  saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-tag-cancel';
  cancelBtn.title = 'Cancelar';
  cancelBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const editActions = document.createElement('div');
  editActions.className = 'tag-manager-actions editing';
  editActions.appendChild(saveBtn);
  editActions.appendChild(cancelBtn);
  actionsEl.parentNode.appendChild(editActions);

  async function saveEdit() {
    const newName = input.value.trim();
    if (!newName) {
      showToast('Nome da tag não pode ser vazio');
      return;
    }
    if (newName !== oldName) {
      const id = parseInt(item.dataset.id);
      await renameTag(id, newName);
      await renameTagInRecords(oldName, newName);
      showToast(`Tag renomeada para "${newName}"`);
    }
    await renderTagsManager();
  }

  function cancelEdit() {
    input.remove();
    editActions.remove();
    nameEl.style.display = '';
    actionsEl.style.display = '';
  }

  saveBtn.addEventListener('click', saveEdit);
  cancelBtn.addEventListener('click', cancelEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  });
}

// ========== Tabs ==========
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.view).classList.add('active');

      if (tab.dataset.view === 'history') {
        renderHistory();
      }

      if (tab.dataset.view === 'map') {
        initMap();
        refreshMap();
      }

      if (tab.dataset.view === 'settings') {
        renderTagsManager();
      }
    });
  });
}

// ========== PWA Install ==========
let deferredPrompt;

function initPWAInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installPrompt').classList.add('show');
  });

  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('installPrompt').classList.remove('show');
  });

  document.getElementById('dismissInstall').addEventListener('click', () => {
    document.getElementById('installPrompt').classList.remove('show');
  });

  // iOS install prompt
  if (isIOS && !window.navigator.standalone && !localStorage.getItem('iosInstallDismissed')) {
    setTimeout(() => {
      document.getElementById('iosInstallPrompt').classList.add('show');
    }, 2000);
  }

  document.getElementById('dismissIosInstall').addEventListener('click', () => {
    document.getElementById('iosInstallPrompt').classList.remove('show');
    localStorage.setItem('iosInstallDismissed', 'true');
  });
}

// ========== HERE API Key ==========
function initHereApiKey() {
  const input = document.getElementById('hereApiKeyInput');
  const saveBtn = document.getElementById('saveHereApiKeyBtn');
  const status = document.getElementById('hereApiKeyStatus');
  if (!input || !saveBtn) return;

  // Carregar chave salva
  const savedKey = getHereApiKey();
  if (savedKey) {
    input.value = savedKey;
    status.textContent = '✓ Chave configurada — referências HERE ativas';
    status.style.color = 'var(--success)';
  }

  saveBtn.addEventListener('click', () => {
    const key = input.value.trim();
    saveHereApiKey(key);

    if (key) {
      status.textContent = '✓ Chave salva — referências HERE ativas';
      status.style.color = 'var(--success)';
      showToast('API Key HERE salva com sucesso');
    } else {
      status.textContent = 'Chave removida — usando apenas OSM/Wikidata';
      status.style.color = 'var(--text-muted)';
      showToast('API Key HERE removida');
    }
  });
}

// ========== Service Worker ==========
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
}

// ========== Main Init ==========
async function init() {
  await openDB();
  console.log('DB ready');

  initTabs();
  initCapture();
  initGpsMonitor();
  initHistory();
  initSpeechRecognition();
  initBackup();
  initTagsManager();
  initPWAInstall();
  initHereApiKey();
  registerServiceWorker();
}

// Iniciar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);
