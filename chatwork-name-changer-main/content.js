/**
 * Chatwork Name Changer - Content Script
 */

// ページコンテキストへ認証情報取得用のスクリプトを注入
function injectPageScript() {
  if (document.getElementById('chatwork-name-changer-injected')) return;
  const marker = document.createElement('div');
  marker.id = 'chatwork-name-changer-injected';
  marker.style.display = 'none';
  document.body.appendChild(marker);

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-script.js');
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

injectPageScript();

// メッセージハンドラー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCurrentName') {
    getCurrentDisplayName()
      .then(name => sendResponse({ success: true, name: name }))
      .catch(error => {
        console.error('Name acquisition error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === 'updateFullName') {
    waitForChatworkReady()
      .then((credentials) => changeNameAPI(request.fullName, credentials))
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * 現在の表示名を取得する
 */
async function getCurrentDisplayName() {
  // 1. data-testid 構造から取得（最新のReact版で最も確実）
  const menuButton = document.querySelector('[data-testid="global-header_account-menu_menu-button"]');
  if (menuButton) {
    const children = menuButton.children;
    for (let child of children) {
      if (child.tagName === 'DIV' && child.textContent.trim().length > 0) {
        const name = child.textContent.trim();
        if (name && !name.includes('icon_')) {
          return name;
        }
      }
    }
  }

  // 2. フォールバック: プロフィールボタンの aria-label
  const profileButton = document.querySelector('button[aria-label*="プロフィール"]');
  if (profileButton) {
    const label = profileButton.getAttribute('aria-label');
    const match = label.match(/プロフィール: (.*)/);
    if (match && match[1]) return match[1].trim();
  }

  // 3. フォールバック: マイチャット要素
  const myChat = document.querySelector('#my-chat-sidebar-item .roomName');
  if (myChat && myChat.textContent) {
    return myChat.textContent.trim();
  }

  throw new Error('名前の取得に失敗しました。Chatworkのページが正しく表示されているか確認してください。');
}

/**
 * ページコンテキスト（window）から認証情報を取得する
 */
function getAccessCredentials() {
  return new Promise((resolve) => {
    const handleMessage = () => {
      const element = document.getElementById('chatwork-credentials');
      if (element) {
        const data = {
          accessToken: element.dataset.accessToken,
          myId: element.dataset.myId
        };
        element.remove();
        resolve(data);
      } else {
        resolve({ accessToken: null, myId: null });
      }
    };

    const req = document.createElement('div');
    req.id = 'chatwork-credentials-request';
    document.body.appendChild(req);
    setTimeout(handleMessage, 150);
  });
}

/**
 * 名前変更APIを実行
 */
async function changeNameAPI(newName, credentials) {
  const { accessToken, myId } = credentials;
  if (!accessToken || !myId) throw new Error('認証情報を取得できませんでした。');

  const payload = { name: newName, _t: accessToken };
  const formData = new URLSearchParams();
  formData.append('pdata', JSON.stringify(payload));

  const response = await fetch(
    `https://www.chatwork.com/gateway/send_profile_setting.php?myid=${myId}&_v=1.80a&_av=5&ln=ja`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    }
  );

  return await response.json();
}

/**
 * API実行の準備が整うまで待機
 */
function waitForChatworkReady(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      const creds = await getAccessCredentials();
      if (creds.accessToken && creds.myId) resolve(creds);
      else if (Date.now() - start > timeout) reject(new Error('タイムアウト：Chatworkの準備が整いませんでした。'));
      else setTimeout(check, 500);
    };
    check();
  });
}
