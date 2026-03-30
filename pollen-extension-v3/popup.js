'use strict';

// ── APIキー（直埋め込み） ────────────────────────────
const API_KEY = 'AIzaSyAwNXFKubYDkBw7P-0nw8Ly98EYSOgVIHA';

// ── エンドポイント ───────────────────────────────────
// Geocodingは Nominatim(OSM) を使用 - APIキー不要・Chrome拡張から動作確実
const POLLEN_URL = 'https://pollen.googleapis.com/v1/forecast:lookup';

// ── 植物マッピング ───────────────────────────────────
const PLANT_MAP = {
  CEDAR:   { name: 'スギ',     cls: 'cedar',   dot: '#e8a03a', emoji: '🌲' },
  CYPRESS: { name: 'ヒノキ',   cls: 'cypress', dot: '#6cc97a', emoji: '🌿' },
  GRASS:   { name: 'イネ科',   cls: 'grass',   dot: '#5aafd4', emoji: '🌾' },
  MUGWORT: { name: 'ヨモギ',   cls: 'weed',    dot: '#b07ad4', emoji: '🍃' },
  RAGWEED: { name: 'ブタクサ', cls: 'weed',    dot: '#b07ad4', emoji: '🍂' },
  OAK:     { name: 'オーク',   cls: 'weed',    dot: '#a07850', emoji: '🌳' },
  PINE:    { name: 'マツ',     cls: 'weed',    dot: '#7a9e5a', emoji: '🌲' },
  ALDER:   { name: 'ハンノキ', cls: 'weed',    dot: '#d4a843', emoji: '🌳' },
  BIRCH:   { name: 'シラカバ', cls: 'weed',    dot: '#c8b870', emoji: '🌳' },
};

// ── UPIレベル定義 ────────────────────────────────────
const UPI_LEVELS = [
  { max: 0, label: 'なし',       emoji: '😊', col: 'col-none',     bar: '#52c07a', pct: 3   },
  { max: 1, label: '非常に少ない', emoji: '🙂', col: 'col-low',      bar: '#8fd46a', pct: 20  },
  { max: 2, label: '少ない',     emoji: '😐', col: 'col-moderate', bar: '#e8c03a', pct: 40  },
  { max: 3, label: '中程度',     emoji: '😷', col: 'col-high',     bar: '#e8a03a', pct: 60  },
  { max: 4, label: '多い',       emoji: '🤧', col: 'col-veryhigh', bar: '#e06030', pct: 80  },
  { max: 5, label: '非常に多い', emoji: '😰', col: 'col-veryhigh', bar: '#e05252', pct: 100 },
];

function getUpiInfo(upi) {
  if (upi === null || upi === undefined) return UPI_LEVELS[0];
  return UPI_LEVELS.find(l => upi <= l.max) || UPI_LEVELS[UPI_LEVELS.length - 1];
}

// ── DOM refs ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const cityInput      = $('cityInput');
const searchBtn      = $('searchBtn');
const initialSection = $('initialSection');
const loadingSection = $('loadingSection');
const loadingText    = $('loadingText');
const errorSection   = $('errorSection');
const errorMsg       = $('errorMsg');
const resultSection  = $('resultSection');
const locName        = $('locName');
const locSub         = $('locSub');
const dateTabs       = $('dateTabs');
const dayPanel       = $('dayPanel');
const overallEmoji   = $('overallEmoji');
const overallLevel   = $('overallLevel');
const overallDesc    = $('overallDesc');
const pollenGrid     = $('pollenGrid');
const healthTip      = $('healthTip');
const healthTipText  = $('healthTipText');
const footerDate     = $('footerDate');

// ── State ────────────────────────────────────────────
let forecastData = null;

// ── UI helpers ───────────────────────────────────────
function showOnly(id) {
  ['initialSection','loadingSection','errorSection','resultSection']
    .forEach(s => $(s).classList.toggle('hidden', s !== id));
}

function setLoading(msg) {
  loadingText.textContent = msg || '取得中…';
  showOnly('loadingSection');
}

