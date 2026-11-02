/**
 * LIFF画面の動き
 *
 * 1. LIFFを起動して、LINEが発行したIDトークン（本人の証明書）を受け取る
 * 2. IDトークンをGASに送り、「自分は誰で、どの役割か」をサーバーに判定してもらう
 * 3. サーバーが返した役割に合わせて画面を切り替える
 *
 * 画面側では役割を決めない。ここでの表示の出し分けは見た目だけで、本当の権限チェックはGAS側で行う。
 */

const ERROR_TEXT = {
  invalid_token: 'ログインの確認ができませんでした。画面を閉じて、もう一度開いてください。',
  expired_token: 'ログインの有効期限が切れました。画面を閉じて、もう一度開いてください。',
  no_token: 'LINEのログイン情報が取れませんでした。LINEアプリの中から開いてください。',
  server_not_configured: 'サーバーの設定が終わっていません。管理者に連絡してください。',
  invalid_code: '招待コードが違うか、期限が切れています。',
  code_used: 'この招待コードはすでに使われています。',
};

main();

async function main() {
  show('loading');
  try {
    if (!CONFIG.LIFF_ID) throw new Error('LIFF IDが未設定です（手順9のあとで入ります）');
    await liff.init({ liffId: CONFIG.LIFF_ID });

    // LINEアプリの外（パソコンのブラウザなど）で開いたときは、LINEログインへ
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    render(await api('me'));
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

function render(res) {
  if (!res.ok) {
    showError(ERROR_TEXT[res.error] || 'エラーが起きました（' + res.error + '）');
    return;
  }
  if (!res.registered) {
    show('register');
    return;
  }
  const view = res.role === 'admin' ? 'admin' : 'worker';
  // サーバーから来た文字は textContent で入れる（HTMLとして解釈させない）
  const who = res.name ? res.name + ' さん' : 'ようこそ';
  document.querySelector('#view-' + view + ' .greeting').textContent =
    who + (res.farmName ? '（' + res.farmName + '）' : '');
  show(view);
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
    render(res);
  } catch (err) {
    msg.textContent = '通信に失敗しました。電波のよい所でもう一度試してください。';
  } finally {
    button.disabled = false;
  }
});

function show(name) {
  document.querySelectorAll('.view').forEach(function (el) {
    el.hidden = el.id !== 'view-' + name;
  });
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  show('error');
}
