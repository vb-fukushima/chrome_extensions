// Googleスプレッドシート同期（Apps Script ウェブアプリへPOST）
// popup.js の calculateOvertime / FULL_DAY_LEAVES / DAY_NAMES などを利用する

const sheetUrlInput    = document.getElementById('sheetUrlInput');
const sheetTokenInput  = document.getElementById('sheetTokenInput');
const sheetAutoCheck   = document.getElementById('sheetAutoCheck');
const sheetSaveBtn     = document.getElementById('sheetSaveBtn');
const sheetSyncBtn     = document.getElementById('sheetSyncBtn');
const sheetSyncStatus  = document.getElementById('sheetSyncStatus');

// 普段は入力欄を非活性にし、「編集」で編集可、「保存」で保存して再び非活性にする
function setSheetEditing(editing) {
  sheetUrlInput.disabled = !editing;
  sheetTokenInput.disabled = !editing;
  sheetAutoCheck.disabled = !editing;
  sheetSaveBtn.textContent = editing ? '保存' : '編集';
  sheetSaveBtn.dataset.editing = editing ? '1' : '';
}

async function loadSheetSettings() {
  const { sheetUrl, sheetToken, sheetAuto } = await chrome.storage.local.get(['sheetUrl', 'sheetToken', 'sheetAuto']);
  sheetUrlInput.value = sheetUrl || '';
  sheetTokenInput.value = sheetToken || '';
  sheetAutoCheck.checked = sheetAuto !== false;
  setSheetEditing(!sheetUrl); // 未設定なら最初から編集状態
}

sheetSaveBtn.addEventListener('click', async () => {
  if (!sheetSaveBtn.dataset.editing) {
    setSheetEditing(true);
    return;
  }
  await chrome.storage.local.set({
    sheetUrl: sheetUrlInput.value.trim(),
    sheetToken: sheetTokenInput.value.trim(),
    sheetAuto: sheetAutoCheck.checked,
  });
  setSheetEditing(false);
});

function showSheetStatus(msg, isError) {
  sheetSyncStatus.textContent = msg;
  sheetSyncStatus.classList.toggle('error', !!isError);
}

function buildSheetPayload(year, month, data, meta) {
  const holidays = getJapaneseHolidaysInMonth(year, month);
  const fmt = (hhmm) => (hhmm ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : '');
  const sum = { workDays: 0, syokutei: 0, futsu: 0, shinya: 0, total: 0, remoteDays: 0 };

  const rows = data.map((row) => {
    const m = meta[row.day] || {};
    const ot = FULL_DAY_LEAVES.includes(m.leave) ? null : calculateOvertime(row.start, row.end);
    const date = new Date(year, month - 1, row.day);
    if (row.start || row.end) sum.workDays++;
    if (m.remote) sum.remoteDays++;
    if (ot) {
      sum.syokutei += ot.minSyokutei;
      sum.futsu += ot.minFutsu;
      sum.shinya += ot.minShinya;
      sum.total += ot.minTotal;
    }
    return {
      day: row.day,
      dow: DAY_NAMES[date.getDay()],
      holiday: holidays.has(row.day),
      start: fmt(row.start),
      end: fmt(row.end),
      otTotal: ot ? ot.minTotal : 0,
      otSyokutei: ot ? ot.minSyokutei : 0,
      otFutsu: ot ? ot.minFutsu : 0,
      otShinya: ot ? ot.minShinya : 0,
      remote: !!m.remote,
      leave: m.leave || '',
    };
  });

  const pay = calcExpectedOvertimePay(sum.syokutei, sum.futsu, sum.shinya);
  return { year, month, rows, summary: { ...sum, businessDays: calculateBusinessDays(year, month), pay } };
}

// ストレージ上のデータを読んでシートへ送る
async function syncToSheet(year, month) {
  const { sheetUrl, sheetToken } = await chrome.storage.local.get(['sheetUrl', 'sheetToken']);
  if (!sheetUrl) return { skipped: true };

  const [cache, metaRes] = await Promise.all([loadCache(year, month), chrome.storage.local.get(metaKey(year, month))]);
  if (!cache || !Array.isArray(cache.data)) throw new Error('同期するデータがありません（先に取得してください）');

  const payload = buildSheetPayload(year, month, cache.data, metaRes[metaKey(year, month)] || {});
  payload.token = sheetToken || '';

  const res = await fetch(sheetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // プリフライト回避
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || `HTTP ${res.status}`);
  return { ok: true };
}

async function runSheetSync(year, month) {
  showSheetStatus('同期中…');
  try {
    const r = await syncToSheet(year, month);
    if (r.skipped) { showSheetStatus('', false); return; }
    showSheetStatus(`${year}年${month}月を同期しました (${new Date().toLocaleTimeString('ja-JP')})`);
  } catch (err) {
    showSheetStatus('同期エラー: ' + err.message, true);
    console.error('[AttendanceTracker sheet]', err);
  }
}

// 取得・編集のたびに呼ぶ（自動同期ON時のみ。連続操作はまとめる）
let sheetSyncTimer = null;
function scheduleSheetSync(year, month) {
  clearTimeout(sheetSyncTimer);
  sheetSyncTimer = setTimeout(async () => {
    const { sheetAuto } = await chrome.storage.local.get('sheetAuto');
    if (sheetAuto === false) return;
    runSheetSync(year, month);
  }, 1000);
}

sheetSyncBtn.addEventListener('click', async () => {
  const { sheetUrl } = await chrome.storage.local.get('sheetUrl');
  if (!sheetUrl) { alert('先にウェブアプリURLを入力して保存してください'); return; }
  await runSheetSync(parseInt(yearSelect.value, 10), parseInt(monthSelect.value, 10));
});

loadSheetSettings();
