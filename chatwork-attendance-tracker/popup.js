const CHATWORK_URL = 'https://www.chatwork.com/#!rid186206769';

const yearSelect    = document.getElementById('yearSelect');
const monthSelect   = document.getElementById('monthSelect');
const fetchBtn      = document.getElementById('fetchBtn');
const forceFetchBtn = document.getElementById('forceFetchBtn');
const statusDiv     = document.getElementById('status');
const tableWrapper  = document.getElementById('tableWrapper');
const tableBody     = document.getElementById('tableBody');
const userIdInput   = document.getElementById('userIdInput');
const saveUserIdBtn = document.getElementById('saveUserIdBtn');

// ----- ユーザーID 保存・読み込み -----

async function loadUserId() {
  const { myUserId } = await chrome.storage.local.get('myUserId');
  if (myUserId) {
    userIdInput.value = myUserId;
    userIdInput.classList.add('saved');
  }
  return myUserId || null;
}

saveUserIdBtn.addEventListener('click', async () => {
  const id = userIdInput.value.trim();
  if (!id) {
    alert('ユーザーIDを入力してください');
    return;
  }
  await chrome.storage.local.set({ myUserId: id });
  userIdInput.classList.add('saved');
  saveUserIdBtn.textContent = '保存済み';
  setTimeout(() => { saveUserIdBtn.textContent = '保存'; }, 1500);
});

userIdInput.addEventListener('input', () => {
  userIdInput.classList.remove('saved');
});

// ----- セレクター初期化 -----

function initSelectors() {
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 年: 前年〜今年
  for (let y = currentYear - 1; y <= currentYear; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  // 月: 1〜12
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === currentMonth) opt.selected = true;
    monthSelect.appendChild(opt);
  }
}

// ----- ステータス表示 -----

function showStatus(msg, type) {
  statusDiv.textContent = msg;
  statusDiv.className = type; // 'loading' | 'error' | 'hidden'
}

function hideStatus() {
  statusDiv.className = 'hidden';
}

// ----- Chatwork タブ操作 -----

async function ensureTabLoaded(tabId, timeoutMs = 20000) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;

  await new Promise((resolve, reject) => {
    const start = Date.now();
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('ページ読み込みタイムアウト'));
      }
    }, 300);
  });
}

async function openOrFocusChatworkTab() {
  // 全タブを取得して対象チャンネルURLと一致するものを探す
  // （hash付きURLはquery filterが効かないため手動で比較）
  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find((t) => t.url === CHATWORK_URL);

  if (existing) {
    console.log('[AttendanceTracker] 既存タブを使用:', existing.id, existing.url);
    await ensureTabLoaded(existing.id);
    return existing;
  }

  // 開いていなければ新しいタブで開く
  console.log('[AttendanceTracker] 新規タブを作成:', CHATWORK_URL);
  const tab = await chrome.tabs.create({ url: CHATWORK_URL, active: false });
  await ensureTabLoaded(tab.id);
  // SPAの初期描画を待つ
  await new Promise((r) => setTimeout(r, 1500));
  return tab;
}

async function sendMessageSafely(tabId, message) {
  // まず content script を強制注入してから送信する
  // （タブが先に開いていた場合にも確実に動作させるため）
  try {
    console.log('[AttendanceTracker] content script 注入中...');
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    console.log('[AttendanceTracker] content script 注入完了');
  } catch (e) {
    // すでに注入済みの場合もここに来るので無視
    console.log('[AttendanceTracker] content script 注入スキップ:', e.message);
  }

  // 注入後少し待ってから送信
  await new Promise((r) => setTimeout(r, 300));

  return new Promise((resolve) => {
    const TIMEOUT_MS = 60000; // 60秒（スクロールロード込み）
    const timer = setTimeout(() => {
      resolve({ success: false, error: 'タイムアウト（60秒）' });
    }, TIMEOUT_MS);

    console.log('[AttendanceTracker] メッセージ送信:', message);
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        console.error('[AttendanceTracker] メッセージ送信エラー:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[AttendanceTracker] レスポンス受信:', response);
        resolve(response);
      }
    });
  });
}

