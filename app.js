/**
 * LIFF画面の動き
 *
 * 1. LIFFを起動して、LINEが発行したIDトークン（本人の証明書）を受け取る
 * 2. IDトークンをGASに送り、「自分は誰で、どの役割か」をサーバーに判定してもらう
 * 3. サーバーが返した役割と、メニューから来たページ（?page=）に合わせて画面を切り替える
 *
 * 画面側では役割を決めない。ここでの表示の出し分けは見た目だけで、本当の権限チェックはGAS側で行う。
 * 出勤・退勤の時刻もGASの時計で記録する。画面に出す「今の時刻」は目安の表示だけ。
 */

const ERROR_TEXT = {
  invalid_token: 'ログインの確認ができませんでした。画面を閉じて、もう一度開いてください。',
  expired_token: 'ログインの有効期限が切れました。画面を閉じて、もう一度開いてください。',
  no_token: 'LINEのログイン情報が取れませんでした。LINEアプリの中から開いてください。',
  server_not_configured: 'サーバーの設定が終わっていません。管理者に連絡してください。',
  invalid_code: '招待コードが違うか、期限が切れています。',
  code_used: 'この招待コードはすでに使われています。',
  no_employee: '従業員の登録がまだです。管理者に連絡してください。',
  not_registered: 'まだ登録されていません。画面を開き直してください。',
  inactive_user: 'このアカウントは今は使えません。管理者に連絡してください。',
  not_clocked_in: '先に「出勤」を押してください。',
  invalid_break: '休憩時間が正しくありません。',
  invalid_date: '選べるのは、今日から31日前までの日です。',
  reason_required: '理由を入れてください。',
  reason_too_long: '理由は200文字までにしてください。',
  invalid_time: '出勤・退勤の時刻が正しくありません（出勤から24時間以内）。',
  future_time: 'まだ来ていない時刻は入れられません。',
  already_pending: 'この日はすでに申請中です。結果を待ってください。',
  forbidden: 'この操作は管理者だけができます。',
  not_found: '見つかりませんでした。画面を開き直してください。',
  already_decided: 'この申請はすでに処理されています。',
  self_approval: '自分の申請は、自分では承認できません。',
};

const STATUS_TEXT = { pending: '申請中', approved: '承認済み', rejected: '却下' };

// メニューのページ名 → 画面
const WORKER_PAGES = { clock_in: 'clock_in', clock_out: 'clock_out', history: 'history', fix_request: 'fix_request' };
const ADMIN_PAGES = { attendance: 'attendance', approval: 'approval' };

let me = null;
let historyMonth = null;
let overviewMonth = null;

main();

async function main() {
  show('loading');
  try {
    if (!CONFIG.LIFF_ID) throw new Error('LIFF IDが未設定です');
    await liff.init({ liffId: CONFIG.LIFF_ID });

    // LINEアプリの外（パソコンのブラウザなど）で開いたときは、LINEログインへ
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    me = await api('me');
    route(new URLSearchParams(location.search).get('page'));
  } catch (err) {
    showError(err.message);
  }
}

// GASを呼ぶ。text/plain で送るとプリフライトが起きず、GASに届く
async function api(action, data) {
  const idToken = liff.getIDToken();
  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(Object.assign({ action: action, idToken: idToken }, data || {})),
  });
  return res.json();
}

function errorText(res) {
  return ERROR_TEXT[res.error] || 'エラーが起きました（' + res.error + '）';
}

function route(page) {
  if (!me.ok) return showError(errorText(me));
  if (!me.registered) return show('register');

  if (me.role === 'admin') {
    if (ADMIN_PAGES[page]) return openAdminPage(ADMIN_PAGES[page]);
    return showHome('admin');
  }
  if (WORKER_PAGES[page]) return openWorkerPage(WORKER_PAGES[page]);
  showHome('worker');
}

function showHome(view) {
  const who = me.name ? me.name + ' さん' : 'ようこそ';
  // サーバーから来た文字は textContent で入れる（HTMLとして解釈させない）
  document.querySelector('#view-' + view + ' .greeting').textContent =
    who + (me.farmName ? '（' + me.farmName + '）' : '');
  // 管理者でも従業員番号があれば、自分の出退勤を使える
  document.getElementById('my-attendance').hidden = !(me.role === 'admin' && me.hasEmployee);
  document.getElementById('back-to-admin').hidden = me.role !== 'admin';
  show(view);
}

function openWorkerPage(view) {
  show(view);
  if (view === 'clock_in') loadClockIn();
  if (view === 'clock_out') loadClockOut();
  if (view === 'history') loadHistory(null);
  if (view === 'fix_request') loadFixRequest();
}

