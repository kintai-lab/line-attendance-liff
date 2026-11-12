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
  month_locked: 'この月は給与が確定しているため、変更できません。',
  has_blockers: '退勤なし・申請中の修正があるため、確定できません。',
  already_confirmed: 'この月はすでに確定しています。',
  not_confirmed: 'この月はまだ確定していません。',
  nothing_to_confirm: 'この月は勤務の記録がないため、確定するものがありません。',
  invalid_amount: '金額・日数の入れ方が正しくありません（数字だけで入れてください）。',
  bad_request: '入力が正しくありません。',
};
ERROR_TEXT.not_confirmed = 'この月はまだ確定していません。給与計算で確定してから作ってください。';
Object.assign(ERROR_TEXT, {
  invalid_name: '名前を入れてください（40文字まで）。',
  invalid_wage: '時給は 1〜10000 の数字で入れてください。',
  retired: 'この人は退職しています。',
  self_retire: '自分自身は退職にできません。',
  self_reissue: '自分の招待コードは再発行できません（働く人として登録し直すことになり、管理者がいなくなるため）。',
  invalid_setting: '設定の値が正しくありません。',
});

// 給与明細：農家さんの紙と同じ項目・同じ並び。単位 H は「分」で届くので時間に直して出す
const SLIP_LAYOUT = [
  ['勤怠', [
    ['work_days', '勤務日数', '日'], ['attend_days', '出勤日数', '日'], ['attend_minutes', '出勤時間', 'H'],
    ['paid_leave_days', '有給日数', '日'], ['absence_days', '欠勤日数', '日'], ['hourly_wage', '時給', '円'],
    ['late_early_hours', '遅刻早退時間', 'h'], ['special_leave_days', '特別休暇日数', '日'], ['paid_leave_left', '有給残日数', '日'],
    ['overtime_minutes', '普通残業時間', 'H'], ['night_overtime_minutes', '深夜残業時間', 'H'], ['holiday_minutes', '休日出勤時間', 'H'],
    ['overtime_yen', '残業', '円']]],
  ['控除', [
    ['health_insurance', '健康保険', '円'], ['care_insurance', '介護保険', '円'], ['pension', '厚生保険', '円'],
    ['pension_fund', '厚生基金', '円'], ['employment_insurance', '雇用保険', '円'], ['income_tax', '所得税', '円'],
    ['resident_tax', '住民税', '円'], ['dorm_fee', '寮費', '円'], ['utilities', '電気・ガス・Wi-Fi', '円'],
    ['toilet_cleaning', 'トイレ清掃', '円']]],
  ['支給', [
    ['base_pay', '基本給', '円'], ['position_allowance', '役職手当', '円'], ['qualification_allowance', '資格手当', '円'],
    ['housing_allowance', '住居手当', '円'], ['family_allowance', '家族手当', '円'], ['night_shift_allowance', '夜勤手当', '円'],
    ['night_allowance', '深夜手当', '円'], ['overtime_pay', '普通残業', '円'], ['night_overtime_pay', '深夜残業', '円'],
    ['year_end_adjustment', '年末調整精算分', '円']]],
];
// 管理者が手で入れられる項目（GASの EDITABLE_ITEMS と同じ）
const EDITABLE = ['position_allowance', 'qualification_allowance', 'housing_allowance', 'family_allowance', 'night_shift_allowance',
  'health_insurance', 'care_insurance', 'pension', 'pension_fund', 'employment_insurance', 'resident_tax', 'dorm_fee',
  'utilities', 'toilet_cleaning', 'income_tax', 'year_end_adjustment', 'paid_leave_days', 'absence_days',
  'late_early_hours', 'special_leave_days', 'paid_leave_left'];

const CHECK_TEXT = {
  missing_clock_out: function (c) { return c.name + '　' + shortDate(c.date) + '：退勤なし'; },
  pending_fix: function (c) { return c.name + '　' + shortDate(c.date) + '：修正の申請中'; },
  below_minimum_wage: function (c) { return c.name + '：時給 ' + yen(c.wage) + ' が最低賃金 ' + yen(c.minimum) + ' を下回っています'; },
  income_tax_empty: function (c) { return c.name + '：所得税が未入力です（0円なら 0 と入れてください）'; },
  month_not_ended: function () { return 'この月はまだ終わっていません。確定すると、この月の出退勤や修正ができなくなります。'; },
};

// 申請の状態（働く人の画面では言語に合わせる）
function statusText(status) { return MSG['status_' + status] ? t('status_' + status) : status; }

// メニューのページ名 → 画面
const WORKER_PAGES = { clock_in: 'clock_in', clock_out: 'clock_out', history: 'history', fix_request: 'fix_request', payslip: 'payslip', language: 'language' };
const ADMIN_PAGES = { attendance: 'attendance', approval: 'approval', payroll: 'payroll', reports: 'reports', employees: 'employees', settings: 'settings' };

let me = null;
let historyMonth = null;
let overviewMonth = null;
let payrollMonth = null;
let reportMonth = null;

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
  if (LANG === 'id' && ERROR_TEXT_ID[res.error]) return ERROR_TEXT_ID[res.error];
  return ERROR_TEXT[res.error] || t('error_any', res.error);
}

