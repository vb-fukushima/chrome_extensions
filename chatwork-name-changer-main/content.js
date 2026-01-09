// Content script読み込み確認
console.log('🔧 Chatwork Name Changer content script loaded');

// ページコンテキストで実行するスクリプトをファイルとして注入
function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-script.js');
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

// ページコンテキストからデータを取得する関数
function getAccessCredentials() {
  return new Promise((resolve) => {
    // DOM要素経由でデータを受け取る
    const handleMessage = () => {
      const element = document.getElementById('chatwork-credentials');
      if (element && element.dataset.accessToken && element.dataset.myId) {
        const data = {
          accessToken: element.dataset.accessToken,
          myId: parseInt(element.dataset.myId)
        };
        element.remove();
        resolve(data);
      } else {
        resolve({ accessToken: null, myId: null });
      }
    };
    
    // データ要求を送信
    const requestElement = document.createElement('div');
    requestElement.id = 'chatwork-credentials-request';
    document.body.appendChild(requestElement);
    
    // 少し待ってからデータを取得
    setTimeout(handleMessage, 50);
  });
}

// ページスクリプトを注入（初回のみ）
if (!document.getElementById('chatwork-name-changer-injected')) {
  const marker = document.createElement('div');
  marker.id = 'chatwork-name-changer-injected';
  marker.style.display = 'none';
  document.body.appendChild(marker);
  injectPageScript();
}

// Chatworkの準備が完了するまで待つ
function waitForChatworkReady(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let attemptCount = 0;
    
    console.log('Chatwork準備確認を開始...');
    
    const checkReady = async () => {
      attemptCount++;
      
      // ページコンテキストから認証情報を取得
      const credentials = await getAccessCredentials();
      const hasToken = !!credentials.accessToken;
      const hasId = !!credentials.myId;
      
      if (attemptCount % 10 === 0) {
        console.log(`確認中... (${attemptCount}回目)`, {
          ACCESS_TOKEN: hasToken ? '存在' : '未取得',
          MYID: hasId ? credentials.myId : '未取得',
          経過時間: `${Date.now() - startTime}ms`
        });
      }
      
      if (hasToken && hasId) {
        console.log('✅ Chatwork準備完了:', { 
          ACCESS_TOKEN: credentials.accessToken.substring(0, 20) + '...', 
          MYID: credentials.myId,
          確認回数: attemptCount
        });
        resolve(credentials);
      } else if (Date.now() - startTime > timeout) {
        console.error('❌ タイムアウト:', {
          ACCESS_TOKEN: hasToken ? '取得済み' : '未取得',
          MYID: hasId ? credentials.myId : '未取得',
          経過時間: `${Date.now() - startTime}ms`,
          確認回数: attemptCount,
          URL: location.href
        });
        reject(new Error('Chatworkの読み込みがタイムアウトしました。ページを再読み込みしてください。'));
      } else {
        setTimeout(checkReady, 100);
      }
    };
    
    checkReady();
  });
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'changeName') {
    // まずChatworkの準備を待つ（認証情報を取得）
    waitForChatworkReady()
      .then((credentials) => changeName(request.suffix, credentials))
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 非同期レスポンスのため
  } else if (request.action === 'restoreName') {
    waitForChatworkReady()
      .then((credentials) => restoreName(credentials))
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'getCurrentName') {
    try {
      const currentName = getCurrentDisplayName();
      sendResponse({ success: true, name: currentName });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
});

// 現在の表示名を取得
function getCurrentDisplayName() {
  const nameElement = document.querySelector('.sc-kxZkPw.eDPshW');
  if (!nameElement) {
    throw new Error('名前要素が見つかりません');
  }
  return nameElement.textContent.trim();
}

// 名前変更API呼び出し
async function changeNameAPI(newName, credentials) {
  const accessToken = credentials.accessToken;
  const myId = credentials.myId;
  
  if (!accessToken || !myId) {
    console.error('認証情報が取得できません:', credentials);
    throw new Error('認証情報が取得できません。ページを再読み込みしてください。');
  }
  
  console.log('API呼び出し開始:', { newName, myId });
  
  const payload = {
    name: newName,
    _t: accessToken
  };
  
  const formData = new URLSearchParams();
  formData.append('pdata', JSON.stringify(payload));
  
  const response = await fetch(
    `https://www.chatwork.com/gateway/send_profile_setting.php?myid=${myId}&_v=1.80a&_av=5&ln=ja`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    }
  );
  
  const data = await response.json();
  console.log('API応答:', data);
  
  if (!data.status || !data.status.success) {
    throw new Error(data.status?.message || 'API呼び出しに失敗しました');
  }
  
  return data;
}

// 名前を変更
async function changeName(suffix, credentials) {
  try {
    // 現在の表示名を取得
    const currentName = getCurrentDisplayName();
    
    // 元の名前が保存されていない場合のみ保存
    const stored = await chrome.storage.local.get(['originalName']);
    if (!stored.originalName) {
      await chrome.storage.local.set({ originalName: currentName });
      console.log('元の名前を保存しました:', currentName);
    }
    
    // 新しい名前を作成（元の名前 + suffix）
    const originalName = stored.originalName || currentName;
    const newName = `${originalName}　${suffix}`;
    
    // API呼び出しで名前変更
    await changeNameAPI(newName, credentials);
    
    console.log('名前を変更しました:', newName);
    return { success: true };
  } catch (error) {
    console.error('名前変更エラー:', error);
    return { success: false, error: error.message };
  }
}

// 名前を復元
async function restoreName(credentials) {
  try {
    // 保存された元の名前を取得
    const stored = await chrome.storage.local.get(['originalName']);
    if (!stored.originalName) {
      throw new Error('元の名前が保存されていません');
    }
    
    // API呼び出しで名前を元に戻す
    await changeNameAPI(stored.originalName, credentials);
    
    console.log('名前を復元しました:', stored.originalName);
    return { success: true };
  } catch (error) {
    console.error('名前復元エラー:', error);
    return { success: false, error: error.message };
  }
}
