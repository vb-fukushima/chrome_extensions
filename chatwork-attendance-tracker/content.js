/**
 * Chatwork Attendance Tracker - Content Script
 *
 * 【業務開始】【業務終了】を含む自分の投稿をスキャンし、
 * 指定月の勤怠データを返す。
 */

// ----- ユーティリティ -----

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Chatworkのメッセージリストのスクロールコンテナを取得 */
function findScrollContainer() {
  // メッセージ要素の祖先で overflow:auto/scroll かつ縦に長い要素を探す
  const firstMsg = document.querySelector('._message[data-mid]');
  if (firstMsg) {
    let el = firstMsg.parentElement;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight
      ) {
        return el;
      }
      el = el.parentElement;
    }
  }
  return null;
}

// ----- 過去メッセージのロード（上方向スクロール） -----

/**
 * 対象月の1日よりも前のメッセージが DOM にロードされるまでスクロールアップする。
 */
async function scrollUntilMonthLoaded(year, month) {
  // 対象月の1日0時（その月のメッセージが全て含まれているかの基準）
  const targetTs = new Date(year, month - 1, 1).getTime() / 1000;

  const container = findScrollContainer();
  if (!container) {
    console.warn('[AttendanceTracker] スクロールコンテナが見つかりません');
    return;
  }

  const maxAttempts = 80;
  for (let i = 0; i < maxAttempts; i++) {
    const oldestTs = getOldestMessageTimestamp();
    console.log(`[AttendanceTracker] scroll ${i + 1}: oldest=${oldestTs ? new Date(oldestTs * 1000).toLocaleDateString('ja-JP') : 'none'}`);

    if (oldestTs !== null && oldestTs < targetTs) {
      console.log('[AttendanceTracker] 対象月より前のメッセージをロード済み');
      break;
    }

    if (container.scrollTop === 0) {
      console.log('[AttendanceTracker] チャンネルの最古メッセージまで到達');
      break;
    }

    container.scrollTop = 0;
    await wait(400);
  }
}

/** DOM上の最も古いメッセージの data-tm（Unixタイムスタンプ秒）を返す */
function getOldestMessageTimestamp() {
  const stamps = document.querySelectorAll('._timeStamp[data-tm]');
  if (stamps.length === 0) return null;
  let oldest = Infinity;
  for (const el of stamps) {
    const tm = parseInt(el.dataset.tm, 10);
    if (!isNaN(tm) && tm < oldest) oldest = tm;
  }
  return oldest === Infinity ? null : oldest;
}

// ----- 勤怠データ抽出 -----

/**
 * DOM から指定月の勤怠データを取得する。
 * @param {number} year
 * @param {number} month  1-indexed
 * @param {string|null} myId
 * @returns {Array<{day:number, start:string|null, end:string|null}>}
 */
function extractAttendance(year, month, myId) {
  const messages = document.querySelectorAll('._message[data-mid]');
  console.log('[AttendanceTracker] メッセージ要素数:', messages.length);

  const map = {}; // key: day number

  for (const msg of messages) {
    // ---- タイムスタンプ取得 ----
    const tsEl = msg.querySelector('._timeStamp[data-tm]');
    if (!tsEl) continue;
    const tm = parseInt(tsEl.dataset.tm, 10);
    if (isNaN(tm)) continue;

    const date = new Date(tm * 1000);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;

    // ---- 投稿者チェック ----
    const iconEl = msg.querySelector('[data-testid="user-icon"][data-aid]');
    const accountId = iconEl ? String(iconEl.dataset.aid) : null;
    if (myId && accountId && accountId !== String(myId)) continue;

    // ---- 本文取得 ----
    const preEl = msg.querySelector('pre');
    if (!preEl) continue;
    const text = preEl.textContent;

    if (!text.includes('【業務開始】') && !text.includes('【業務終了】')) continue;

    const day = date.getDate();
    const hhmm = formatHHMM(date.getHours(), date.getMinutes());

    if (!map[day]) map[day] = { day, start: null, end: null, startMid: null, endMid: null };

    const mid = msg.dataset.mid || null;
    if (text.includes('【業務開始】')) {
      map[day].start = hhmm;
      map[day].startMid = mid;
    } else if (text.includes('【業務終了】')) {
      map[day].end = hhmm;
      map[day].endMid = mid;
    }
  }

  // 対象月の全日をリスト化（未投稿日は null）
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    result.push(map[d] || { day: d, start: null, end: null, startMid: null, endMid: null });
  }

  console.log('[AttendanceTracker] 抽出結果:', result.filter(r => r.start || r.end));
  return result;
}

function formatHHMM(h, m) {
  return String(h).padStart(2, '0') + String(m).padStart(2, '0');
}

// ----- Chatworkのロード待ち -----

const ROOM_ID = '186206769';

/** 対象チャンネルのメッセージが最低1件DOMに現れるまで待つ */
function waitForMessages(timeoutMs = 20000) {
  // data-rid で正しいチャンネルのメッセージが来るまで待つ
  const selector = `._message[data-rid="${ROOM_ID}"]`;
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      resolve();
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('チャンネルのメッセージ表示タイムアウト（20秒）'));
      }
    }, 300);
  });
}

// ----- メッセージハンドラー -----

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrollToMessage') {
    const el = document.querySelector(`._message[data-mid="${request.mid}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 一瞬ハイライト
      el.style.transition = 'background 0.3s';
      el.style.background = '#fff8c5';
      setTimeout(() => { el.style.background = ''; }, 1500);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'メッセージが見つかりません（スクロールで消えた可能性があります）' });
    }
    return true;
  }

  if (request.action === 'getAttendance') {
    const { year, month, myUserId } = request;
    handleGetAttendance(year, month, myUserId)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => {
        console.error('[AttendanceTracker]', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // async
  }
});

async function handleGetAttendance(year, month, myUserId) {
  console.log('[AttendanceTracker] myUserId:', myUserId);

  // 1. Chatworkのメッセージ描画を待つ
  await waitForMessages();
  console.log('[AttendanceTracker] メッセージ描画確認');

  // 2. 対象月まで遡る
  await scrollUntilMonthLoaded(year, month);
  await wait(800); // 最終レンダリング待ち

  // 3. パース & 返却
  return extractAttendance(year, month, myUserId);
}
