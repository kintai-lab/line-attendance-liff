/**
 * 働く人の画面の言語（日本語 ja ／ インドネシア語 id）
 *
 * - 言語はサーバー（利用者・従業員シート）が決める。me.language を受け取って LANG に入れる
 * - HTMLの data-i18n の文字は、日本語ならHTMLに書いたまま、インドネシア語なら下の I18N_ID に置き換える
 * - 画面の動きの中で出す文は MSG に [日本語, インドネシア語] で並べる
 * - 管理者の画面は日本語のまま（ここでは扱わない）
 * - 言語を増やすときは、それぞれの表に1つずつ足す
 *
 * ⚠️ インドネシア語の訳は本番の前に、インドネシア語を話す人に確認してもらう
 */

let LANG = 'ja';

// HTML の data-i18n の文字（インドネシア語）
const I18N_ID = {
  badge_worker: 'Pekerja',
  menu_clock_in: 'Masuk kerja',
  menu_clock_out: 'Pulang kerja',
  menu_history: 'Riwayat',
  menu_fix: 'Ajukan koreksi',
  menu_payslip: 'Slip gaji',
  menu_language: 'Bahasa',
  privacy: 'Kebijakan privasi',
  back_menu: 'Kembali ke menu',
  lang_note: 'Menu (di bawah layar obrolan) akan berganti saat dibuka lagi.',
  clock_in_btn: 'Catat jam masuk',
  clock_out_btn: 'Catat jam pulang',
  break_label: 'Waktu istirahat (menit)',
  prev_month: 'Bulan lalu',
  next_month: 'Bulan depan',
  col_date: 'Tanggal',
  col_in: 'Masuk',
  col_out: 'Pulang',
  col_break: 'Istirahat',
  col_work: 'Kerja',
  history_empty: 'Tidak ada catatan untuk bulan ini.',
  fix_date: 'Tanggal yang ingin dikoreksi',
  fix_break: 'Istirahat (menit)',
  fix_reason: 'Alasan (wajib)',
  fix_reason_ph: 'Contoh: Lupa menekan tombol pulang',
  fix_note: 'Jika jam pulang lebih awal dari jam masuk, dianggap pulang keesokan harinya.',
  fix_submit: 'Kirim pengajuan',
  fix_mine: 'Pengajuan saya',
  fix_empty: 'Belum ada pengajuan.',
};

// 画面の動きの中で出す文：[日本語, インドネシア語]。{0} {1} に値が入る
const MSG = {
  greeting: ['{0} さん', 'Halo, {0}'],
  welcome: ['ようこそ', 'Selamat datang'],
  now: ['今 {0}', 'Sekarang {0}'],
  checking: ['確認中…', 'Memeriksa…'],
  loading: ['読み込み中…', 'Memuat…'],
  network: ['通信に失敗しました。電波のよい所でもう一度押してください。', 'Gagal terhubung. Silakan coba lagi di tempat dengan sinyal yang baik.'],
  already_in: ['すでに出勤しています（{0}）', 'Anda sudah tercatat masuk ({0})'],
  already_done: ['今日はすでに退勤しています（{0}）', 'Anda sudah tercatat pulang hari ini ({0})'],
  already_out: ['すでに退勤しています（{0}）', 'Anda sudah tercatat pulang ({0})'],
  ask_in: ['出勤しますか？', 'Catat jam masuk sekarang?'],
  done_in: ['{0} に出勤しました', 'Tercatat masuk pukul {0}'],
  clocked_in_at: ['出勤：{0}', 'Masuk: {0}'],
  break_number: ['休憩時間を分（数字）で入れてください。', 'Masukkan waktu istirahat dalam menit (angka).'],
  done_out: ['{0} に退勤しました。今日の勤務：{1}', 'Tercatat pulang pukul {0}. Jam kerja hari ini: {1}'],
  break_short: ['出勤してから {0}しかたっていないため、休憩は 0〜{1} 分で入れてください。', 'Baru {0} sejak masuk, jadi waktu istirahat harus 0–{1} menit.'],
  break_max: ['休憩時間は 0〜600 分で入れてください。', 'Waktu istirahat harus 0–600 menit.'],
  break_range: ['休憩は 0〜{0} 分で入れてください。', 'Waktu istirahat harus 0–{0} menit.'],
  total: ['合計：{0}（{1}日）', 'Total: {0} ({1} hari)'],
  no_clock_out: ['退勤なし', 'Belum pulang'],
  current: ['今の記録：{0}', 'Catatan saat ini: {0}'],
  no_record: ['記録なし', 'Tidak ada catatan'],
  break_min: [' 休憩{0}分', ', istirahat {0} menit'],
  locked_fix: ['（この月は給与が確定しているため、申請できません）', ' (Gaji bulan ini sudah difinalisasi, jadi tidak bisa diajukan)'],
  pending_day: ['（この日は申請中です）', ' (Tanggal ini sedang diajukan)'],
  fix_sent: ['申請しました。管理者の承認を待ってください。', 'Pengajuan terkirim. Silakan tunggu persetujuan atasan.'],
  reject_reason: ['却下の理由：{0}', 'Alasan ditolak: {0}'],
  pick_month: ['見たい月を選んでください。', 'Pilih bulan.'],
  no_slip: ['まだ確定した給与明細はありません。', 'Belum ada slip gaji yang sudah final.'],
  pay_day: ['支払日：{0}日', 'Tanggal pembayaran: tanggal {0}'],
  lang_now: ['今の言語：日本語', 'Bahasa saat ini: Bahasa Indonesia'],
  lang_changed: ['言語を日本語にしました。', 'Bahasa telah diubah ke Bahasa Indonesia.'],
  error_any: ['エラーが起きました（{0}）', 'Terjadi kesalahan ({0})'],
  status_pending: ['申請中', 'Menunggu'],
  status_approved: ['承認済み', 'Disetujui'],
  status_rejected: ['却下', 'Ditolak'],
  slip_note: ['', 'Nama item juga ditulis dalam bahasa Jepang (huruf kecil).'],
};

