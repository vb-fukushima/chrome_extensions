// 日本の祝日計算（popup.js / chart.js 共通）

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