// ----- テーブル描画 -----

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function renderTable(year, month, data) {
  tableBody.innerHTML = '';

  for (const row of data) {
    const date = new Date(year, month - 1, row.day);
    const dayName = DAY_NAMES[date.getDay()];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    const tr = document.createElement('tr');
    if (isWeekend) tr.style.color = date.getDay() === 0 ? '#c00' : '#06c';

    // 日付セル
    const tdDate = document.createElement('td');
    tdDate.textContent = `${row.day}日(${dayName})`;
    tr.appendChild(tdDate);

    // 出勤・退勤セル
    const midKeys = { start: 'startMid', end: 'endMid' };
    for (const key of ['start', 'end']) {
      const td = document.createElement('td');
      td.className = 'time-cell';
      if (row[key]) {
        const hhmm = row[key];
        td.textContent = hhmm.slice(0, 2) + ':' + hhmm.slice(2);
        td.dataset.hhmm = hhmm;
        if (row[midKeys[key]]) td.dataset.mid = row[midKeys[key]];
        td.addEventListener('click', handleTimeCellClick);
      } else {
        td.textContent = '-';
        td.classList.add('empty');
      }
      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  }

  tableWrapper.classList.remove('hidden');
}

// ----- クリックでコピー -----

async function handleTimeCellClick(e) {
  const td = e.currentTarget;
  const hhmm = td.dataset.hhmm;
  if (!hhmm) return;

  // HHMMをクリップボードにコピー
  try {
    await navigator.clipboard.writeText(hhmm);
  } catch {
    const tmp = document.createElement('textarea');
    tmp.value = hhmm;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
  }
  td.classList.add('copied');
  setTimeout(() => td.classList.remove('copied'), 800);

  // Chatworkタブでそのメッセージへスクロール
  const mid = td.dataset.mid;
  if (!mid) return;
  const tabs = await chrome.tabs.query({});
  const cwTab = tabs.find((t) => t.url === CHATWORK_URL);
  if (!cwTab) return;
  chrome.tabs.sendMessage(cwTab.id, { action: 'scrollToMessage', mid });
  chrome.tabs.update(cwTab.id, { active: true });
}

// ----- キャッシュ -----

function cacheKey(year, month) {
  return `attendance_${year}_${String(month).padStart(2, '0')}`;
}

async function saveCache(year, month, data) {
  await chrome.storage.local.set({ [cacheKey(year, month)]: { data, savedAt: Date.now() } });
}

async function loadCache(year, month) {
  const result = await chrome.storage.local.get(cacheKey(year, month));
  return result[cacheKey(year, month)] || null;
}

// ----- 月セレクター変更時にキャッシュ表示 -----

async function onMonthChange() {
  const year  = parseInt(yearSelect.value, 10);
  const month = parseInt(monthSelect.value, 10);
  const cache = await loadCache(year, month);
  if (cache) {
    const saved = new Date(cache.savedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    showStatus(`キャッシュ表示中（${saved} 取得）`, 'loading');
    renderTable(year, month, cache.data);
  } else {
    hideStatus();
    tableWrapper.classList.add('hidden');
  }
}

yearSelect.addEventListener('change', onMonthChange);
monthSelect.addEventListener('change', onMonthChange);

// ----- 取得ロジック -----

async function fetchFromChatwork(year, month, myUserId) {
  const tab = await openOrFocusChatworkTab();
  const res = await sendMessageSafely(tab.id, {
    action: 'getAttendance',
    year,
    month,
    myUserId,
  });
  if (!res || !res.success) throw new Error(res?.error || '取得に失敗しました');
  await saveCache(year, month, res.data);
  return res.data;
}

function setButtonsDisabled(disabled) {
  fetchBtn.disabled = disabled;
  forceFetchBtn.disabled = disabled;
}

// 取得ボタン（キャッシュがあればそれを使用）
fetchBtn.addEventListener('click', async () => {
  const year  = parseInt(yearSelect.value, 10);
  const month = parseInt(monthSelect.value, 10);

  const myUserId = await loadUserId();
  if (!myUserId) { alert('先にユーザーIDを入力・保存してください'); return; }

  const cache = await loadCache(year, month);
  if (cache) {
    hideStatus();
    renderTable(year, month, cache.data);
    return;
  }

  setButtonsDisabled(true);
  showStatus(`${year}年${month}月の勤怠を取得中…`, 'loading');
  tableWrapper.classList.add('hidden');
  try {
    const data = await fetchFromChatwork(year, month, myUserId);
    hideStatus();
    renderTable(year, month, data);
  } catch (err) {
    showStatus('エラー: ' + err.message, 'error');
    console.error('[AttendanceTracker popup]', err);
  } finally {
    setButtonsDisabled(false);
  }
});

// 強制取得ボタン（キャッシュを無視して常にChatworkから取得）
forceFetchBtn.addEventListener('click', async () => {
  const year  = parseInt(yearSelect.value, 10);
  const month = parseInt(monthSelect.value, 10);

  const myUserId = await loadUserId();
  if (!myUserId) { alert('先にユーザーIDを入力・保存してください'); return; }

  setButtonsDisabled(true);
  showStatus(`${year}年${month}月の勤怠を強制取得中…`, 'loading');
  tableWrapper.classList.add('hidden');
  try {
    const data = await fetchFromChatwork(year, month, myUserId);
    hideStatus();
    renderTable(year, month, data);
  } catch (err) {
    showStatus('エラー: ' + err.message, 'error');
    console.error('[AttendanceTracker popup]', err);
  } finally {
    setButtonsDisabled(false);
  }
});

// ----- 初期化 -----
initSelectors();
loadUserId();
onMonthChange(); // 起動時にキャッシュがあれば表示