// エラーの文（インドネシア語）。日本語は app.js の ERROR_TEXT
const ERROR_TEXT_ID = {
  invalid_token: 'Login tidak dapat dikonfirmasi. Tutup layar ini lalu buka kembali.',
  expired_token: 'Masa berlaku login sudah habis. Tutup layar ini lalu buka kembali.',
  no_token: 'Informasi login LINE tidak didapat. Buka dari dalam aplikasi LINE.',
  server_not_configured: 'Pengaturan server belum selesai. Hubungi atasan.',
  invalid_code: 'Kode undangan salah atau sudah kedaluwarsa.',
  code_used: 'Kode undangan ini sudah dipakai.',
  no_employee: 'Data karyawan belum terdaftar. Hubungi atasan.',
  not_registered: 'Belum terdaftar. Buka kembali layar ini.',
  inactive_user: 'Akun ini tidak dapat digunakan saat ini. Hubungi atasan.',
  not_clocked_in: 'Tekan "Masuk kerja" terlebih dahulu.',
  invalid_break: 'Waktu istirahat tidak benar.',
  invalid_date: 'Tanggal yang bisa dipilih: hari ini sampai 31 hari yang lalu.',
  reason_required: 'Masukkan alasan.',
  reason_too_long: 'Alasan maksimal 200 karakter.',
  invalid_time: 'Jam masuk/pulang tidak benar (maksimal 24 jam dari jam masuk).',
  future_time: 'Tidak bisa memasukkan waktu yang belum terjadi.',
  already_pending: 'Tanggal ini sudah diajukan. Silakan tunggu hasilnya.',
  month_locked: 'Gaji bulan ini sudah difinalisasi, jadi tidak bisa diubah.',
  not_found: 'Data tidak ditemukan. Buka kembali layar ini.',
};

// 給与明細の項目名・区分名（インドネシア語）。日本語は app.js の SLIP_LAYOUT
const SLIP_ID = {
  '勤怠': 'Kehadiran', '控除': 'Potongan', '支給': 'Pendapatan',
  work_days: 'Hari kerja', attend_days: 'Hari masuk', attend_minutes: 'Jam kerja',
  paid_leave_days: 'Cuti berbayar', absence_days: 'Hari absen', hourly_wage: 'Upah per jam',
  late_early_hours: 'Terlambat / pulang cepat', special_leave_days: 'Cuti khusus', paid_leave_left: 'Sisa cuti berbayar',
  overtime_minutes: 'Jam lembur biasa', night_overtime_minutes: 'Jam lembur malam', holiday_minutes: 'Jam kerja hari libur',
  overtime_yen: 'Uang lembur',
  health_insurance: 'Asuransi kesehatan', care_insurance: 'Asuransi perawatan', pension: 'Asuransi pensiun',
  pension_fund: 'Dana pensiun', employment_insurance: 'Asuransi ketenagakerjaan', income_tax: 'Pajak penghasilan',
  resident_tax: 'Pajak penduduk', dorm_fee: 'Biaya asrama', utilities: 'Listrik, gas, Wi-Fi', toilet_cleaning: 'Kebersihan toilet',
  base_pay: 'Gaji pokok', position_allowance: 'Tunjangan jabatan', qualification_allowance: 'Tunjangan sertifikat',
  housing_allowance: 'Tunjangan tempat tinggal', family_allowance: 'Tunjangan keluarga', night_shift_allowance: 'Tunjangan shift malam',
  night_allowance: 'Tunjangan kerja malam', overtime_pay: 'Lembur biasa', night_overtime_pay: 'Lembur malam',
  year_end_adjustment: 'Penyesuaian pajak akhir tahun',
  gross_total: 'Total pendapatan', deduction_total: 'Total potongan', net_pay: 'Gaji bersih',
};

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function t(key) {
  const pair = MSG[key];
  let s = pair ? (LANG === 'id' ? pair[1] : pair[0]) : key;
  for (let i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(String(arguments[i]));
  return s;
}

// HTML の data-i18n の文字を、今の言語に合わせて書き換える（日本語の文字は最初に覚えておく）
function applyLang(lang) {
  LANG = lang === 'id' ? 'id' : 'ja';
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    if (el.dataset.ja === undefined) el.dataset.ja = el.textContent;
    const key = el.getAttribute('data-i18n');
    el.textContent = LANG === 'id' && I18N_ID[key] ? I18N_ID[key] : el.dataset.ja;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
    if (el.dataset.jaPh === undefined) el.dataset.jaPh = el.placeholder;
    const key = el.getAttribute('data-i18n-ph');
    el.placeholder = LANG === 'id' && I18N_ID[key] ? I18N_ID[key] : el.dataset.jaPh;
  });
}

// 「2026-11」→「2026年11月」／「November 2026」
function monthLabel(ym) {
  const p = ym.split('-');
  return LANG === 'id' ? MONTHS_ID[Number(p[1]) - 1] + ' ' + p[0] : p[0] + '年' + Number(p[1]) + '月';
}