function formatDate(dateObj) {
  const d   = new Date(dateObj.year, dateObj.month - 1, dateObj.day);
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((d - now) / 86400000);
  const dow  = ['日','月','火','水','木','金','土'][d.getDay()];
  const base = diff === 0 ? '今日'
             : diff === 1 ? '明日'
             : diff === 2 ? '明後日'
             : `${d.getMonth()+1}/${d.getDate()}`;
  return `${base}（${dow}）`;
}

// ── Render day ───────────────────────────────────────
function renderDay(idx) {
  document.querySelectorAll('.date-tab').forEach((t, i) =>
    t.classList.toggle('active', i === idx));

  const day    = forecastData[idx];
  const plants = day.plantInfo || [];

  // 最大UPIで総合レベルを決定
  const maxUpi = plants.reduce((m, p) => Math.max(m, p.indexInfo?.value ?? 0), 0);
  const info   = getUpiInfo(maxUpi);

  overallEmoji.textContent   = info.emoji;
  overallLevel.textContent   = info.label;
  overallLevel.className     = `overall-level ${info.col}`;
  overallDesc.textContent    = `UPI ${maxUpi} / 5`;

  // 表示順：スギ・ヒノキ優先
  const priority = ['CEDAR','CYPRESS','GRASS','MUGWORT','RAGWEED','OAK','PINE','ALDER','BIRCH'];
  const sorted   = [...plants].sort((a, b) => {
    const ai = priority.indexOf(a.code), bi = priority.indexOf(b.code);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  pollenGrid.innerHTML = '';
  sorted.forEach(plant => {
    const meta     = PLANT_MAP[plant.code] || { name: plant.displayName || plant.code, cls:'weed', dot:'#888', emoji:'🌱' };
    const upi      = plant.indexInfo?.value ?? null;
    const lvl      = getUpiInfo(upi);
    const inSeason = plant.inSeason !== false;

    const card = document.createElement('div');
    card.className = `pollen-card ${meta.cls}`;
    if (!inSeason) card.style.opacity = '0.4';
    card.innerHTML = `
      <div class="pollen-card-name">
        <span class="pollen-dot" style="background:${meta.dot}"></span>
        ${meta.emoji} ${meta.name}
        ${!inSeason ? '<span style="font-size:9px;color:var(--dim)">(時期外)</span>' : ''}
      </div>
      <div class="pollen-card-level ${lvl.col}">${upi !== null ? lvl.label : '—'}</div>
      <div class="pollen-card-upi">UPI: ${upi ?? '—'}</div>
      <div class="mini-bar">
        <div class="mini-bar-fill" style="width:${lvl.pct}%;background:${lvl.bar}"></div>
      </div>
    `;
    pollenGrid.appendChild(card);
  });

  // 健康アドバイス
  const tips = plants.flatMap(p => p.healthRecommendations || []).filter(Boolean);
  if (tips.length) {
    healthTip.classList.remove('hidden');
    healthTipText.textContent = translateTip(tips[0]);
  } else {
    healthTip.classList.add('hidden');
  }

  dayPanel.classList.remove('fade-up');
  void dayPanel.offsetWidth;
  dayPanel.classList.add('fade-up');
}

// 英語アドバイスの簡易日本語化
function translateTip(text) {
  const map = [
    [/very high/gi,             '非常に高い'],
    [/high/gi,                  '高い'],
    [/moderate/gi,              '中程度の'],
    [/low/gi,                   '低い'],
    [/allerg(ic|y)/gi,          'アレルギー'],
    [/symptoms/gi,              '症状'],
    [/Pollen levels are/gi,     '花粉レベルは'],
    [/People with .+ allergy/gi,'花粉アレルギーをお持ちの方'],
    [/are likely to experience/gi, 'は以下の'],
    [/Wear (a )?mask/gi,        'マスクの着用をお勧めします'],
    [/Stay indoors/gi,          '外出を控えることをお勧めします'],
    [/Wear sunglasses/gi,       'サングラスの着用をお勧めします'],
    [/sensitive people/gi,      '敏感な方'],
  ];
  let out = text;
  map.forEach(([re, rep]) => { out = out.replace(re, rep); });
  return out.replace(/\.\s*$/, '。').trim();
}

// ── API: Nominatim Geocoding (OpenStreetMap) ─────────
// Chrome拡張からでも確実に動く・無料・APIキー不要
async function geocode(input) {
  const cleaned = input.replace(/^(東京都|北海道|(?:大阪|京都|..)府|.{2,3}県)/, '').trim();
  const query   = cleaned || input;

  const url = `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(query)}&` +
    `countrycodes=jp&format=json&limit=1&accept-language=ja`;

  console.log('[Geocode] クエリ:', query);
  console.log('[Geocode] URL:', url);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'PollenCheckerExtension/3.0' }
  });
  console.log('[Geocode] HTTPステータス:', res.status);

  if (!res.ok) throw new Error(`Geocoding エラー (${res.status})`);
  const json = await res.json();
  console.log('[Geocode] 結果:', JSON.stringify(json).substring(0, 300));

  if (!json.length) {
    throw new Error(`「${input}」が見つかりませんでした\n例：港区、和光市、大阪市北区`);
  }

  const r = json[0];
  const parts = r.display_name.split(', ');
  const name  = parts[0];
  const sub   = parts.slice(1, 3).join(' ');
  console.log('[Geocode] 取得:', name, sub, r.lat, r.lon);

  return { lat: parseFloat(r.lat), lon: parseFloat(r.lon), name, sub };
}

