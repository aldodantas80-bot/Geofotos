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
