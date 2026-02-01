// ========== App (Main Initialization) ==========

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
  initHistory();
  initSpeechRecognition();
  initBackup();
  initPWAInstall();
  registerServiceWorker();
}

// Iniciar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);
