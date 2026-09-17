const CHATWORK_URL = 'https://www.chatwork.com/#!rid186206769';

const openTabBtn      = document.getElementById('openTabBtn');
const yearSelect      = document.getElementById('yearSelect');
const monthSelect     = document.getElementById('monthSelect');
const fetchBtn        = document.getElementById('fetchBtn');
const forceFetchBtn   = document.getElementById('forceFetchBtn');
const statusDiv       = document.getElementById('status');
const tableWrapper    = document.getElementById('tableWrapper');
const tableBody       = document.getElementById('tableBody');
const userIdInput     = document.getElementById('userIdInput');
const saveUserIdBtn   = document.getElementById('saveUserIdBtn');
const summaryCard     = document.getElementById('summaryCard');
const summaryWorkDays = document.getElementById('summaryWorkDays');
const summaryTotalOt  = document.getElementById('summaryTotalOt');
const summaryAvgOt    = document.getElementById('summaryAvgOt');

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

// ----- 日本の祝日 & 営業日数計算 -----

function getVernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function getAutumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function getNthMonday(year, month, n) {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === 1) {
      count++;
      if (count === n) return d;
    }
  }
  return 0;
}

function getJapaneseHolidaysInMonth(year, month) {
  const holidays = new Set();
  const daysInMonth = new Date(year, month, 0).getDate();

  if (month === 1) {
    holidays.add(1);
    holidays.add(getNthMonday(year, 1, 2));
  } else if (month === 2) {
    holidays.add(11);
    holidays.add(23);
  } else if (month === 3) {
    holidays.add(getVernalEquinoxDay(year));
  } else if (month === 4) {
    holidays.add(29);
  } else if (month === 5) {
    holidays.add(3);
    holidays.add(4);
    holidays.add(5);
  } else if (month === 7) {
    holidays.add(getNthMonday(year, 7, 3));
  } else if (month === 8) {
    holidays.add(11);
  } else if (month === 9) {
    holidays.add(getNthMonday(year, 9, 3));
    holidays.add(getAutumnalEquinoxDay(year));
  } else if (month === 10) {
    holidays.add(getNthMonday(year, 10, 2));
  } else if (month === 11) {
    holidays.add(3);
    holidays.add(23);
  }

  // 振替休日
  const holidayList = Array.from(holidays).sort((a, b) => a - b);
  for (const d of holidayList) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 0) {
      let sub = d + 1;
      while (sub <= daysInMonth && (holidays.has(sub) || new Date(year, month - 1, sub).getDay() === 0)) {
        sub++;
      }
      if (sub <= daysInMonth) holidays.add(sub);
    }
  }

  // 国民の休日
  for (let d = 2; d < daysInMonth; d++) {
    if (!holidays.has(d) && holidays.has(d - 1) && holidays.has(d + 1)) {
      const date = new Date(year, month - 1, d);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        holidays.add(d);
      }
    }
  }

  return holidays;
}

function calculateBusinessDays(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidays = getJapaneseHolidaysInMonth(year, month);
  let count = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.has(d)) {
      count++;
    }
  }

  return count;
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
  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find((t) => t.url === CHATWORK_URL);

  if (existing) {
    console.log('[AttendanceTracker] 既存タブを使用:', existing.id, existing.url);
    await ensureTabLoaded(existing.id);
    return existing;
  }

  console.log('[AttendanceTracker] 新規タブを作成:', CHATWORK_URL);
  const tab = await chrome.tabs.create({ url: CHATWORK_URL, active: false });
  await ensureTabLoaded(tab.id);
  await new Promise((r) => setTimeout(r, 1500));
  return tab;
}