function openAdminPage(view) {
  show(view);
  if (view === 'attendance') loadOverview(null);
  if (view === 'approval') loadRequests();
}

// ---- 出勤 ----

async function loadClockIn() {
  const status = document.getElementById('clock-in-status');
  const button = document.getElementById('clock-in-button');
  document.getElementById('clock-in-result').textContent = '';
  status.textContent = '確認中…';
  button.hidden = true;

  const t = await api('today');
  if (!t.ok) { status.textContent = errorText(t); return; }
  if (t.state === 'working') { status.textContent = 'すでに出勤しています（' + t.clockIn + '）'; return; }
  if (t.state === 'done') { status.textContent = '今日はすでに退勤しています（' + t.clockOut + '）'; return; }
  status.textContent = '出勤しますか？';
  button.hidden = false;
}

document.getElementById('clock-in-button').addEventListener('click', async function () {
  const button = this;
  const result = document.getElementById('clock-in-result');
  button.disabled = true;
  try {
    const res = await api('clockIn');
    if (res.ok) {
      button.hidden = true;
      document.getElementById('clock-in-status').textContent = '';
      result.textContent = res.clockIn + ' に出勤しました';
    } else if (res.error === 'already_clocked_in') {
      result.textContent = 'すでに出勤しています（' + res.clockIn + '）';
    } else if (res.error === 'already_done_today') {
      result.textContent = '今日はすでに退勤しています（' + res.clockOut + '）';
    } else {
      result.textContent = errorText(res);
    }
  } catch (err) {
    result.textContent = '通信に失敗しました。電波のよい所でもう一度押してください。';
  } finally {
    button.disabled = false;
  }
});

// ---- 退勤 ----

async function loadClockOut() {
  const status = document.getElementById('clock-out-status');
  const form = document.getElementById('clock-out-form');
  document.getElementById('clock-out-result').textContent = '';
  status.textContent = '確認中…';
  form.hidden = true;

  const t = await api('today');
  if (!t.ok) { status.textContent = errorText(t); return; }
  if (t.state === 'none') { status.textContent = ERROR_TEXT.not_clocked_in; return; }
  if (t.state === 'done') { status.textContent = '今日はすでに退勤しています（' + t.clockOut + '）'; return; }
  status.textContent = '出勤：' + t.clockIn;
  document.getElementById('break-minutes').value = t.defaultBreak;
  form.hidden = false;
}

document.getElementById('clock-out-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const button = document.getElementById('clock-out-button');
  const result = document.getElementById('clock-out-result');
  const value = document.getElementById('break-minutes').value;
  if (value === '' || !/^\d+$/.test(value)) {
    result.textContent = '休憩時間を分（数字）で入れてください。';
    return;
  }
  button.disabled = true;
  try {
    const res = await api('clockOut', { breakMinutes: Number(value) });
    if (res.ok) {
      e.target.hidden = true;
      document.getElementById('clock-out-status').textContent = '';
      result.textContent = res.clockOut + ' に退勤しました。今日の勤務：' + duration(res.workMinutes);
    } else if (res.error === 'already_clocked_out') {
      result.textContent = 'すでに退勤しています（' + res.clockOut + '）';
    } else if (res.error === 'invalid_break') {
      result.textContent = res.maxBreak < 600
        ? '出勤してから ' + duration(res.maxBreak) + 'しかたっていないため、休憩は 0〜' + res.maxBreak + ' 分で入れてください。'
        : '休憩時間は 0〜600 分で入れてください。';
    } else {
      result.textContent = errorText(res);
    }
  } catch (err) {
    result.textContent = '通信に失敗しました。電波のよい所でもう一度押してください。';
  } finally {
    button.disabled = false;
  }
});

// ---- 履歴 ----

