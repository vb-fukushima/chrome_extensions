(() => {
  'use strict';

  // ==== 設定値（HTMLから特定した値） ====
  const CUSTOM_FIELD_92 = '92';       // 所属(旧トラッカー) のカスタムフィールドID
  // ポップアップで未設定時の既定値
  const DEFAULTS = {
    dueDateOffsetDays: 14, // 期日: 何日後にするか
    affiliationValue: '4', // 所属(旧トラッカー): 「システム」の選択肢value
  };

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

  // 担当者: ログイン中のユーザー自身。Redmineが描画する「自分に割り当て」リンクのdata-idから取得する
  function getMyUserId() {
    const link = document.querySelector('.assign-to-me-link');
    if (link?.dataset.id) return link.dataset.id;
    const myOption = [...document.querySelectorAll('#issue_assigned_to_id option')]
      .find((option) => option.textContent.includes('<< 自分 >>'));
    return myOption?.value || null;
  }

  function getSettings() {
    return new Promise((resolve) => chrome.storage.sync.get(DEFAULTS, resolve));
  }

  async function autofill() {
    const results = [];
    const { dueDateOffsetDays, affiliationValue } = await getSettings();

    const assignedTo = document.querySelector('#issue_assigned_to_id');
    const myUserId = getMyUserId();
    results.push(['担当者', myUserId ? setSelectValue(assignedTo, myUserId) : false]);

    const dueDateInput = document.querySelector('#issue_due_date');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDateOffsetDays);
    results.push(['期日', setDateInputValue(dueDateInput, formatDate(dueDate))]);

    const customField92 = document.querySelector(`#issue_custom_field_values_${CUSTOM_FIELD_92}`);
    results.push(['所属(旧トラッカー)', setSelectValue(customField92, affiliationValue)]);

    const failed = results.filter(([, ok]) => !ok).map(([label]) => label);
    if (failed.length > 0) {
      alert(`一部の項目が見つからず設定できませんでした: ${failed.join(', ')}\nRedmine側のフォーム構成が変わった可能性があります。`);
      return false;
    }
    return true;
  }

  const BUTTON_LABEL = '⚡ 一発入力くん😎';
  const BUTTON_DONE_LABEL = '✓ 入力しました';

  // :hover/:activeを使うためstyle要素で指定する。Redmine本体のbutton用CSS（height/line-height等）に潰されないよう!important
  function injectButtonStyles() {
    if (document.querySelector('#redmine-autofill-style')) return;
    const style = document.createElement('style');
    style.id = 'redmine-autofill-style';
    style.textContent = `
      #redmine-autofill-btn {
        position: fixed !important;
        top: 90px !important;
        right: 24px !important;
        z-index: 9999 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        width: auto !important;
        height: auto !important;
        min-height: 40px !important;
        margin: 0 !important;
        padding: 10px 16px !important;
        line-height: 1.4 !important;
        white-space: nowrap !important;
        overflow: visible !important;
        background-color: #c0392b !important;
        color: #fff !important;
        border: none !important;
        border-radius: 6px !important;
        font-size: 14px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
        transition: transform 0.08s ease, box-shadow 0.08s ease, background-color 0.2s ease !important;
      }
      #redmine-autofill-btn:hover {
        background-color: #a93226 !important;
      }
      #redmine-autofill-btn:active {
        transform: translateY(2px) scale(0.97) !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;
        background-color: #922b21 !important;
      }
      #redmine-autofill-btn.is-done {
        background-color: #27ae60 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function createButton() {
    if (document.querySelector('#redmine-autofill-btn')) return;
    injectButtonStyles();

    const btn = document.createElement('button');
    btn.id = 'redmine-autofill-btn';
    btn.type = 'button';
    btn.textContent = BUTTON_LABEL;
    let resetTimer;
    btn.addEventListener('click', async () => {
      const ok = await autofill();
      if (!ok) return;
      // 入力できたことが分かるよう、一時的に緑色+完了表示にする
      btn.classList.add('is-done');
      btn.textContent = BUTTON_DONE_LABEL;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        btn.classList.remove('is-done');
        btn.textContent = BUTTON_LABEL;
      }, 1500);
    });

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

  // 期日が空の間は「作成」「連続作成」ボタンを押せなくする
  function updateSubmitButtons() {
    const form = document.querySelector('#issue_assigned_to_id')?.closest('form');
    if (!form) return;
    const dueDateInput = form.querySelector('#issue_due_date');
    const disabled = !dueDateInput || !dueDateInput.value;
    const submits = form.querySelectorAll('input[type="submit"]');
    submits.forEach((submit) => {
      submit.disabled = disabled;
      submit.style.opacity = disabled ? '0.5' : '';
      submit.style.cursor = disabled ? 'not-allowed' : '';
    });

    const lastSubmit = submits[submits.length - 1];
    if (!lastSubmit) return;
    let warning = form.querySelector('#redmine-autofill-due-date-warning');
    if (!warning) {
      warning = document.createElement('div');
      warning.id = 'redmine-autofill-due-date-warning';
      warning.textContent = '⚠ 期日が未入力のため作成できません。期日を入力してください。';
      Object.assign(warning.style, {
        marginTop: '8px',
        color: '#c0392b',
        fontWeight: 'bold',
      });
      // 「作成」「連続作成」ボタンの並びの下に出す（ボタンはform末尾に直置きされている）
      if (lastSubmit.parentElement === form) {
        form.appendChild(warning);
      } else {
        lastSubmit.parentElement.after(warning);
      }
    }
    warning.style.display = disabled ? '' : 'none';
  }

  function attachDueDateWatcher() {
    const form = document.querySelector('#issue_assigned_to_id')?.closest('form');
    if (!form || form.dataset.autofillDueDateWatcherAttached) return;
    form.dataset.autofillDueDateWatcherAttached = 'true';
    // トラッカー変更等でRedmineが属性欄をAJAXで差し替えるため、委譲+MutationObserverで追従する
    form.addEventListener('input', updateSubmitButtons);
    form.addEventListener('change', updateSubmitButtons);
    new MutationObserver(updateSubmitButtons).observe(form, { childList: true, subtree: true });
    updateSubmitButtons();
  }

  // フォームの主要要素が描画されるまで軽くリトライ（select2初期化待ち対策）
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (document.querySelector('#issue_assigned_to_id') || attempts > 20) {
      createButton();
      attachSubmitGuard();
      attachDueDateWatcher();
      clearInterval(timer);
    }
  }, 250);
})();
