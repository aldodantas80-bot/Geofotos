// ========== Backup / Export / Import ==========

async function exportBackup() {
  try {
    const records = await getAllRecords();
    const backup = {
      version: 1,
      exportDate: new Date().toISOString(),
      records: records
    };
    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `geofotos_backup_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Backup exportado!');
  } catch (err) {
    console.error('Erro ao exportar backup:', err);
    showToast('Erro ao exportar backup');
  }
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const backup = JSON.parse(text);

    // Validar estrutura
    if (!backup.version || !Array.isArray(backup.records)) {
      showToast('Arquivo de backup inválido');
      return;
    }

    const count = backup.records.length;
    if (count === 0) {
      showToast('Backup vazio');
      return;
    }

    if (!confirm(`Importar ${count} registros? Dados atuais serão mantidos.`)) {
      return;
    }

    // Importar cada registro (removendo o id antigo para criar um novo)
    for (const record of backup.records) {
      const newRecord = { ...record };
      delete newRecord.id;
      await saveRecord(newRecord);
    }

    showToast(`${count} registros importados!`);

    // Atualizar histórico se estiver visível
    const historyTab = document.querySelector('.tab[data-view="history"]');
    if (historyTab && historyTab.classList.contains('active')) {
      renderHistory();
    }
  } catch (err) {
    console.error('Erro ao importar backup:', err);
    showToast('Erro ao importar backup');
  }
}

async function clearAllData() {
  if (!confirm('Tem certeza? Esta ação não pode ser desfeita.')) {
    return;
  }

  const confirmText = prompt('Digite APAGAR para confirmar:');
  if (confirmText !== 'APAGAR') {
    showToast('Operação cancelada');
    return;
  }

  try {
    await clearAllRecords();
    showToast('Dados apagados');
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    console.error('Erro ao apagar dados:', err);
    showToast('Erro ao apagar dados');
  }
}

// Inicializar eventos de backup
function initBackup() {
  document.getElementById('exportBackupBtn').addEventListener('click', exportBackup);

  document.getElementById('importBackupBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importBackup(file);
      e.target.value = '';
    }
  });

  document.getElementById('clearAllDataBtn').addEventListener('click', clearAllData);
}