async function loadHistory(month) {
  const tbody = document.getElementById('history-rows');
  const empty = document.getElementById('history-empty');
  const total = document.getElementById('history-total');
  tbody.textContent = '';
  empty.hidden = true;
  total.textContent = '読み込み中…';

  const res = await api('history', month ? { month: month } : {});
  if (!res.ok) { total.textContent = errorText(res); return; }

  historyMonth = res.month;
  const parts = res.month.split('-');
  document.getElementById('history-month').textContent = parts[0] + '年' + Number(parts[1]) + '月';
  total.textContent = '合計：' + duration(res.totalMinutes) + '（' + res.rows.filter(function (r) { return r.workMinutes !== null; }).length + '日）';

  res.rows.forEach(function (r) {
    const tr = document.createElement('tr');
    const d = r.date.split('-');
    [Number(d[1]) + '/' + Number(d[2]), r.clockIn, r.clockOut || '退勤なし',
     r.breakMinutes === null ? '−' : r.breakMinutes + '分',
     r.workMinutes === null ? '−' : duration(r.workMinutes)].forEach(function (text) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  empty.hidden = res.rows.length > 0;
}

function shiftMonth(delta) {
  const parts = historyMonth.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

document.getElementById('prev-month').addEventListener('click', function () { loadHistory(shiftMonth(-1)); });
document.getElementById('next-month').addEventListener('click', function () { loadHistory(shiftMonth(1)); });

// ---- 修正申請（働く人） ----

function loadFixRequest() {
  const input = document.getElementById('fix-date');
  input.max = ymdLocal(0);
  input.min = ymdLocal(31);
  if (!input.value) input.value = ymdLocal(1);
  document.getElementById('fix-result').textContent = '';
  loadFixForm();
  loadFixList();
}

async function loadFixForm() {
  const form = document.getElementById('fix-form');
  const current = document.getElementById('fix-current');
  const date = document.getElementById('fix-date').value;
  form.hidden = true;
  current.textContent = '確認中…';

  const res = await api('fixForm', { date: date });
  if (!res.ok) { current.textContent = errorText(res); return; }
  current.textContent = '今の記録：' + describe(res.current);
  if (res.pending) { current.textContent += '（この日は申請中です）'; return; }

  document.getElementById('fix-in').value = res.current ? pad5(res.current.clockIn) : '';
  document.getElementById('fix-out').value = res.current && res.current.clockOut ? pad5(res.current.clockOut) : '';
  document.getElementById('fix-break').value = res.current && res.current.breakMinutes !== null ? res.current.breakMinutes : res.defaultBreak;
  document.getElementById('fix-reason').value = '';
  form.hidden = false;
}

document.getElementById('fix-date').addEventListener('change', function () {
  document.getElementById('fix-result').textContent = '';
  loadFixForm();
});

document.getElementById('fix-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const result = document.getElementById('fix-result');
  const reason = document.getElementById('fix-reason').value.trim();
  const brk = document.getElementById('fix-break').value;
  if (!reason) { result.textContent = ERROR_TEXT.reason_required; return; }
  if (!/^\d+$/.test(brk)) { result.textContent = '休憩時間を分（数字）で入れてください。'; return; }

  const button = document.getElementById('fix-submit');
  button.disabled = true;
  try {
    const res = await api('fixSubmit', {
      date: document.getElementById('fix-date').value,
      clockIn: document.getElementById('fix-in').value,
      clockOut: document.getElementById('fix-out').value,
      breakMinutes: Number(brk),
      reason: reason,
    });
    if (res.ok) {
      e.target.hidden = true;
      result.textContent = '申請しました。管理者の承認を待ってください。';
      loadFixList();
    } else if (res.error === 'invalid_break') {
      result.textContent = '休憩は 0〜' + res.maxBreak + ' 分で入れてください。';
    } else {
      result.textContent = errorText(res);
    }
  } catch (err) {
    result.textContent = '通信に失敗しました。電波のよい所でもう一度押してください。';
  } finally {
    button.disabled = false;
  }
});

async function loadFixList() {
  const ul = document.getElementById('fix-list');
  const empty = document.getElementById('fix-list-empty');
  ul.textContent = '';
  const res = await api('fixList');
  if (!res.ok) return;
  res.rows.forEach(function (r) {
    const li = document.createElement('li');
    li.appendChild(text(shortDate(r.date) + '　' + r.clockIn + '〜' + r.clockOut + ' 休憩' + r.breakMinutes + '分'));
    li.appendChild(tag(r.status));
    if (r.status === 'rejected' && r.rejectReason) li.appendChild(line('却下の理由：' + r.rejectReason));
    ul.appendChild(li);
  });
  empty.hidden = res.rows.length > 0;
}

// ---- 勤怠確認（管理者） ----

async function loadOverview(month) {
  const res = await api('adminOverview', month ? { month: month } : {});
  if (!res.ok) { showError(errorText(res)); return; }
  overviewMonth = res.month;

  const missingBox = document.getElementById('missing-box');
  const missingList = document.getElementById('missing-list');
  missingList.textContent = '';
  res.missing.forEach(function (m) {
    missingList.appendChild(line(m.name + '　' + shortDate(m.date) + ' ' + m.clockIn + '〜', 'li'));
  });
  missingBox.hidden = res.missing.length === 0;

  const STATE = { none: '未出勤', working: '出勤中', done: '退勤済み' };
  fillRows('today-rows', res.rows.map(function (r) {
    return [r.name, STATE[r.today.state] || r.today.state, r.today.clockIn || '−', r.today.clockOut || '−'];
  }));

  const parts = res.month.split('-');
  document.getElementById('ov-month').textContent = parts[0] + '年' + Number(parts[1]) + '月';
  fillRows('month-rows', res.rows.map(function (r) { return [r.name, r.days + '日', duration(r.totalMinutes)]; }));

  // 直接修正の従業員リスト
  const select = document.getElementById('edit-emp');
  if (!select.options.length) {
    res.rows.forEach(function (r) {
      const opt = document.createElement('option');
      opt.value = r.employeeId;
      opt.textContent = r.name;
      select.appendChild(opt);
    });
    const dateInput = document.getElementById('edit-date');
    dateInput.max = ymdLocal(0);
    dateInput.min = ymdLocal(31);
    dateInput.value = ymdLocal(1);
    loadEditDay();
  }
}

document.getElementById('ov-prev').addEventListener('click', function () { loadOverview(shiftYm(overviewMonth, -1)); });
document.getElementById('ov-next').addEventListener('click', function () { loadOverview(shiftYm(overviewMonth, 1)); });

async function loadEditDay() {
  const form = document.getElementById('edit-form');
  const current = document.getElementById('edit-current');
  form.hidden = true;
  current.textContent = '確認中…';
  const res = await api('adminDay', {
    employeeId: document.getElementById('edit-emp').value,
    date: document.getElementById('edit-date').value,
  });
  if (!res.ok) { current.textContent = errorText(res); return; }
  current.textContent = '今の記録：' + describe(res.current);
  document.getElementById('edit-in').value = res.current ? pad5(res.current.clockIn) : '';
  document.getElementById('edit-out').value = res.current && res.current.clockOut ? pad5(res.current.clockOut) : '';
  document.getElementById('edit-break').value = res.current && res.current.breakMinutes !== null ? res.current.breakMinutes : res.defaultBreak;
  document.getElementById('edit-reason').value = '';
  form.hidden = false;
}

['edit-emp', 'edit-date'].forEach(function (id) {
  document.getElementById(id).addEventListener('change', function () {
    document.getElementById('edit-result').textContent = '';
    loadEditDay();
  });
});

document.getElementById('edit-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const result = document.getElementById('edit-result');
  const reason = document.getElementById('edit-reason').value.trim();
  const brk = document.getElementById('edit-break').value;
  if (!reason) { result.textContent = ERROR_TEXT.reason_required; return; }
  if (!/^\d+$/.test(brk)) { result.textContent = '休憩時間を分（数字）で入れてください。'; return; }

  const button = document.getElementById('edit-submit');
  button.disabled = true;
  try {
    const res = await api('adminEdit', {
      employeeId: document.getElementById('edit-emp').value,
      date: document.getElementById('edit-date').value,
      clockIn: document.getElementById('edit-in').value,
      clockOut: document.getElementById('edit-out').value,
      breakMinutes: Number(brk),
      reason: reason,
    });
    if (res.ok) {
      result.textContent = '保存しました。';
      loadEditDay();
      loadOverview(overviewMonth);
    } else if (res.error === 'invalid_break') {
      result.textContent = '休憩は 0〜' + res.maxBreak + ' 分で入れてください。';
    } else {
      result.textContent = errorText(res);
    }
  } catch (err) {
    result.textContent = '通信に失敗しました。';
  } finally {
    button.disabled = false;
  }
});

// ---- 承認（管理者） ----

async function loadRequests() {
  const status = document.getElementById('approval-status');
  const box = document.getElementById('approval-list');
  box.textContent = '';
  status.textContent = '読み込み中…';
  const res = await api('adminRequests');
  if (!res.ok) { status.textContent = errorText(res); return; }
  status.textContent = res.rows.length ? '申請中：' + res.rows.length + '件' : '申請中のものはありません。';

  res.rows.forEach(function (r) {
    const card = document.createElement('div');
    card.className = 'card';
    card.appendChild(line(r.name + '　' + shortDate(r.date), 'strong'));
    card.appendChild(line('今：' + describe(r.current)));
    card.appendChild(line('申請：' + r.clockIn + '〜' + r.clockOut + ' 休憩' + r.breakMinutes + '分'));
    card.appendChild(line('理由：' + r.reason));
    const msg = line('', 'p');
    msg.className = 'result';

    if (r.isMine) {
      card.appendChild(line('自分の申請は、自分では承認できません。', 'p'));
    } else {
      const reject = document.createElement('textarea');
      reject.rows = 2;
      reject.maxLength = 200;
      reject.placeholder = '却下するときの理由（必須）';
      const row = document.createElement('div');
      row.className = 'row';
      const ok = button('承認', '');
      const ng = button('却下', 'danger');
      ok.addEventListener('click', function () { decide(r.requestId, 'approve', '', msg, row); });
      ng.addEventListener('click', function () {
        if (!reject.value.trim()) { msg.textContent = '却下の理由を入れてください。'; return; }
        decide(r.requestId, 'reject', reject.value.trim(), msg, row);
      });
      row.appendChild(ok);
      row.appendChild(ng);
      card.appendChild(reject);
      card.appendChild(row);
    }
    card.appendChild(msg);
    box.appendChild(card);
  });
}

async function decide(requestId, decision, rejectReason, msg, row) {
  row.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
  try {
    const res = await api('adminDecide', { requestId: requestId, decision: decision, rejectReason: rejectReason });
    if (res.ok) {
      msg.textContent = decision === 'approve' ? '承認しました。勤怠に反映しました。' : '却下しました。';
      row.hidden = true;
    } else {
      msg.textContent = errorText(res);
      row.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
    }
  } catch (err) {
    msg.textContent = '通信に失敗しました。';
    row.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
  }
}

// ---- 共通 ----

document.querySelectorAll('[data-go]').forEach(function (el) {
  el.addEventListener('click', function () {
    const page = el.getAttribute('data-go');
    if (page === 'home') showHome('worker');
    else openWorkerPage(page);
  });
});

document.querySelectorAll('[data-admin]').forEach(function (el) {
  el.addEventListener('click', function () {
    const page = el.getAttribute('data-admin');
    if (page === 'home') showHome('admin');
    else openAdminPage(page);
  });
});

document.getElementById('my-attendance').addEventListener('click', function () { showHome('worker'); });
document.getElementById('back-to-admin').addEventListener('click', function () { showHome('admin'); });

// 画面に出す小さな部品。サーバーから来た文字はすべて textContent で入れる
function text(s) { return document.createTextNode(s); }
function line(s, tagName) { const el = document.createElement(tagName || 'div'); el.textContent = s; return el; }
function tag(status) { const el = document.createElement('span'); el.className = 'tag ' + status; el.textContent = STATUS_TEXT[status] || status; return el; }
function button(label, cls) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; return b; }

function fillRows(tbodyId, rows) {
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  rows.forEach(function (cells) {
    const tr = document.createElement('tr');
    cells.forEach(function (c) { tr.appendChild(line(c, 'td')); });
    tbody.appendChild(tr);
  });
}

function describe(rec) {
  if (!rec) return '記録なし';
  return rec.clockIn + '〜' + (rec.clockOut || '退勤なし') + (rec.breakMinutes === null ? '' : ' 休憩' + rec.breakMinutes + '分');
}

// 「8:05」→「08:05」（時刻の入力欄が2桁を求めるため）
function pad5(hm) { return hm.length === 4 ? '0' + hm : hm; }

function shortDate(ymd) { const d = ymd.split('-'); return Number(d[1]) + '/' + Number(d[2]); }

// 今日から daysAgo 日前を yyyy-MM-dd で
function ymdLocal(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function shiftYm(ym, delta) {
  const p = ym.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

document.getElementById('register-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('register-message');
  const button = e.target.querySelector('button');
  msg.textContent = '';
  button.disabled = true;
  try {
    const code = document.getElementById('invite-code').value.trim().toUpperCase();
    const res = await api('register', { code: code });
    if (!res.ok && (res.error === 'invalid_code' || res.error === 'code_used')) {
      msg.textContent = ERROR_TEXT[res.error];
      return;
    }
    me = res;
    route(new URLSearchParams(location.search).get('page'));
  } catch (err) {
    msg.textContent = '通信に失敗しました。電波のよい所でもう一度試してください。';
  } finally {
    button.disabled = false;
  }
});

// 目安として今の時刻を表示（記録に使うのはGASの時刻）
function tick() {
  const now = new Date();
  const text = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  document.querySelectorAll('.clock-now').forEach(function (el) { el.textContent = '今 ' + text; });
}
tick();
setInterval(tick, 10000);

function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return m + '分';
  return h + '時間' + (m ? m + '分' : '');
}

function show(name) {
  document.querySelectorAll('.view').forEach(function (el) {
    el.hidden = el.id !== 'view-' + name;
  });
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  show('error');
}
