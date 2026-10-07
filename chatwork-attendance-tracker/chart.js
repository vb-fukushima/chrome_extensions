const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

const MINASHI_MINUTES = 20 * 60; // みなし残業20h

const params = new URLSearchParams(location.search);
let year  = parseInt(params.get('year'), 10);
let month = parseInt(params.get('month'), 10);

function formatMinutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// popup.js の calculateOvertime と同じ基準（18:00〜18:30 所定 / 18:30以降 普通）
function calculateOvertime(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return null;
  const endMinutes = parseInt(endHHMM.slice(0, 2), 10) * 60 + parseInt(endHHMM.slice(2, 4), 10);
  if (endMinutes <= 18 * 60) return { minSyokutei: 0, minFutsu: 0 };
  if (endMinutes <= 18 * 60 + 30) return { minSyokutei: endMinutes - 18 * 60, minFutsu: 0 };
  return { minSyokutei: 30, minFutsu: endMinutes - (18 * 60 + 30) };
}

// 過去月（最大6か月）の出勤日あたり平均残業分。データがなければ null
async function loadPastAvgPerDay() {
  const all = await chrome.storage.local.get(null);
  const cur = year * 100 + month;
  const past = Object.keys(all)
    .map((k) => ({ k, m: k.match(/^attendance_(\d{4})_(\d{2})$/) }))
    .filter((e) => e.m && parseInt(e.m[1], 10) * 100 + parseInt(e.m[2], 10) < cur)
    .sort((a, b) => (a.k < b.k ? 1 : -1))
    .slice(0, 6);
  let ot = 0, days = 0;
  for (const { k } of past) {
    for (const d of all[k].data || []) {
      if (!d.start && !d.end) continue;
      days++;
      const o = calculateOvertime(d.start, d.end);
      if (o) ot += o.minSyokutei + o.minFutsu;
    }
  }
  return days > 0 ? { avg: ot / days, months: past.length } : null;
}

