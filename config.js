// 公開されても困らない値だけを置く（秘密のキーは絶対に書かない）
// - LIFF_ID：手順9で登録したあとに入れる
// - GAS_URL：GAS Webアプリの公開URL（中で必ずIDトークンを検証するので、知られても他人のふりはできない）
const CONFIG = {
  LIFF_ID: '',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxaKZ3G0Jtu07FvJQ27JDkkhnu6moWZzVcQ4jNrB6JRqLIMEYJZmHURHWGxd7wW20YFzQ/exec',
};