function route(page) {
  applyLang(me.language);
  if (!me.ok) return showError(errorText(me));
  if (!me.registered) {
    // 退職などで止まっているLINE：新しい招待コードがあれば登録し直せる
    document.getElementById('register-inactive').hidden = !me.inactive;
    return show('register');
  }

  if (me.role === 'admin') {
    if (ADMIN_PAGES[page]) return openAdminPage(ADMIN_PAGES[page]);
    return showHome('admin');
  }
  if (WORKER_PAGES[page]) return openWorkerPage(WORKER_PAGES[page]);
  showHome('worker');
}

function showHome(view) {
  // 管理者の画面は日本語、働く人の画面はその人の言語
  applyLang(view === 'admin' ? 'ja' : me.language);
  const who = me.name ? t('greeting', me.name) : t('welcome');
  // サーバーから来た文字は textContent で入れる（HTMLとして解釈させない）
  document.querySelector('#view-' + view + ' .greeting').textContent =
    who + (me.farmName ? '（' + me.farmName + '）' : '');
  // 管理者でも従業員番号があれば、自分の出退勤を使える
  document.getElementById('my-attendance').hidden = !(me.role === 'admin' && me.hasEmployee);
  document.getElementById('back-to-admin').hidden = me.role !== 'admin';
  show(view);
}

function openWorkerPage(view) {
  applyLang(me.language);
  show(view);
  if (view === 'clock_in') loadClockIn();
  if (view === 'clock_out') loadClockOut();
  if (view === 'history') loadHistory(null);
  if (view === 'fix_request') loadFixRequest();
  if (view === 'payslip') loadPayslipList();
  if (view === 'language') loadLanguage();
}

function openAdminPage(view) {
  applyLang('ja');
  show(view);
  if (view === 'attendance') loadOverview(null);
  if (view === 'approval') loadRequests();
  if (view === 'payroll') loadPayroll(shiftYm(ymdLocal(0).slice(0, 7), -1));
  if (view === 'reports') loadReports(shiftYm(ymdLocal(0).slice(0, 7), -1));
  if (view === 'employees') loadEmployees();
  if (view === 'settings') loadSettings();
}

// ---- 出勤 ----

async function loadClockIn() {
  const status = document.getElementById('clock-in-status');
  const button = document.getElementById('clock-in-button');
  document.getElementById('clock-in-result').textContent = '';
  status.textContent = t('checking');
  button.hidden = true;

  const today = await api('today');
  if (!today.ok) { status.textContent = errorText(today); return; }
  if (today.state === 'working') { status.textContent = t('already_in', today.clockIn); return; }
  if (today.state === 'done') { status.textContent = t('already_done', today.clockOut); return; }
  status.textContent = t('ask_in');
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
      result.textContent = t('done_in', res.clockIn);
    } else if (res.error === 'already_clocked_in') {
      result.textContent = t('already_in', res.clockIn);
    } else if (res.error === 'already_done_today') {
      result.textContent = t('already_done', res.clockOut);
    } else {
      result.textContent = errorText(res);
    }
  } catch (err) {
    result.textContent = t('network');
  } finally {
    button.disabled = false;
  }
});

// ---- 退勤 ----

async function loadClockOut() {
  const status = document.getElementById('clock-out-status');
  const form = document.getElementById('clock-out-form');
  document.getElementById('clock-out-result').textContent = '';
  status.textContent = t('checking');
  form.hidden = true;

  const today = await api('today');
  if (!today.ok) { status.textContent = errorText(today); return; }
  if (today.state === 'none') { status.textContent = errorText({ error: 'not_clocked_in' }); return; }
  if (today.state === 'done') { status.textContent = t('already_done', today.clockOut); return; }
  status.textContent = t('clocked_in_at', today.clockIn);
  document.getElementById('break-minutes').value = today.defaultBreak;
  form.hidden = false;
}