// ── API: Google Pollen ───────────────────────────────
async function fetchPollen(lat, lon) {
  const url = `${POLLEN_URL}?key=${API_KEY}&location.latitude=${lat}&location.longitude=${lon}&days=5&languageCode=ja`;
  console.log('[Pollen] リクエストURL:', url);
  console.log('[Pollen] 座標:', lat, lon);

  const res  = await fetch(url);
  console.log('[Pollen] HTTPステータス:', res.status);

  const text = await res.text();
  console.log('[Pollen] レスポンス:', text.substring(0, 500));

  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j?.error?.message || j?.error?.status || text;
    } catch(e) {}
    throw new Error(`Pollen API ${res.status}: ${detail}`);
  }

  return JSON.parse(text);
}

// ── Main ─────────────────────────────────────────────
async function doSearch() {
  const input = cityInput.value.trim();
  if (!input) { cityInput.focus(); return; }

  searchBtn.disabled = true;

  try {
    setLoading('地名を検索中…');
    const geo = await geocode(input);

    setLoading('花粉データを取得中…');
    const data = await fetchPollen(geo.lat, geo.lon);

    if (!data.dailyInfo?.length) {
      throw new Error('この地域の花粉データが見つかりませんでした');
    }

    forecastData = data.dailyInfo;
    chrome.storage.local.set({ lastCity: input });

    // 場所表示
    locName.textContent = geo.name;
    locSub.textContent  = geo.sub;
    footerDate.textContent = new Date().toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }) + ' 更新';

    // 日付タブ
    dateTabs.innerHTML = '';
    forecastData.forEach((day, i) => {
      const tab = document.createElement('button');
      tab.className = `date-tab${i === 0 ? ' active' : ''}`;
      tab.textContent = formatDate(day.date);
      tab.addEventListener('click', () => renderDay(i));
      dateTabs.appendChild(tab);
    });

    showOnly('resultSection');
    renderDay(0);

  } catch (e) {
    showOnly('errorSection');
    errorMsg.innerHTML = `⚠ ${e.message.replace(/\n/g, '<br>')}`;
  } finally {
    searchBtn.disabled = false;
  }
}

// ── Init ─────────────────────────────────────────────
async function init() {
  footerDate.textContent = new Date().toLocaleDateString('ja-JP', { month:'short', day:'numeric' });

  // 前回の検索地を復元
  const { lastCity } = await chrome.storage.local.get('lastCity');
  if (lastCity) cityInput.value = lastCity;

  showOnly('initialSection');
}

// ── Events ───────────────────────────────────────────
searchBtn.addEventListener('click', doSearch);
cityInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

init();
