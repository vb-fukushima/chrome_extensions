const STORAGE_KEY_SETTINGS = 'shugyoOtSettings';

const DEFAULT_SETTINGS = {
  legalRatePerMin: 44.59,
  normalRatePerMin: 41.94,
  adjustmentYen: 45400,
};

const legalRateInput = document.getElementById('legalRate');
const normalRateInput = document.getElementById('normalRate');
const adjustmentInput = document.getElementById('adjustment');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');

function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.classList.remove('hidden');
  setTimeout(() => statusEl.classList.add('hidden'), 2000);
}

function fillForm(settings) {
  legalRateInput.value = settings.legalRatePerMin;
  normalRateInput.value = settings.normalRatePerMin;
  adjustmentInput.value = settings.adjustmentYen;
}

async function loadSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY_SETTINGS] || {}) };
}

saveBtn.addEventListener('click', async () => {
  const settings = {
    legalRatePerMin: parseFloat(legalRateInput.value),
    normalRatePerMin: parseFloat(normalRateInput.value),
    adjustmentYen: parseInt(adjustmentInput.value, 10),
  };

  if (
    isNaN(settings.legalRatePerMin) ||
    isNaN(settings.normalRatePerMin) ||
    isNaN(settings.adjustmentYen)
  ) {
    showStatus('数値を正しく入力してください');
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });
  showStatus('保存しました');
});

resetBtn.addEventListener('click', async () => {
  fillForm(DEFAULT_SETTINGS);
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: DEFAULT_SETTINGS });
  showStatus('デフォルトに戻しました');
});

loadSettings().then(fillForm);
