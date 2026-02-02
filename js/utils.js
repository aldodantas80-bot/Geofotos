// ========== Utils ==========

// Detectar iOS
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Mostrar toast
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// Copiar para clipboard
async function copyToClipboard(text) {
  try {
    // Tenta API moderna primeiro
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showToast('Copiado!');
      return;
    }
  } catch (e) {
    console.log('Clipboard API falhou, tentando fallback');
  }

  // Fallback: textarea temporário
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const success = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (success) {
      showToast('Copiado!');
    } else {
      showToast('Erro ao copiar');
    }
  } catch (err) {
    showToast('Erro ao copiar');
  }
}

// Formatar coordenadas
function formatCoords(lat, lng) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// Download de arquivo (mídia)
function downloadFile(base64Data, filename) {
  const link = document.createElement('a');
  link.href = base64Data;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Abrir localização no mapa (Google Maps ou Apple Maps)
function openInMaps(lat, lng) {
  const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const url = isIOSDevice
    ? `maps://maps.apple.com/?q=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  window.open(url, '_blank');
}

// Obter label de precisão do GPS (cores com bom contraste)
function getAccuracyLabel(meters) {
  if (meters <= 5) return { text: 'Excelente', color: '#4ade80', icon: '🟢' };
  if (meters <= 15) return { text: 'Boa', color: '#60a5fa', icon: '🔵' };
  if (meters <= 50) return { text: 'Moderada', color: '#fbbf24', icon: '🟡' };
  return { text: 'Baixa', color: '#f87171', icon: '🔴' };
}
