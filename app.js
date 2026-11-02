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
};

// メニューのページ名 → 画面
const WORKER_PAGES = { clock_in: 'clock_in', clock_out: 'clock_out', history: 'history' };

let me = null;
let historyMonth = null;

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

  if (me.role === 'admin') return showHome('admin');
  if (WORKER_PAGES[page]) return openWorkerPage(WORKER_PAGES[page]);
  showHome('worker');
}

function showHome(view) {
  const who = me.name ? me.name + ' さん' : 'ようこそ';
  // サーバーから来た文字は textContent で入れる（HTMLとして解釈させない）
  document.querySelector('#view-' + view + ' .greeting').textContent =
    who + (me.farmName ? '（' + me.farmName + '）' : '');
  show(view);
}

function openWorkerPage(view) {
  show(view);
  if (view === 'clock_in') loadClockIn();
  if (view === 'clock_out') loadClockOut();
  if (view === 'history') loadHistory(null);
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

// ---- 共通 ----

document.querySelectorAll('[data-go]').forEach(function (el) {
  el.addEventListener('click', function () {
    const page = el.getAttribute('data-go');
    if (page === 'home') showHome('worker');
    else openWorkerPage(page);
  });
});

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