function svgEl(name, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

function showMessage(msg) {
  const el = document.getElementById('chartMessage');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function formatForecast(min) {
  const r = Math.round(min);
  return `${formatMinutesToHHMM(r)}${r > MINASHI_MINUTES ? `（20h+${formatMinutesToHHMM(r - MINASHI_MINUTES)}）` : ''}`;
}

function renderSummary(days, totalMin, totalSyokutei, totalFutsu, forecast) {
  const items = [
    ['残業合計', `${formatMinutesToHHMM(totalMin)}（${(totalMin / 60).toFixed(1)}h）`],
    ['所定残業', formatMinutesToHHMM(totalSyokutei)],
    ['普通残業', formatMinutesToHHMM(totalFutsu)],
    ['1日平均', days > 0 ? `${formatMinutesToHHMM(Math.round(totalMin / days))} / 日` : '-'],
    totalMin > MINASHI_MINUTES
      ? ['20h超過', `+${formatMinutesToHHMM(totalMin - MINASHI_MINUTES)} 超過`]
      : ['20hまで残り', formatMinutesToHHMM(MINASHI_MINUTES - totalMin)],
  ];
  if (forecast) {
    items.push([`着地予測（今月ペース・残${forecast.remainDays}日）`, formatForecast(forecast.a.at(-1))]);
    if (forecast.b) items.push([`着地予測（過去${forecast.pastMonths}か月平均）`, formatForecast(forecast.b.at(-1))]);
  }
  const box = document.getElementById('chartSummary');
  box.innerHTML = '';
  for (const [label, value] of items) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = '<span class="label"></span><span class="value"></span>';
    div.querySelector('.label').textContent = label;
    div.querySelector('.value').textContent = value;
    box.appendChild(div);
  }
}

function renderChart(rows, forecast) {
  const svg = document.getElementById('chartSvg');
  svg.innerHTML = '';
  const W = 1000, H = 420;
  const m = { top: 20, right: 55, bottom: 46, left: 50 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const maxMin = Math.max(60, ...rows.map((r) => r.minSyokutei + r.minFutsu));
  const maxHour = Math.ceil(maxMin / 60);
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const y = (min) => m.top + plotH - (min / (maxHour * 60)) * plotH;
  const slot = plotW / rows.length;
  const barW = slot * 0.6;

  // 累計（右軸）: 20hと最大累計が収まる1時間刻みの上限
  let acc = 0;
  const cum = rows.map((r) => (acc += r.minSyokutei + r.minFutsu));
  const fMax = forecast ? Math.max(forecast.a.at(-1), forecast.b ? forecast.b.at(-1) : 0) : 0;
  const cumMaxHour = Math.max(MINASHI_MINUTES / 60, Math.ceil(Math.max(acc, fMax) / 60));
  const yc = (min) => m.top + plotH - (min / (cumMaxHour * 60)) * plotH;
  const cumStep = cumMaxHour > 40 ? 10 : cumMaxHour > 20 ? 5 : 2;
  for (let h = 0; h <= cumMaxHour; h += cumStep) {
    svg.appendChild(svgEl('text', { class: 'axis-right', x: W - m.right + 6, y: yc(h * 60) + 4 }, `${h}h`));
  }

  // 横グリッド（1時間ごと）
  for (let h = 0; h <= maxHour; h++) {
    svg.appendChild(svgEl('line', { class: 'grid', x1: m.left, x2: W - m.right, y1: y(h * 60), y2: y(h * 60) }));
    svg.appendChild(svgEl('text', { x: m.left - 6, y: y(h * 60) + 4, 'text-anchor': 'end' }, `${h}h`));
  }

  rows.forEach((r, i) => {
    const x = m.left + slot * i + (slot - barW) / 2;
    const yFutsuTop = y(r.minSyokutei + r.minFutsu);
    const ySyokuteiTop = y(r.minSyokutei);
    const base = y(0);

    if (r.minSyokutei > 0) {
      svg.appendChild(svgEl('rect', { class: 'bar-syokutei', x, y: ySyokuteiTop, width: barW, height: base - ySyokuteiTop }));
    }
    if (r.minFutsu > 0) {
      svg.appendChild(svgEl('rect', { class: 'bar-futsu', x, y: yFutsuTop, width: barW, height: ySyokuteiTop - yFutsuTop }));
    }

    const total = r.minSyokutei + r.minFutsu;
    if (total > 0) {
      svg.appendChild(svgEl('text', { x: x + barW / 2, y: yFutsuTop - 4, 'text-anchor': 'middle' }, formatMinutesToHHMM(total)));
    }

    const dayLabel = svgEl('text', { x: x + barW / 2, y: H - m.bottom + 14, 'text-anchor': 'middle' }, String(r.day));
    const dowLabel = svgEl('text', { x: x + barW / 2, y: H - m.bottom + 28, 'text-anchor': 'middle' }, DAY_NAMES[r.dow]);
    if (r.off) {
      dayLabel.setAttribute('class', 'off-day');
      dowLabel.setAttribute('class', 'off-day');
    }
    svg.appendChild(dayLabel);
    svg.appendChild(dowLabel);

    const hit = svgEl('rect', { class: 'bar-hit', x: m.left + slot * i, y: m.top, width: slot, height: plotH, fill: 'transparent' });
    hit.appendChild(svgEl('title', {}, `${month}/${r.day}(${DAY_NAMES[r.dow]}) 残業 ${formatMinutesToHHMM(total)}（所定${formatMinutesToHHMM(r.minSyokutei)} / 普通${formatMinutesToHHMM(r.minFutsu)}）`));
    svg.appendChild(hit);
  });

  // 20hライン
  svg.appendChild(svgEl('line', { class: 'limit-line', x1: m.left, x2: W - m.right, y1: yc(MINASHI_MINUTES), y2: yc(MINASHI_MINUTES) }));
  svg.appendChild(svgEl('text', { class: 'limit-label', x: m.left + 4, y: yc(MINASHI_MINUTES) - 5 }, '20h（みなし残業）'));

  // 累計の曲線（横方向に制御点を置いた三次ベジェ。単調増加を保つ）
  const pts = cum.map((v, i) => [m.left + slot * i + slot / 2, yc(v)]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  svg.appendChild(svgEl('path', { class: 'cum-line', d }));

  // 予測線（最終実績日から月末まで。値は実績日以降の累計）
  if (forecast) {
    const drawForecast = (vals, cls) => {
      const fp = [pts[forecast.lastIdx], ...vals.map((v, j) => [m.left + slot * (forecast.lastIdx + 1 + j) + slot / 2, yc(v)])];
      let fd = `M ${fp[0][0]} ${fp[0][1]}`;
      for (let i = 1; i < fp.length; i++) {
        const mx = (fp[i - 1][0] + fp[i][0]) / 2;
        fd += ` C ${mx} ${fp[i - 1][1]}, ${mx} ${fp[i][1]}, ${fp[i][0]} ${fp[i][1]}`;
      }
      svg.appendChild(svgEl('path', { class: cls, d: fd }));
      const [ex, ey] = fp.at(-1);
      svg.appendChild(svgEl('text', { class: 'forecast-label', x: ex, y: ey - 8, 'text-anchor': 'end' }, `予測${formatMinutesToHHMM(Math.round(vals.at(-1)))}`));
    };
    drawForecast(forecast.a.slice(1), 'forecast-line');
    if (forecast.b) drawForecast(forecast.b.slice(1), 'forecast-line past');
  }

  // 20h超過後の点は赤丸＋ラベルで強調
  const crossIdx = cum.findIndex((v) => v > MINASHI_MINUTES);
  pts.forEach(([px, py], i) => {
    if (i === pts.length - 1 || i === crossIdx) {
      svg.appendChild(svgEl('circle', { class: 'cum-dot', cx: px, cy: py, r: 4 }));
      svg.appendChild(svgEl('text', { class: 'axis-right', x: px, y: py - 9, 'text-anchor': i === pts.length - 1 ? 'end' : 'middle' },
        `${i === crossIdx ? `${month}/${rows[i].day} 20h超過 ` : ''}累計${formatMinutesToHHMM(cum[i])}`));
    }
  });
}

function shiftMonth(delta) {
  const d = new Date(year, month - 1 + delta, 1);
  year = d.getFullYear();
  month = d.getMonth() + 1;
  history.replaceState(null, '', `chart.html?year=${year}&month=${month}`);
  init();
}

async function init() {
  const msg = document.getElementById('chartMessage');
  msg.classList.add('hidden');
  document.getElementById('chartWrapper').classList.add('hidden');
  document.getElementById('chartSummary').innerHTML = '';
  if (!year || !month) {
    showMessage('年月が指定されていません。');
    return;
  }
  document.getElementById('chartTitle').textContent = `${year}年${month}月 残業グラフ`;

  const key = `attendance_${year}_${String(month).padStart(2, '0')}`;
  const result = await chrome.storage.local.get(key);
  const cache = result[key];
  if (!cache || !cache.data || cache.data.length === 0) {
    showMessage(`${year}年${month}月のデータがありません。先にポップアップでその月の勤怠を取得してください。`);
    return;
  }

  let workDays = 0, totalSyokutei = 0, totalFutsu = 0;
  const holidays = getJapaneseHolidaysInMonth(year, month);
  const rows = cache.data.map((d) => {
    if (d.start || d.end) workDays++;
    const ot = calculateOvertime(d.start, d.end) || { minSyokutei: 0, minFutsu: 0 };
    totalSyokutei += ot.minSyokutei;
    totalFutsu += ot.minFutsu;
    const dow = new Date(year, month - 1, d.day).getDay();
    return { day: d.day, dow, off: dow === 0 || dow === 6 || holidays.has(d.day), ...ot };
  });

  // 着地予測: 最終実績日以降の営業日に平均残業を積み上げる（過去月など残り営業日がなければなし）
  const total = totalSyokutei + totalFutsu;
  let lastIdx = -1;
  rows.forEach((r, i) => { if (cache.data[i].start || cache.data[i].end) lastIdx = i; });
  const remainDays = lastIdx < 0 ? 0 : rows.slice(lastIdx + 1).filter((r) => !r.off).length;
  let forecast = null;
  if (workDays > 0 && remainDays > 0) {
    const project = (perDay) => {
      const vals = [total];
      for (let i = lastIdx + 1; i < rows.length; i++) vals.push(vals.at(-1) + (rows[i].off ? 0 : perDay));
      return vals; // vals[0] は実績累計
    };
    const past = await loadPastAvgPerDay();
    forecast = {
      lastIdx,
      remainDays,
      a: project(total / workDays),
      b: past ? project(past.avg) : null,
      pastMonths: past ? past.months : 0,
    };
  }

  renderSummary(workDays, total, totalSyokutei, totalFutsu, forecast);
  document.getElementById('chartWrapper').classList.remove('hidden');
  renderChart(rows, forecast);
}

document.getElementById('prevBtn').addEventListener('click', () => shiftMonth(-1));
document.getElementById('nextBtn').addEventListener('click', () => shiftMonth(1));

document.getElementById('todayBtn').addEventListener('click', () => {
  const now = new Date();
  year = now.getFullYear();
  month = now.getMonth() + 1;
  history.replaceState(null, '', `chart.html?year=${year}&month=${month}`);
  init();
});

init();
