// ========== Speech Recognition (Voz para Texto) ==========

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let activeTextarea = null;
let activeMicBtn = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (activeTextarea) {
      // Adiciona ao texto existente
      const currentText = activeTextarea.value;
      activeTextarea.value = currentText ? `${currentText} ${transcript}` : transcript;
    }
    stopRecording();
  };

  recognition.onerror = (event) => {
    console.log('Erro no reconhecimento:', event.error);
    let msg = 'Erro ao reconhecer voz';
    if (event.error === 'not-allowed') {
      msg = 'Permissão de microfone negada';
    } else if (event.error === 'no-speech') {
      msg = 'Nenhuma fala detectada';
    }
    showToast(msg);
    stopRecording();
  };

  recognition.onend = () => {
    stopRecording();
  };
}

function startRecording(textarea, micBtn) {
  if (!recognition) {
    showToast('Reconhecimento de voz não suportado');
    return;
  }

  activeTextarea = textarea;
  activeMicBtn = micBtn;
  micBtn.classList.add('recording');

  try {
    recognition.start();
    showToast('Ouvindo...');
  } catch (e) {
    showToast('Erro ao iniciar gravação');
    stopRecording();
  }
}

function stopRecording() {
  if (activeMicBtn) {
    activeMicBtn.classList.remove('recording');
  }
  activeMicBtn = null;
  activeTextarea = null;

  try {
    if (recognition) recognition.stop();
  } catch (e) {}
}

// Inicializar event listeners para botões de microfone
function initSpeechRecognition() {
  document.getElementById('micBtnPhoto').addEventListener('click', function() {
    if (this.classList.contains('recording')) {
      stopRecording();
    } else {
      startRecording(document.getElementById('notesInput'), this);
    }
  });

  document.getElementById('micBtnLocation').addEventListener('click', function() {
    if (this.classList.contains('recording')) {
      stopRecording();
    } else {
      startRecording(document.getElementById('locationNotesInput'), this);
    }
  });

  document.getElementById('micBtnVideo').addEventListener('click', function() {
    if (this.classList.contains('recording')) {
      stopRecording();
    } else {
      startRecording(document.getElementById('videoNotesInput'), this);
    }
  });
}
