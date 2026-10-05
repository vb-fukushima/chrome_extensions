(() => {
  'use strict';

  const DEFAULTS = {
    dueDateOffsetDays: 14,
    affiliationValue: '4', // システム
  };

  const offsetInput = document.querySelector('#due-date-offset');
  const affiliationSelect = document.querySelector('#affiliation');
  const saveBtn = document.querySelector('#save');
  const status = document.querySelector('#status');

  function showStatus(message, type) {
    status.textContent = message;
    status.className = type;
  }

  chrome.storage.sync.get(DEFAULTS, ({ dueDateOffsetDays, affiliationValue }) => {
    offsetInput.value = dueDateOffsetDays;
    affiliationSelect.value = affiliationValue;
  });

  function save() {
    const offset = Number(offsetInput.value);
    if (offsetInput.value === '' || !Number.isInteger(offset) || offset < 0 || offset > 365) {
      showStatus('期日は0〜365の整数で入力してください', 'error');
      return;
    }
    const affiliationValue = affiliationSelect.value;
    const affiliationLabel = affiliationSelect.selectedOptions[0].textContent;
    chrome.storage.sync.set({ dueDateOffsetDays: offset, affiliationValue }, () => {
      showStatus(`保存しました（${offset}日後 / ${affiliationLabel}）`, 'success');
    });
  }

  saveBtn.addEventListener('click', save);
  offsetInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save();
  });
})();