async function sendMessageSafely(tabId, message) {
  try {
    console.log('[AttendanceTracker] content script 注入中...');
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    console.log('[AttendanceTracker] content script 注入完了');
  } catch (e) {
    console.log('[AttendanceTracker] content script 注入スキップ:', e.message);
  }

  await new Promise((r) => setTimeout(r, 300));

  return new Promise((resolve) => {
    const TIMEOUT_MS = 60000;
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

// ----- テーブル描画 & サマリー計算 -----

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
let currentRenderData = null;

function renderTable(year, month, data) {
  currentRenderData = data;
  tableBody.innerHTML = '';

  let actualWorkDays = 0;
  let totalOtMinutes = 0;

  for (const row of data) {
    const date = new Date(year, month - 1, row.day);
    const dayName = DAY_NAMES[date.getDay()];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    if (row.start || row.end) {
      actualWorkDays++;
    }

    const tr = document.createElement('tr');
    if (isWeekend) tr.style.color = date.getDay() === 0 ? '#c00' : '#06c';

    // 日付セル
    const tdDate = document.createElement('td');
    tdDate.textContent = `${row.day}日(${dayName})`;
    tr.appendChild(tdDate);

    // 出勤・退勤セル
    const midKeys = { start: 'startMid', end: 'endMid' };
    const editedKeys = { start: 'startEdited', end: 'endEdited' };

    for (const key of ['start', 'end']) {
      const td = document.createElement('td');
      td.className = 'time-cell';
      td.dataset.day = row.day;
      td.dataset.key = key;

      if (row[key]) {
        const hhmm = row[key];
        td.textContent = hhmm.slice(0, 2) + ':' + hhmm.slice(2);
        td.dataset.hhmm = hhmm;
        if (row[midKeys[key]]) td.dataset.mid = row[midKeys[key]];
      } else {
        td.textContent = '-';
        td.classList.add('empty');
      }

      if (row[editedKeys[key]]) {
        td.classList.add('edited');
        td.title = '手動編集された時間です（ダブルクリックで再編集）';
      }

      td.addEventListener('click', handleTimeCellClick);
      td.addEventListener('dblclick', handleTimeCellDblClick);
      tr.appendChild(td);
    }

    // 勤務時間セル (出勤・退勤の両方が揃っている場合のみ表示)
    const tdRange = document.createElement('td');
    tdRange.className = 'time-cell range-cell';
    const startFmt = row.start ? `${row.start.slice(0, 2)}:${row.start.slice(2)}` : '';
    const endFmt = row.end ? `${row.end.slice(0, 2)}:${row.end.slice(2)}` : '';

    if (startFmt && endFmt) {
      const rangeText = `${startFmt}-${endFmt}`;
      tdRange.textContent = rangeText;
      tdRange.dataset.copyText = rangeText;
      tdRange.addEventListener('click', handleRangeCellClick);
    } else {
      tdRange.textContent = '-';
      tdRange.classList.add('empty');
    }
    tr.appendChild(tdRange);

    // 残業時間セル (合計・所定・普通)
    const tdOt = document.createElement('td');
    tdOt.className = 'time-cell range-cell';
    const ot = calculateOvertime(row.start, row.end);

    if (ot && ot.minTotal > 0) {
      totalOtMinutes += ot.minTotal;
      const totalStr = formatMinutesToHHMM(ot.minTotal);
      const syokuteiStr = formatMinutesToHHMM(ot.minSyokutei);
      const futsuStr = formatMinutesToHHMM(ot.minFutsu);

      const otText = `${totalStr} (所定${syokuteiStr}/普通${futsuStr})`;
      tdOt.textContent = otText;
      tdOt.dataset.copyText = otText;
      tdOt.addEventListener('click', handleRangeCellClick);
    } else {
      tdOt.textContent = '-';
      tdOt.classList.add('empty');
    }
    tr.appendChild(tdOt);

    tableBody.appendChild(tr);
  }

  // ----- サマリーデータの計算 & 表示 -----
  const totalBusinessDays = calculateBusinessDays(year, month);
  summaryWorkDays.textContent = `${actualWorkDays}日 / ${totalBusinessDays}日`;
  summaryTotalOt.textContent = formatMinutesToHHMM(totalOtMinutes);

  const avgMinutes = actualWorkDays > 0 ? Math.round(totalOtMinutes / actualWorkDays) : 0;
  summaryAvgOt.textContent = `${formatMinutesToHHMM(avgMinutes)} / 日`;

  summaryCard.classList.remove('hidden');
  tableWrapper.classList.remove('hidden');
}

// ----- 残業時間計算 -----

function formatMinutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * 09:30〜18:00 定時
 * 18:00〜18:30 所定残業 (最大30分)
 * 18:30以降 普通残業
 */
function calculateOvertime(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return null;

  const endH = parseInt(endHHMM.slice(0, 2), 10);
  const endM = parseInt(endHHMM.slice(2, 4), 10);
  const endMinutes = endH * 60 + endM;

  const base1800 = 18 * 60;      // 18:00 (1080分)
  const base1830 = 18 * 60 + 30; // 18:30 (1110分)

  if (endMinutes <= base1800) {
    return { minSyokutei: 0, minFutsu: 0, minTotal: 0 };
  }

  let minSyokutei = 0;
  let minFutsu = 0;

  if (endMinutes <= base1830) {
    minSyokutei = endMinutes - base1800;
  } else {
    minSyokutei = 30;
    minFutsu = endMinutes - base1830;
  }

  return {
    minSyokutei,
    minFutsu,
    minTotal: minSyokutei + minFutsu,
  };
}

// ----- 勤務時間範囲のコピー -----

async function handleRangeCellClick(e) {
  const td = e.currentTarget;
  const copyText = td.dataset.copyText;
  if (!copyText) return;

  try {
    await navigator.clipboard.writeText(copyText);
  } catch {
    const tmp = document.createElement('textarea');
    tmp.value = copyText;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
  }
  td.classList.add('copied');
  setTimeout(() => td.classList.remove('copied'), 800);
}

// ----- クリック（コピー） & ダブルクリック（手動編集） -----

let clickTimer = null;

function handleTimeCellClick(e) {
  const td = e.currentTarget;
  if (clickTimer) clearTimeout(clickTimer);

  clickTimer = setTimeout(() => {
    executeCopyAndScroll(td);
  }, 220);
}

function handleTimeCellDblClick(e) {
  if (clickTimer) clearTimeout(clickTimer);
  const td = e.currentTarget;
  startInlineEdit(td);
}

async function executeCopyAndScroll(td) {
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

function startInlineEdit(td) {
  const day = parseInt(td.dataset.day, 10);
  const key = td.dataset.key; // 'start' | 'end'
  if (!day || !key || !currentRenderData) return;

  const row = currentRenderData.find((r) => r.day === day);
  if (!row) return;

  const oldVal = row[key] ? `${row[key].slice(0, 2)}:${row[key].slice(2)}` : '';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'time-edit-input';
  input.value = oldVal;
  input.placeholder = '09:30';

  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  let isSaved = false;

  const saveEdit = async () => {
    if (isSaved) return;
    isSaved = true;

    const oldHHMM = row[key] || null;
    const rawVal = input.value.trim();
    let newHHMM = null;

    if (!rawVal) {
      // 空文字入力はクリア
      newHHMM = null;
    } else {
      const clean = rawVal.replace(':', '');
      if (/^\d{3,4}$/.test(clean)) {
        newHHMM = clean.padStart(4, '0');
      } else {
        alert('時間の形式が正しくありません。（例: 09:30 または 0930）');
        const y = parseInt(yearSelect.value, 10);
        const m = parseInt(monthSelect.value, 10);
        renderTable(y, m, currentRenderData);
        return;
      }
    }

    const editedKeyName = key === 'start' ? 'startEdited' : 'endEdited';

    // 実際に値が変更された場合のみフラグとキャッシュを更新
    if (newHHMM !== oldHHMM) {
      row[key] = newHHMM;
      // 新しい値が存在すれば手動編集フラグを true に、消去した場合は false に
      row[editedKeyName] = newHHMM !== null;

      const year = parseInt(yearSelect.value, 10);
      const month = parseInt(monthSelect.value, 10);
      await saveCache(year, month, currentRenderData);
    }

    const y = parseInt(yearSelect.value, 10);
    const m = parseInt(monthSelect.value, 10);
    renderTable(y, m, currentRenderData);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') {
      isSaved = true;
      const y = parseInt(yearSelect.value, 10);
      const m = parseInt(monthSelect.value, 10);
      renderTable(y, m, currentRenderData);
    }
  });

  input.addEventListener('blur', saveEdit);
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
    summaryCard.classList.add('hidden');
    tableWrapper.classList.add('hidden');
  }
}

yearSelect.addEventListener('change', onMonthChange);
monthSelect.addEventListener('change', onMonthChange);

// ----- 取得ロジック -----

function mergeAttendanceData(cachedData, newData) {
  if (!cachedData) return newData;
  const merged = [];
  for (let i = 0; i < cachedData.length; i++) {
    const oldRow = cachedData[i] || { day: i + 1, start: null, end: null, startMid: null, endMid: null };
    const newRow = (newData || []).find((r) => r.day === i + 1) || { day: i + 1, start: null, end: null, startMid: null, endMid: null };

    // 手動編集済みの場合はキャッシュ上の値を優先保持
    const finalStart = oldRow.startEdited ? oldRow.start : (newRow.start || oldRow.start);
    const finalEnd = oldRow.endEdited ? oldRow.end : (newRow.end || oldRow.end);

    merged.push({
      day: i + 1,
      start: finalStart,
      end: finalEnd,
      startMid: newRow.startMid || oldRow.startMid,
      endMid: newRow.endMid || oldRow.endMid,
      startEdited: !!oldRow.startEdited,
      endEdited: !!oldRow.endEdited,
    });
  }
  return merged;
}

async function fetchFromChatwork(year, month, myUserId, stopTs = null) {
  const tab = await openOrFocusChatworkTab();
  const res = await sendMessageSafely(tab.id, {
    action: 'getAttendance',
    year,
    month,
    myUserId,
    stopTs,
  });
  if (!res || !res.success) throw new Error(res?.error || '取得に失敗しました');
  return res.data;
}

function setButtonsDisabled(disabled) {
  fetchBtn.disabled = disabled;
  forceFetchBtn.disabled = disabled;
}

// 取得ボタン（すでにキャッシュがある場合は、記録済みの最新日までしかスクロールせず差分を取得して合体）
fetchBtn.addEventListener('click', async () => {
  const year  = parseInt(yearSelect.value, 10);
  const month = parseInt(monthSelect.value, 10);

  const myUserId = await loadUserId();
  if (!myUserId) { alert('先にユーザーIDを入力・保存してください'); return; }

  const cache = await loadCache(year, month);
  let stopTs = null;

  if (cache && Array.isArray(cache.data)) {
    // すでに記録がある一番新しい日を探す（無駄に月の最初まで上スクロールするのを防ぐ）
    let lastRecordedDay = 1;
    for (const row of cache.data) {
      if (row.start || row.end) {
        lastRecordedDay = Math.max(lastRecordedDay, row.day);
      }
    }
    // その日の 00:00:00 をストップ地点にする
    stopTs = new Date(year, month - 1, lastRecordedDay).getTime() / 1000;
  }

  setButtonsDisabled(true);
  const statusMsg = cache ? `${year}年${month}月の最新の差分を取得中…` : `${year}年${month}月の勤怠を取得中…`;
  showStatus(statusMsg, 'loading');

  try {
    const fetchedData = await fetchFromChatwork(year, month, myUserId, stopTs);
    const finalData = mergeAttendanceData(cache ? cache.data : null, fetchedData);
    await saveCache(year, month, finalData);

    hideStatus();
    renderTable(year, month, finalData);
  } catch (err) {
    showStatus('エラー: ' + err.message, 'error');
    console.error('[AttendanceTracker popup]', err);
  } finally {
    setButtonsDisabled(false);
  }
});

// 強制取得ボタン（キャッシュを無視して月全体の最初から完全に再取得）
forceFetchBtn.addEventListener('click', async () => {
  const year  = parseInt(yearSelect.value, 10);
  const month = parseInt(monthSelect.value, 10);

  const myUserId = await loadUserId();
  if (!myUserId) { alert('先にユーザーIDを入力・保存してください'); return; }

  setButtonsDisabled(true);
  showStatus(`${year}年${month}月の全勤怠データを強制取得中…`, 'loading');
  tableWrapper.classList.add('hidden');
  try {
    const data = await fetchFromChatwork(year, month, myUserId, null);
    await saveCache(year, month, data);
    hideStatus();
    renderTable(year, month, data);
  } catch (err) {
    showStatus('エラー: ' + err.message, 'error');
    console.error('[AttendanceTracker popup]', err);
  } finally {
    setButtonsDisabled(false);
  }
});

// ----- タブで開く -----

openTabBtn.addEventListener('click', async () => {
  const url = chrome.runtime.getURL('popup.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url === url);

  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }

  window.close();
});

// ----- 初期化 -----
initSelectors();
loadUserId();
onMonthChange(); // 起動時にキャッシュがあれば表示
