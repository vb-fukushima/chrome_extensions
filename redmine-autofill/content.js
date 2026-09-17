(() => {
  'use strict';

  // ==== 設定値（HTMLから特定した値） ====
  const ASSIGNED_TO_ID = '304';       // 担当者: 自分 (福島 勇人)
  const CUSTOM_FIELD_92 = '92';       // 所属(旧トラッカー) のカスタムフィールドID
  const CUSTOM_FIELD_92_VALUE = '4';  // 「システム」の選択肢value
  const DUE_DATE_OFFSET_DAYS = 14;    // 期日: 何日後にするか

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function setSelectValue(selectEl, value) {
    if (!selectEl) return false;
    selectEl.value = value;

    // select2化されている場合はjQueryのchangeイベントで見た目も更新する
    if (window.jQuery) {
      window.jQuery(selectEl).val(value).trigger('change');
    } else {
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  function setDateInputValue(inputEl, value) {
    if (!inputEl) return false;
    inputEl.value = value;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function autofill() {
    const results = [];

    const assignedTo = document.querySelector('#issue_assigned_to_id');
    results.push(['担当者', setSelectValue(assignedTo, ASSIGNED_TO_ID)]);

    const dueDateInput = document.querySelector('#issue_due_date');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + DUE_DATE_OFFSET_DAYS);
    results.push(['期日', setDateInputValue(dueDateInput, formatDate(dueDate))]);

    const customField92 = document.querySelector(`#issue_custom_field_values_${CUSTOM_FIELD_92}`);
    results.push(['所属(旧トラッカー)', setSelectValue(customField92, CUSTOM_FIELD_92_VALUE)]);

    const failed = results.filter(([, ok]) => !ok).map(([label]) => label);
    if (failed.length > 0) {
      alert(`一部の項目が見つからず設定できませんでした: ${failed.join(', ')}\nRedmine側のフォーム構成が変わった可能性があります。`);
    }
  }

  function createButton() {
    if (document.querySelector('#redmine-autofill-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'redmine-autofill-btn';
    btn.type = 'button';
    btn.textContent = '⚡ 一発入力';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '90px',
      right: '24px',
      zIndex: '9999',
      padding: '10px 16px',
      backgroundColor: '#c0392b',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: 'bold',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    });
    btn.addEventListener('mouseenter', () => (btn.style.backgroundColor = '#a93226'));
    btn.addEventListener('mouseleave', () => (btn.style.backgroundColor = '#c0392b'));
    btn.addEventListener('click', autofill);

    document.body.appendChild(btn);
  }

  function checkRequiredFieldsOnSubmit(event) {
    const missing = [];

    const assignedTo = document.querySelector('#issue_assigned_to_id');
    if (!assignedTo || !assignedTo.value) missing.push('担当者');

    const dueDateInput = document.querySelector('#issue_due_date');
    if (!dueDateInput || !dueDateInput.value) missing.push('期日');

    const customField92 = document.querySelector(`#issue_custom_field_values_${CUSTOM_FIELD_92}`);
    if (!customField92 || !customField92.value) missing.push('所属(旧トラッカー)');

    if (missing.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      alert(`以下の項目が未入力です:\n・${missing.join('\n・')}\n\n「⚡ 一発入力」ボタンで入力するか、手動で入力してから作成してください。`);
      return false;
    }
  }

  function attachSubmitGuard() {
    const form = document.querySelector('#issue_assigned_to_id')?.closest('form');
    if (!form || form.dataset.autofillGuardAttached) return;
    form.dataset.autofillGuardAttached = 'true';
    // capture:trueでRedmine本体の送信処理より先にチェックする
    form.addEventListener('submit', checkRequiredFieldsOnSubmit, { capture: true });
  }

  // フォームの主要要素が描画されるまで軽くリトライ（select2初期化待ち対策）
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (document.querySelector('#issue_assigned_to_id') || attempts > 20) {
      createButton();
      attachSubmitGuard();
      clearInterval(timer);
    }
  }, 250);
})();
