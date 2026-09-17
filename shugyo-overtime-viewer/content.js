/**
 * 就業WEB 残業ビューア - Content Script
 * SW020_Main.aspx の申請退出時刻から残業時間・概算手当を計算して表示
 */

const WORK_END = 18 * 60;
const LEGAL_OT_END = 18 * 60 + 30;
// 退出時刻: lblTime6=打刻, lblTime7=修正後, lblTime8=申請
const EXIT_TIME_IDS = [8, 7, 6];
const EXIT_TIME_SOURCES = ['申請', '修正後', '打刻'];
const MONEY_AUTO_HIDE_MS = 30000;
const STORAGE_KEY_DETAILS = 'shugyoOtDetailsOpen';
const STORAGE_KEY_SETTINGS = 'shugyoOtSettings';

const DEFAULT_SETTINGS = {
  legalRatePerMin: 44.59,
  normalRatePerMin: 41.94,
  adjustmentYen: 45400,
};

// ----- 時刻ユーティリティ -----

function parseTime(str) {
  if (!str) return null;
  const cleaned = str.replace(/\u3000/g, ' ').trim();
  if (!cleaned) return null;
  const m = cleaned.match(/(\d{1,2})[:：](\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatYen(amount) {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`;
}

function calcOvertime(endMinutes) {
  if (endMinutes == null || endMinutes <= WORK_END) {
    return { legal: 0, normal: 0 };
  }
  if (endMinutes <= LEGAL_OT_END) {
    return { legal: endMinutes - WORK_END, normal: 0 };
  }
  return { legal: 30, normal: endMinutes - LEGAL_OT_END };
}

// ----- DOM 解析 -----

function getSelectedYearMonth() {
  const select = document.getElementById('ContentPlaceHolder1_cmbYMN');
  if (!select) return null;
  const opt = select.options[select.selectedIndex];
  if (!opt) return null;
  const m = opt.textContent.match(/(\d{4})年\s*(\d{1,2})月/);
  if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), label: opt.textContent.trim() };
  return { year: null, month: null, label: opt.textContent.trim() };
}

function getExitTime(dayIndex) {
  for (let i = 0; i < EXIT_TIME_IDS.length; i++) {
    const el = document.getElementById(
      `ContentPlaceHolder1_grdTimecard_lblTime${EXIT_TIME_IDS[i]}_${dayIndex}`
    );
    const minutes = parseTime(el ? el.textContent : '');
    if (minutes != null) {
      return { exitMinutes: minutes, source: EXIT_TIME_SOURCES[i] };
    }
  }
  return { exitMinutes: null, source: null };
}

function isBusinessDay(dayEl) {
  const weekdayCell = dayEl.parentElement && dayEl.parentElement.nextElementSibling;
  const weekdayLabel = weekdayCell ? weekdayCell.textContent.trim() : '';
  return !/[土日祝]/.test(weekdayLabel);
}

function parseDateLabel(label) {
  const m = label.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
}

// タイムカードの日付ラベル（07/01等）は年月選択のラベル（例:「2026年 8月」）と
// ズレることがあるため、選択中の年月ではなく実際の今日の日付と直接比較する。
function resolveRowDate(parsed, today) {
  if (!parsed) return null;
  let year = today.getFullYear();
  const diff = parsed.month - (today.getMonth() + 1);
  if (diff > 6) year -= 1;
  else if (diff < -6) year += 1;
  return new Date(year, parsed.month - 1, parsed.day);
}

function extractTimecardData() {
  const table = document.getElementById('ContentPlaceHolder1_grdTimecard');
  if (!table) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  let businessDays = 0;
  let elapsedBusinessDays = 0;
  for (let i = 1; i <= 31; i++) {
    const dayEl = document.getElementById(`ContentPlaceHolder1_grdTimecard_btnDay_${i}`);
    if (!dayEl) continue;

    const dateLabel = dayEl.textContent.trim();
    if (!dateLabel || dateLabel === '合計') continue;

    const isBiz = isBusinessDay(dayEl);
    if (isBiz) businessDays++;

    const parsed = parseDateLabel(dateLabel);
    const rowDate = resolveRowDate(parsed, today);
    const elapsed = !!rowDate && rowDate <= today;
    if (isBiz && elapsed) elapsedBusinessDays++;

    const { exitMinutes, source } = getExitTime(i);
    const ot = calcOvertime(exitMinutes);

    if (ot.legal > 0 || ot.normal > 0) {
      days.push({ dateLabel, exitMinutes, source, legal: ot.legal, normal: ot.normal });
    }
  }

  const totalLegal = days.reduce((s, d) => s + d.legal, 0);
  const totalNormal = days.reduce((s, d) => s + d.normal, 0);

  return { days, totalLegal, totalNormal, businessDays, elapsedBusinessDays };
}

function calcPay(totalLegal, totalNormal, settings) {
  const legalPay = totalLegal * settings.legalRatePerMin;
  const normalPay = totalNormal * settings.normalRatePerMin;
  const gross = legalPay + normalPay;
  const net = Math.max(0, gross - settings.adjustmentYen);
  return { legalPay, normalPay, gross, net };
}

// ----- バナー UI -----

let moneyHideTimer = null;
let detailsOpen = false;
let moneyVisible = false;

function clearMoneyTimer() {
  if (moneyHideTimer) {
    clearTimeout(moneyHideTimer);
    moneyHideTimer = null;
  }
}

function scheduleMoneyHide() {
  clearMoneyTimer();
  moneyHideTimer = setTimeout(() => {
    moneyVisible = false;
    renderBanner();
  }, MONEY_AUTO_HIDE_MS);
}

async function loadSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY_SETTINGS] || {}) };
}

async function loadDetailsState() {
  const result = await chrome.storage.local.get(STORAGE_KEY_DETAILS);
  return result[STORAGE_KEY_DETAILS] === true;
}

function buildBannerHTML(data, ym, settings) {
  const pay = calcPay(data.totalLegal, data.totalNormal, settings);

  const detailsRows = data.days
    .map((d) => {
      const timeLabel = d.exitMinutes != null ? formatMinutes(d.exitMinutes) : '';
      const src = d.source ? `（${d.source}）` : '';
      return `<div class="ot-details-row">${d.dateLabel}　退出 ${timeLabel}${src}　法内 ${formatMinutes(d.legal)}　普通 ${formatMinutes(d.normal)}　合計 ${formatMinutes(d.legal + d.normal)}</div>`;
    })
    .join('');

  const detailsSection = detailsOpen
    ? `<div class="ot-details">${detailsRows || '<div class="ot-details-row">残業ありの日はありません</div>'}</div>`
    : '';

  const moneySection = moneyVisible
    ? `<div class="ot-money">
        概算残業手当　合計 ${formatYen(pay.gross)}　→　実質追加 <strong>${formatYen(pay.net)}</strong>
        <span style="font-size:11px;color:#888;margin-left:8px">（所定 ${formatYen(pay.legalPay)} / 普通 ${formatYen(pay.normalPay)}）</span>
      </div>`
    : '';

  const ymLabel = ym && ym.label ? `（${ym.label}）` : '';
  const totalMinutes = data.totalLegal + data.totalNormal;
  const over20h = totalMinutes > 20 * 60;
  const totalClass = over20h ? ' ot-total-over' : '';

  const avgPerDay =
    data.elapsedBusinessDays > 0 ? Math.round(totalMinutes / data.elapsedBusinessDays) : 0;
  const avgLabel = data.elapsedBusinessDays > 0 ? `（1日平均 ${formatMinutes(avgPerDay)}）` : '';

  return `
    <div class="ot-main">
      <span class="ot-label">残業時間${ymLabel}</span>
      <span class="ot-times">
        法定内 <strong>${formatMinutes(data.totalLegal)}</strong>
         / 普通 <strong>${formatMinutes(data.totalNormal)}</strong>
         / 合計 <strong class="${totalClass.trim()}">${formatMinutes(totalMinutes)}</strong>${over20h ? '<span class="ot-over-badge">20h超</span>' : ''}
         / 営業日 <strong>${data.elapsedBusinessDays}/${data.businessDays}日</strong>${avgLabel}
      </span>
      <div class="ot-actions">
        <button type="button" class="ot-details-btn">${detailsOpen ? '詳細 ▲' : '詳細 ▼'}</button>
        <button type="button" class="ot-money-btn">${moneyVisible ? '金額を隠す' : '金額'}</button>
      </div>
    </div>
    ${detailsSection}
    ${moneySection}
  `;
}

async function renderBanner() {
  const table = document.getElementById('ContentPlaceHolder1_grdTimecard');
  if (!table) return;

  const ym = getSelectedYearMonth();
  const data = extractTimecardData();
  if (!data) return;

  const settings = await loadSettings();

  let banner = document.getElementById('shugyo-ot-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'shugyo-ot-banner';
    table.parentNode.insertBefore(banner, table);
  }

  banner.innerHTML = buildBannerHTML(data, ym, settings);

  banner.querySelector('.ot-details-btn').addEventListener('click', async () => {
    detailsOpen = !detailsOpen;
    await chrome.storage.local.set({ [STORAGE_KEY_DETAILS]: detailsOpen });
    renderBanner();
  });

  banner.querySelector('.ot-money-btn').addEventListener('click', () => {
    moneyVisible = !moneyVisible;
    clearMoneyTimer();
    if (moneyVisible) scheduleMoneyHide();
    renderBanner();
  });
}

// ----- 初期化 -----

let renderTimer = null;

function scheduleRender(resetMoney) {
  if (resetMoney) {
    moneyVisible = false;
    clearMoneyTimer();
  }
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => renderBanner(), 300);
}

async function init() {
  detailsOpen = await loadDetailsState();
  moneyVisible = false;

  const table = document.getElementById('ContentPlaceHolder1_grdTimecard');
  if (table) {
    renderBanner();

    const observer = new MutationObserver(() => scheduleRender(true));
    observer.observe(table, { childList: true, subtree: true, characterData: true });
  } else {
    const bodyObserver = new MutationObserver(() => {
      if (document.getElementById('ContentPlaceHolder1_grdTimecard')) {
        bodyObserver.disconnect();
        init();
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY_SETTINGS]) {
    renderBanner();
  }
});

init();