document.getElementById('clock-out-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  const button = document.getElementById('clock-out-button');
  const result = document.getElementById('clock-out-result');
  const value = document.getElementById('break-minutes').value;
  if (value === '' || !/^\d+$/.test(value)) {
    result.textContent = t('break_number');
    return;
  }
  button.disabled = true;
  try {
    const res = await api('clockOut', { breakMinutes: Number(value) });
    if (res.ok) {
      e.target.hidden = true;
      document.getElementById('clock-out-status').textContent = '';
      result.textContent = t('done_out', res.clockOut, duration(res.workMinutes));
    } else if (res.error === 'already_clocked_out') {
      result.textContent = t('already_out', res.clockOut);
    } else if (res.error === 'invalid_break') {
      result.textContent = res.maxBreak < 600 ? t('break_short', duration(res.maxBreak), res.maxBreak) : t('break_max');
    } else {
      result.textContent = errorText(res);
    }
  } catch (err) {
    result.textContent = t('network');
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
  total.textContent = t('loading');

  const res = await api('history', month ? { month: month } : {});
  if (!res.ok) { total.textContent = errorText(res); return; }

  historyMonth = res.month;
  document.getElementById('history-month').textContent = monthLabel(res.month);
  total.textContent = t('total', duration(res.totalMinutes), res.rows.filter(function (r) { return r.workMinutes !== null; }).length);

  res.rows.forEach(function (r) {
    const tr = document.createElement('tr');
    const d = r.date.split('-');
    [Number(d[1]) + '/' + Number(d[2]), r.clockIn, r.clockOut || t('no_clock_out'),
     r.breakMinutes === null ? '−' : duration(r.breakMinutes),
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
  current.textContent = t('checking');

  const res = await api('fixForm', { date: date });
  if (!res.ok) { current.textContent = errorText(res); return; }
  current.textContent = t('current', describe(res.current));
  if (res.locked) { current.textContent += t('locked_fix'); return; }
  if (res.pending) { current.textContent += t('pending_day'); return; }

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
  if (!reason) { result.textContent = errorText({ error: 'reason_required' }); return; }
  if (!/^\d+$/.test(brk)) { result.textContent = t('break_number'); return; }

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
      result.textContent = t('fix_sent');
      loadFixList();
    } else if (res.error === 'invalid_break') {
      result.textContent = t('break_range', res.maxBreak);
    } else {
      result.textContent = errorText(res);
    }
  } catch (err) {
    result.textContent = t('network');
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
    li.appendChild(text(shortDate(r.date) + '　' + r.clockIn + '〜' + r.clockOut + t('break_min', r.breakMinutes)));
    li.appendChild(tag(r.status));
    if (r.status === 'rejected' && r.rejectReason) li.appendChild(line(t('reject_reason', r.rejectReason)));
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
  fillRows('month-rows', res.rows.map(function (r) { return [r.name, r.days + '日', duration(r.totalMinutes, 'ja')]; }));

  // 直接修正の従業員リスト
  const select = document.getElementById('edit-emp');
  if (!select.options.length) {
    // 退職した人も選べる（退職日の押し忘れなどを直すため）
    res.editable.forEach(function (r) {
      const opt = document.createElement('option');
      opt.value = r.employeeId;
      opt.textContent = r.name + (r.retired ? '（退職）' : '');
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
  current.textContent = '今の記録：' + describe(res.current, 'ja');
  if (res.locked) { current.textContent += '（この月は給与が確定しているため、直せません）'; return; }
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
    card.appendChild(line('今：' + describe(r.current, 'ja')));
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

// ---- 給与計算（管理者） ----

async function loadPayroll(month, keepDetail) {
  const status = document.getElementById('pr-status');
  status.textContent = '計算中…';
  document.getElementById('pr-result').textContent = '';
  if (!keepDetail) document.getElementById('pr-detail').textContent = '';
  const res = await api('payrollCalc', { month: month });
  if (!res.ok) { status.textContent = errorText(res); return; }
  renderPayroll(res, keepDetail);
}

function renderPayroll(res, keepDetail) {
  payrollMonth = res.month;
  const parts = res.month.split('-');
  document.getElementById('pr-month').textContent = parts[0] + '年' + Number(parts[1]) + '月';
  const confirmed = res.status === 'confirmed';
  document.getElementById('pr-status').textContent = confirmed
    ? '確定済み（' + res.confirmedAt + '）'
    : (res.rows.length ? '下書き（まだ確定していません）' : 'この月の勤務の記録はありません。');

  fillChecks('pr-blockers', res.blockers);
  fillChecks('pr-warnings', res.warnings);

  const tbody = document.getElementById('pr-rows');
  tbody.textContent = '';
  const sum = { gross: 0, ded: 0, net: 0 };
  res.rows.forEach(function (r) {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    [r.name, r.attend_days + '日', yen(r.gross_total), yen(r.deduction_total), yen(r.net_pay)].forEach(function (c) { tr.appendChild(line(c, 'td')); });
    tr.addEventListener('click', function () { openPayrollDetail(r, !confirmed); });
    tbody.appendChild(tr);
    sum.gross += Number(r.gross_total) || 0; sum.ded += Number(r.deduction_total) || 0; sum.net += Number(r.net_pay) || 0;
  });
  if (res.rows.length > 1) {
    const tr = document.createElement('tr');
    ['合計', '', yen(sum.gross), yen(sum.ded), yen(sum.net)].forEach(function (c) { tr.appendChild(line(c, 'td')); });
    tbody.appendChild(tr);
  }

  document.getElementById('pr-confirm').hidden = confirmed || !res.rows.length;
  document.getElementById('pr-confirm').disabled = res.blockers.length > 0;
  document.getElementById('pr-cancel-box').hidden = !confirmed;
  document.getElementById('pr-cancel-reason').value = '';

  // 保存のあとは、開いていた人の明細を新しい数字で開き直す
  const open = document.getElementById('pr-detail').getAttribute('data-emp');
  if (keepDetail && open) {
    const r = res.rows.find(function (x) { return x.employeeId === open; });
    if (r) openPayrollDetail(r, !confirmed);
  }
}

function fillChecks(id, checks) {
  const box = document.getElementById(id);
  const ul = box.querySelector('ul');
  ul.textContent = '';
  checks.forEach(function (c) { ul.appendChild(line(CHECK_TEXT[c.type] ? CHECK_TEXT[c.type](c) : c.type, 'li')); });
  box.hidden = checks.length === 0;
}

function openPayrollDetail(r, editable) {
  const box = document.getElementById('pr-detail');
  box.textContent = '';
  box.setAttribute('data-emp', r.employeeId);
  box.appendChild(line(r.name + ' さんの明細', 'h2'));
  if (editable) box.appendChild(line('白い欄は手で入れられます。空欄のままでもかまいません。', 'p')).className = 'muted small';
  renderSlip(box, r, editable);
  if (!editable) return;

  const msg = line('', 'p');
  msg.className = 'result';
  const save = button('この人の明細を保存', 'admin-btn');
  save.addEventListener('click', async function () {
    const values = {};
    box.querySelectorAll('input[data-key]').forEach(function (inp) { values[inp.getAttribute('data-key')] = inp.value.trim(); });
    save.disabled = true;
    try {
      const res = await api('payrollSave', { month: payrollMonth, employeeId: r.employeeId, values: values });
      if (!res.ok) {
        msg.textContent = errorText(res) + (res.item ? '（' + labelOf(res.item) + '）' : '');
        return;
      }
      renderPayroll(res, true);
      document.getElementById('pr-result').textContent = r.name + ' さんの明細を保存しました。';
    } catch (err) {
      msg.textContent = '通信に失敗しました。';
    } finally {
      save.disabled = false;
    }
  });
  box.appendChild(save);
  box.appendChild(msg);
  box.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('pr-prev').addEventListener('click', function () { loadPayroll(shiftYm(payrollMonth, -1)); });
document.getElementById('pr-next').addEventListener('click', function () { loadPayroll(shiftYm(payrollMonth, 1)); });

document.getElementById('pr-confirm').addEventListener('click', async function () {
  const btn = this;
  const result = document.getElementById('pr-result');
  if (!confirm('この月の給与を確定します。確定すると、この月の勤怠は変えられなくなります。よろしいですか？')) return;
  btn.disabled = true;
  try {
    const res = await api('payrollConfirm', { month: payrollMonth });
    if (!res.ok) { result.textContent = errorText(res); btn.disabled = false; return; }
    document.getElementById('pr-detail').textContent = '';
    renderPayroll(res);
    result.textContent = '確定しました。働く人の「給与明細」で見られるようになりました。';
  } catch (err) {
    result.textContent = '通信に失敗しました。';
    btn.disabled = false;
  }
});

document.getElementById('pr-cancel').addEventListener('click', async function () {
  const btn = this;
  const result = document.getElementById('pr-result');
  const reason = document.getElementById('pr-cancel-reason').value.trim();
  if (!reason) { result.textContent = '取り消す理由を入れてください。'; return; }
  btn.disabled = true;
  try {
    const res = await api('payrollCancel', { month: payrollMonth, reason: reason });
    if (!res.ok) { result.textContent = errorText(res); return; }
    document.getElementById('pr-detail').textContent = '';
    renderPayroll(res);
    result.textContent = '確定を取り消しました。直してから、もう一度確定してください。';
  } catch (err) {
    result.textContent = '通信に失敗しました。';
  } finally {
    btn.disabled = false;
  }
});

// ---- グラフ・PDF（管理者） ----

async function loadReports(month) {
  const status = document.getElementById('rp-status');
  status.textContent = '集計中…';
  document.getElementById('rp-result').textContent = '';
  document.getElementById('rp-files').textContent = '';
  const res = await api('reportSummary', { month: month });
  if (!res.ok) { status.textContent = errorText(res); return; }
  status.textContent = '';
  reportMonth = res.month;
  document.getElementById('rp-month').textContent = ymLabel(res.month);

  // 月ごとの推移：棒の長さは6か月のうち一番長い月を100%にする
  const trend = document.getElementById('rp-trend');
  trend.textContent = '';
  const maxMin = Math.max.apply(null, res.trend.map(function (t) { return t.minutes; }).concat([1]));
  res.trend.forEach(function (t) {
    const row = barRow(Number(t.month.split('-')[1]) + '月', t.minutes / maxMin, 0, hoursText(t.minutes));
    if (t.month === res.month) row.classList.add('current');
    row.appendChild(line('人件費 ' + (t.gross === null ? '未確定' : yen(t.gross)), 'div')).className = 'sub';
    trend.appendChild(row);
  });

  const people = document.getElementById('rp-people');
  people.textContent = '';
  const maxP = Math.max.apply(null, res.people.map(function (p) { return p.minutes; }).concat([1]));
  res.people.forEach(function (p) {
    people.appendChild(barRow(p.name, (p.minutes - p.overtimeMinutes) / maxP, p.overtimeMinutes / maxP, hoursText(p.minutes)));
  });
  document.getElementById('rp-people-empty').hidden = res.people.length > 0;

  document.getElementById('rp-export').hidden = !res.confirmed;
  document.getElementById('rp-export-note').textContent = res.confirmed
    ? '確定した明細から、PDF（1人ずつ・全員分）と一覧CSVを作って、Googleドライブに保存します。'
    : 'この月はまだ確定していません。給与計算で確定すると作れます。';
}

function barRow(label, ratio, otRatio, value) {
  const row = document.createElement('div');
  row.className = 'bar-row';
  row.appendChild(line(label, 'div')).className = 'label';
  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = 'fill';
  fill.style.width = (ratio * 100).toFixed(1) + '%';
  track.appendChild(fill);
  if (otRatio > 0) {
    const ot = document.createElement('div');
    ot.className = 'ot';
    ot.style.width = (otRatio * 100).toFixed(1) + '%';
    track.appendChild(ot);
  }
  row.appendChild(track);
  row.appendChild(line(value, 'div')).className = 'val';
  return row;
}

document.getElementById('rp-prev').addEventListener('click', function () { loadReports(shiftYm(reportMonth, -1)); });
document.getElementById('rp-next').addEventListener('click', function () { loadReports(shiftYm(reportMonth, 1)); });

document.getElementById('rp-export').addEventListener('click', async function () {
  const btn = this;
  const result = document.getElementById('rp-result');
  const ul = document.getElementById('rp-files');
  ul.textContent = '';
  result.textContent = '作成中…（10〜30秒ほどかかります）';
  btn.disabled = true;
  try {
    const res = await api('reportExport', { month: reportMonth });
    if (!res.ok) { result.textContent = errorText(res); return; }
    result.textContent = 'Googleドライブに保存しました。押すと開きます。';
    res.files.concat([{ name: '保存したフォルダを開く', url: res.folderUrl }]).forEach(function (f) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = f.url;
      a.textContent = f.name;
      // LINEの中ではなく、ふだんのブラウザ（Googleにログイン済み）で開く
      a.addEventListener('click', function (e) { e.preventDefault(); liff.openWindow({ url: f.url, external: true }); });
      li.appendChild(a);
      ul.appendChild(li);
    });
  } catch (err) {
    result.textContent = '通信に失敗しました。';
  } finally {
    btn.disabled = false;
  }
});

function ymLabel(ym) { const p = ym.split('-'); return p[0] + '年' + Number(p[1]) + '月'; }
function hoursText(minutes) { return hours(minutes / 60) + '時間'; }

// ---- 言語（働く人） ----

function loadLanguage() {
  document.getElementById('lang-current').textContent = t('lang_now');
  document.getElementById('lang-result').textContent = '';
  document.querySelectorAll('.lang-btn').forEach(function (b) { b.classList.toggle('chosen', b.getAttribute('data-lang') === LANG); });
}

document.querySelectorAll('.lang-btn').forEach(function (b) {
  b.addEventListener('click', async function () {
    const result = document.getElementById('lang-result');
    document.querySelectorAll('.lang-btn').forEach(function (x) { x.disabled = true; });
    try {
      const res = await api('setLanguage', { language: b.getAttribute('data-lang') });
      if (!res.ok) { result.textContent = errorText(res); return; }
      me = res;
      applyLang(me.language);
      loadLanguage();
      result.textContent = t('lang_changed');
    } catch (err) {
      result.textContent = t('network');
    } finally {
      document.querySelectorAll('.lang-btn').forEach(function (x) { x.disabled = false; });
    }
  });
});

// ---- 従業員管理（管理者） ----

const LANG_NAME = { ja: '日本語', id: 'インドネシア語' };
// 「いつもの控除・手当」の項目（GASの DEFAULT_ITEMS と同じ）
const PAY_ITEM_KEYS = ['position_allowance', 'qualification_allowance', 'housing_allowance', 'family_allowance', 'night_shift_allowance',
  'health_insurance', 'care_insurance', 'pension', 'pension_fund', 'employment_insurance', 'resident_tax', 'dorm_fee', 'utilities', 'toilet_cleaning'];
let employees = { rows: [], myEmployeeId: '' };

async function loadEmployees() {
  document.getElementById('emp-result').textContent = '読み込み中…';
  document.getElementById('emp-invite').textContent = '';
  document.getElementById('emp-detail').textContent = '';
  const res = await api('adminEmployees');
  document.getElementById('emp-result').textContent = res.ok ? '' : errorText(res);
  if (res.ok) { employees = res; renderEmployees(); }
}

function renderEmployees() {
  const box = document.getElementById('emp-list');
  box.textContent = '';
  employees.rows.slice().sort(function (a, b) { return (b.active - a.active) || a.employeeId.localeCompare(b.employeeId); }).forEach(function (e) {
    const card = document.createElement('div');
    card.className = 'card emp' + (e.active ? '' : ' retired');
    const name = line(e.name + '　' + e.employeeId, 'strong');
    name.className = 'link';
    name.addEventListener('click', function () { openEmployee(e.employeeId); });
    card.appendChild(name);
    card.appendChild(line('時給 ' + yen(e.hourlyWage) + '　' + LANG_NAME[e.language], 'div'));
    const state = !e.active ? '退職（' + e.retiredAt + '）' : e.registered ? 'LINE登録済み' : '未登録' + (e.inviteCode ? '（招待コード ' + e.inviteCode + '）' : '（招待コードなし：再発行してください）');
    card.appendChild(line(state, 'div')).className = 'muted small';
    box.appendChild(card);
  });
}

document.getElementById('emp-add-form').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  const btn = document.getElementById('emp-add-submit');
  const result = document.getElementById('emp-result');
  btn.disabled = true;
  try {
    const res = await api('adminEmployeeSave', {
      name: document.getElementById('emp-add-name').value.trim(),
      hourlyWage: document.getElementById('emp-add-wage').value.trim(),
      language: document.getElementById('emp-add-lang').value,
    });
    if (!res.ok) { result.textContent = errorText(res); return; }
    employees.rows = res.rows;
    renderEmployees();
    result.textContent = '追加しました（' + res.employeeId + '）。';
    ev.target.reset();
    showInvite(res.employeeId, res.inviteCode);
  } catch (err) {
    result.textContent = '通信に失敗しました。';
  } finally {
    btn.disabled = false;
  }
});

// 招待コードと、本人にそのまま送れる案内文（本人の言語で）を出す
function showInvite(employeeId, code) {
  const e = employees.rows.find(function (x) { return x.employeeId === employeeId; }) || {};
  const box = document.getElementById('emp-invite');
  box.textContent = '';
  const card = document.createElement('div');
  card.className = 'card invite';
  card.appendChild(line((e.name || '') + ' さんの招待コード', 'strong'));
  card.appendChild(line(code, 'div')).className = 'code';
  const message = e.language === 'id'
    ? 'Ini kode undangan untuk absensi di LINE.\nBuka menu akun resmi LINE, lalu masukkan kode ini di layar yang muncul untuk mendaftar.\nKode: ' + code + '\n(Berlaku sampai ' + (e.inviteExpires || '') + ')'
    : 'LINE勤怠の招待コードです。\n公式アカウントのメニューを開き、表示された画面にこのコードを入れて登録してください。\nコード：' + code + '\n（有効期限：' + (e.inviteExpires || '') + '）';
  const pre = line(message, 'pre');
  card.appendChild(pre);
  const copy = button('案内文をコピー', 'admin-btn');
  copy.addEventListener('click', async function () {
    try { await navigator.clipboard.writeText(message); copy.textContent = 'コピーしました'; }
    catch (err) { copy.textContent = 'コピーできませんでした。上の文を長押ししてコピーしてください'; }
  });
  card.appendChild(copy);
  card.appendChild(line('この文を本人にLINEで送ってください。', 'p')).className = 'muted small';
  box.appendChild(card);
  box.scrollIntoView({ behavior: 'smooth' });
}

function openEmployee(employeeId) {
  const e = employees.rows.find(function (x) { return x.employeeId === employeeId; });
  const box = document.getElementById('emp-detail');
  box.textContent = '';
  document.getElementById('emp-invite').textContent = '';
  if (!e) return;
  box.appendChild(line(e.name + ' さん（' + e.employeeId + '）', 'h2'));
  const msg = line('', 'p');
  msg.className = 'result';

  if (!e.active) {
    box.appendChild(line('退職しています（' + e.retiredAt + '）。勤怠と給与の記録は残っています。', 'p')).className = 'muted';
    box.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  // 名前・時給・言語
  const form = document.createElement('div');
  form.className = 'card';
  const name = field(form, '名前', 'text', e.name);
  const wage = field(form, '時給（円）', 'number', e.hourlyWage);
  form.appendChild(line('言語', 'label'));
  const lang = document.createElement('select');
  Object.keys(LANG_NAME).forEach(function (k) { const o = line(LANG_NAME[k], 'option'); o.value = k; lang.appendChild(o); });
  lang.value = e.language;
  form.appendChild(lang);
  form.appendChild(line('言語を変えると、本人の画面とメニューもその言語になります。', 'p')).className = 'muted small';
  form.appendChild(line('時給を変えると、まだ確定していない月の給与も新しい時給で計算されます。前の月の給与を先に確定してから変えてください。', 'p')).className = 'muted small';
  const save = button('名前・時給・言語を保存', 'admin-btn');
  save.addEventListener('click', function () {
    empAction(save, msg, 'adminEmployeeSave', { employeeId: e.employeeId, name: name.value.trim(), hourlyWage: wage.value.trim(), language: lang.value }, '保存しました。');
  });
  form.appendChild(save);
  box.appendChild(form);

  // いつもの控除・手当
  const pay = document.createElement('div');
  pay.className = 'card';
  pay.appendChild(line('いつもの控除・手当（毎月の給与計算に自動で入ります）', 'strong'));
  const inputs = {};
  PAY_ITEM_KEYS.forEach(function (k) { inputs[k] = field(pay, labelOf(k) + '（円）', 'text', e.payItems[k]); inputs[k].inputMode = 'numeric'; });
  const savePay = button('控除・手当を保存', 'admin-btn');
  savePay.addEventListener('click', function () {
    const values = {};
    PAY_ITEM_KEYS.forEach(function (k) { values[k] = inputs[k].value.trim(); });
    empAction(savePay, msg, 'adminPayItemsSave', { employeeId: e.employeeId, values: values }, '控除・手当を保存しました。今月から先の、まだ確定していない給与に入ります（前の月は変わりません）。');
  });
  pay.appendChild(savePay);
  box.appendChild(pay);

  // 招待コードの再発行（自分の分は出さない：働く人として登録し直すことになり、管理者がいなくなるため）
  const isMe = e.employeeId === employees.myEmployeeId;
  const inv = document.createElement('div');
  inv.className = 'card';
  inv.appendChild(line('招待コード', 'strong'));
  inv.appendChild(line(isMe ? 'あなた自身の分です。自分の招待コードは再発行できません。'
    : e.registered ? 'LINE登録済みです。LINEのアカウントを引き継がずに新しいスマホにしたときなどに、新しいコードを出せます。'
    : e.inviteCode ? '今のコード：' + e.inviteCode + '（有効期限 ' + e.inviteExpires + '）' : '使えるコードがありません。', 'p')).className = 'muted small';
  const reissue = button('招待コードを再発行', 'secondary');
  reissue.addEventListener('click', async function () {
    if (!confirm('新しい招待コードを出します。前のコードは使えなくなり、新しいコードで登録すると前のLINEも使えなくなります。よろしいですか？')) return;
    const res = await empAction(reissue, msg, 'adminInviteReissue', { employeeId: e.employeeId }, '新しい招待コードを出しました。');
    if (res && res.ok) showInvite(e.employeeId, res.inviteCode);
  });
  if (!isMe) inv.appendChild(reissue);
  box.appendChild(inv);

  // 退職
  if (e.employeeId !== employees.myEmployeeId) {
    const ret = document.createElement('div');
    ret.className = 'card';
    ret.appendChild(line('退職', 'strong'));
    ret.appendChild(line('退職にすると、本人はLINEの画面を使えなくなります。勤怠と給与の記録は消えません。', 'p')).className = 'muted small';
    const reason = document.createElement('textarea');
    reason.rows = 2;
    reason.maxLength = 200;
    reason.placeholder = '退職の理由（必須）例：帰国のため';
    ret.appendChild(reason);
    const retire = button('退職にする', 'danger');
    retire.addEventListener('click', function () {
      if (!reason.value.trim()) { msg.textContent = '退職の理由を入れてください。'; return; }
      if (!confirm(e.name + ' さんを退職にします。よろしいですか？')) return;
      empAction(retire, msg, 'adminRetire', { employeeId: e.employeeId, reason: reason.value.trim() }, '退職にしました。');
    });
    ret.appendChild(retire);
    box.appendChild(ret);
  }
  box.appendChild(msg);
  box.scrollIntoView({ behavior: 'smooth' });
}

// 従業員管理の保存ボタンの共通の動き。成功したら一覧を新しくして、開いていた人を開き直す
async function empAction(btn, msg, action, data, okText) {
  btn.disabled = true;
  try {
    const res = await api(action, data);
    if (!res.ok) { msg.textContent = errorText(res) + (res.item ? '（' + labelOf(res.item) + '）' : ''); return res; }
    employees.rows = res.rows;
    renderEmployees();
    openEmployee(data.employeeId);
    const newMsg = document.querySelector('#emp-detail .result');
    if (newMsg) newMsg.textContent = okText; else document.getElementById('emp-result').textContent = okText;
    return res;
  } catch (err) {
    msg.textContent = '通信に失敗しました。';
  } finally {
    btn.disabled = false;
  }
}

function field(parent, labelText, type, value) {
  parent.appendChild(line(labelText, 'label'));
  const inp = document.createElement('input');
  inp.type = type;
  inp.value = value === undefined || value === null ? '' : String(value);
  inp.setAttribute('aria-label', labelText);
  parent.appendChild(inp);
  return inp;
}

// ---- 設定（管理者） ----

const SETTING_LABEL = {
  pay_day: '支払日', round_unit: '勤務時間の区切り', clock_out_threshold: '退勤の境目', overtime_after_minutes: '残業になる時間',
  overtime_rate: '残業の割増', night_rate: '深夜の割増', minimum_wage: '最低賃金', default_break_minutes: '休憩の初期値',
};

async function loadSettings() {
  const result = document.getElementById('settings-result');
  result.textContent = '読み込み中…';
  const res = await api('adminSettings');
  if (!res.ok) { result.textContent = errorText(res); return; }
  result.textContent = '';
  fillSettings(res.values);
}

function fillSettings(v) {
  const set = function (id, value) { document.getElementById(id).value = value; };
  set('set-pay_day', v.pay_day);
  set('set-round_unit', String(v.round_unit));
  set('set-clock_out_threshold', v.clock_out_threshold);
  set('set-overtime_hours', Number(v.overtime_after_minutes) / 60);
  set('set-overtime_pct', Math.round(Number(v.overtime_rate) * 100));
  set('set-night_pct', Math.round(Number(v.night_rate) * 100));
  set('set-minimum_wage', v.minimum_wage);
  set('set-default_break_minutes', v.default_break_minutes);
}

document.getElementById('settings-form').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  const result = document.getElementById('settings-result');
  const get = function (id) { return document.getElementById(id).value.trim(); };
  const pct = function (id) { return get(id) === '' ? '' : String(Number(get(id)) / 100); };
  const btn = document.getElementById('settings-submit');
  btn.disabled = true;
  try {
    const res = await api('adminSettingsSave', { values: {
      pay_day: get('set-pay_day'),
      round_unit: get('set-round_unit'),
      clock_out_threshold: get('set-clock_out_threshold'),
      overtime_after_minutes: get('set-overtime_hours') === '' ? '' : String(Math.round(Number(get('set-overtime_hours')) * 60)),
      overtime_rate: pct('set-overtime_pct'),
      night_rate: pct('set-night_pct'),
      minimum_wage: get('set-minimum_wage'),
      default_break_minutes: get('set-default_break_minutes'),
    } });
    if (!res.ok) { result.textContent = errorText(res) + (res.item ? '（' + SETTING_LABEL[res.item] + '）' : ''); return; }
    fillSettings(res.values);
    result.textContent = res.changed ? '保存しました（' + res.changed + '項目）。' : '変わった項目はありませんでした。';
  } catch (err) {
    result.textContent = '通信に失敗しました。';
  } finally {
    btn.disabled = false;
  }
});

// ---- 給与明細（働く人） ----

async function loadPayslipList() {
  const status = document.getElementById('ps-status');
  const months = document.getElementById('ps-months');
  months.textContent = '';
  document.getElementById('ps-detail').textContent = '';
  status.textContent = t('loading');
  const res = await api('payslipList');
  if (!res.ok) { status.textContent = errorText(res); return; }
  status.textContent = res.months.length ? t('pick_month') : t('no_slip');
  res.months.forEach(function (m) {
    const b = button(monthLabel(m), 'secondary');
    b.addEventListener('click', function () { loadPayslip(m); });
    months.appendChild(b);
  });
}

async function loadPayslip(month) {
  const box = document.getElementById('ps-detail');
  box.textContent = t('loading');
  const res = await api('payslip', { month: month });
  box.textContent = '';
  if (!res.ok) { box.appendChild(line(errorText(res), 'p')); return; }
  box.appendChild(line(monthLabel(month) + '　' + res.slip.name, 'h2'));
  if (res.payDay) box.appendChild(line(t('pay_day', res.payDay), 'p')).className = 'muted';
  if (LANG === 'id') box.appendChild(line(t('slip_note'), 'p')).className = 'muted small';
  renderSlip(box, res.slip, false, LANG);
}

// 明細を紙と同じ並びで出す。editable なら手入力の項目を入力欄にする
// lang が 'id' なら項目名をインドネシア語にして、下に小さく日本語を添える（管理者の画面は日本語だけ）
function renderSlip(box, r, editable, lang) {
  const label = function (key, ja) {
    if (lang !== 'id' || !SLIP_ID[key]) return line(ja, 'th');
    const th = line(SLIP_ID[key], 'th');
    th.appendChild(line(ja, 'span')).className = 'ja-sub';
    return th;
  };
  SLIP_LAYOUT.forEach(function (section) {
    const head = line(lang === 'id' ? SLIP_ID[section[0]] + '　' : section[0], 'div');
    if (lang === 'id') head.appendChild(line(section[0], 'span')).className = 'ja-sub-inline';
    box.appendChild(head).className = 'slip-head';
    const table = document.createElement('table');
    table.className = 'slip';
    section[1].forEach(function (item) {
      const key = item[0];
      const tr = document.createElement('tr');
      tr.appendChild(label(key, item[1]));
      const td = document.createElement('td');
      if (editable && EDITABLE.indexOf(key) >= 0) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = item[2] === '円' ? (key === 'year_end_adjustment' ? 'text' : 'numeric') : 'decimal';
        inp.value = r[key] === '' ? '' : String(r[key]);
        inp.setAttribute('data-key', key);
        inp.setAttribute('aria-label', item[1]);
        td.appendChild(inp);
      } else {
        td.textContent = slipValue(r[key], item[2], lang);
      }
      tr.appendChild(td);
      table.appendChild(tr);
    });
    box.appendChild(table);
  });
  const totals = document.createElement('table');
  totals.className = 'slip totals';
  [['gross_total', '総支給額合計'], ['deduction_total', '控除総計'], ['net_pay', '差引支給額']].forEach(function (x) {
    const tr = document.createElement('tr');
    tr.appendChild(label(x[0], x[1]));
    tr.appendChild(line(slipValue(r[x[0]] === '' ? 0 : r[x[0]], '円', lang), 'td'));
    totals.appendChild(tr);
  });
  box.appendChild(totals);
}

function slipValue(v, unit, lang) {
  if (v === '' || v === null || v === undefined) return '';
  const id = lang === 'id';
  if (unit === '円') return id ? (Number(v) || 0).toLocaleString('ja-JP') + ' yen' : yen(v);
  if (unit === 'H') return hours(Number(v) / 60) + (id ? ' jam' : ' H');
  if (unit === 'h') return hours(Number(v)) + (id ? ' jam' : ' H');
  return v + ' ' + (id && unit === '日' ? 'hari' : unit);
}

function hours(h) { return String(Math.round(h * 100) / 100); }
function yen(v) { return (Number(v) || 0).toLocaleString('ja-JP') + '円'; }
function labelOf(key) {
  for (const section of SLIP_LAYOUT) for (const item of section[1]) if (item[0] === key) return item[1];
  return key;
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
function tag(status) { const el = document.createElement('span'); el.className = 'tag ' + status; el.textContent = statusText(status); return el; }
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

// 1日の記録を短い文に。管理者の画面は lang='ja' で呼ぶ
function describe(rec, lang) {
  const saved = LANG;
  if (lang) LANG = lang;
  const s = !rec ? t('no_record')
    : rec.clockIn + '〜' + (rec.clockOut || t('no_clock_out')) + (rec.breakMinutes === null ? '' : t('break_min', rec.breakMinutes));
  LANG = saved;
  return s;
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
      msg.textContent = ERROR_TEXT[res.error] + ' / ' + ERROR_TEXT_ID[res.error];
      return;
    }
    me = res;
    route(new URLSearchParams(location.search).get('page'));
  } catch (err) {
    msg.textContent = MSG.network[0] + ' / ' + MSG.network[1];
  } finally {
    button.disabled = false;
  }
});

// 目安として今の時刻を表示（記録に使うのはGASの時刻）
function tick() {
  const now = new Date();
  const text = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  document.querySelectorAll('.clock-now').forEach(function (el) { el.textContent = t('now', text); });
}
tick();
setInterval(tick, 10000);

// 分 →「8時間30分」／「8 jam 30 menit」
function duration(minutes, lang) {
  const id = (lang || LANG) === 'id';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (id) return h === 0 ? m + ' menit' : h + ' jam' + (m ? ' ' + m + ' menit' : '');
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
