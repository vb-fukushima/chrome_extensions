// Chatwork Attendance Tracker 用 Google Apps Script
// 使い方は README の「スプレッドシート連携」を参照。
// スクリプトプロパティ TOKEN に合言葉を設定すること。

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || body.token !== token) return json_({ ok: false, error: 'invalid token' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    writeDetail_(ss, body);
    writeSummary_(ss, body);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hm_(min) {
  return Math.floor(min / 60) + ':' + ('0' + (min % 60)).slice(-2);
}

// 月ごとのシート (例: 2026-10) を丸ごと書き直す
function writeDetail_(ss, b) {
  const name = b.year + '-' + ('0' + b.month).slice(-2);
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const header = ['日付', '曜日', '祝日', '出勤', '退勤', '残業合計', '所定', '普通', '深夜', '在宅', '休み'];
  const values = b.rows.map(function (r) {
    return [
      b.year + '/' + b.month + '/' + r.day, r.dow, r.holiday ? '祝' : '', r.start, r.end,
      r.otTotal ? hm_(r.otTotal) : '', r.otSyokutei ? hm_(r.otSyokutei) : '',
      r.otFutsu ? hm_(r.otFutsu) : '', r.otShinya ? hm_(r.otShinya) : '',
      r.remote ? '○' : '', r.leave,
    ];
  });
  sheet.clear();
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (values.length) {
    sheet.getRange(2, 1, values.length, header.length).setNumberFormat('@').setValues(values);
  }
  sheet.setFrozenRows(1);
}

// 「サマリー」シートに月ごとに1行 (上書き)
function writeSummary_(ss, b) {
  const sheet = ss.getSheetByName('サマリー') || ss.insertSheet('サマリー');
  const header = ['年月', '実働日数', '営業日数', '所定(分)', '普通(分)', '深夜(分)', '残業合計(分)', '残業合計', '在宅日数', '更新日時', '所定残業代', '普通残業代', '深夜残業代', '実額換算', '追加支給見込み'];
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  const key = b.year + '-' + ('0' + b.month).slice(-2);
  const s = b.summary;
  const row = [key, s.workDays, s.businessDays, s.syokutei, s.futsu, s.shinya, s.total, hm_(s.total), s.remoteDays, new Date(),
    s.pay.syokuteiPay, s.pay.futsuPay, s.pay.shinyaPay, s.pay.realPay, s.pay.extra];

  const last = sheet.getLastRow();
  let target = last + 1;
  if (last > 1) {
    const keys = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0] === key) { target = i + 2; break; }
    }
  }
  sheet.getRange(target, 1, 1, 1).setNumberFormat('@');
  sheet.getRange(target, 1, 1, header.length).setValues([row]);
}
