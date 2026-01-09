// アラームリスナー
chrome.alarms.onAlarm.addListener((alarm) => {
    console.log('アラームが発火しました:', alarm.name);
    if (alarm.name === 'restoreName') {
        restoreNameByOpeningSavedUrl();
    }
});

// content scriptに安全にメッセージを送信
async function sendMessageSafely(tabId, message) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                // content scriptが読み込まれていない場合は注入を試みる
                console.log('Content script not loaded, injecting...');
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                }).then(() => {
                    // 少し待ってから再送信
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, message, (retryResponse) => {
                            if (chrome.runtime.lastError) {
                                resolve({ success: false, error: chrome.runtime.lastError.message });
                            } else {
                                resolve(retryResponse);
                            }
                        });
                    }, 100);
                }).catch((error) => {
                    resolve({ success: false, error: error.message });
                });
            } else {
                resolve(response);
            }
        });
    });
}

async function getSavedChatworkUrl() {
    const data = await chrome.storage.local.get(['chatworkUrl']);
    return data.chatworkUrl || null;
}

async function ensureTabLoaded(tabId, timeoutMs = 15000) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;

    await new Promise((resolve, reject) => {
        const start = Date.now();

        const listener = (updatedTabId, info) => {
            if (updatedTabId === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);

        const timer = setInterval(() => {
            if (Date.now() - start > timeoutMs) {
                clearInterval(timer);
                chrome.tabs.onUpdated.removeListener(listener);
                reject(new Error('Chatworkページの読み込みがタイムアウトしました'));
            }
        }, 250);
    });
}

// ★変更：自動復帰は「保存URLを開いてから」実行する
async function restoreNameByOpeningSavedUrl() {
    console.log('自動復元処理を開始します');

    const savedUrl = await getSavedChatworkUrl();
    if (!savedUrl) {
        console.log('chatworkUrl未保存のため復元できません');
        return;
    }

    // 既存のChatworkタブがあればそれを使う
    const tabs = await chrome.tabs.query({ url: 'https://www.chatwork.com/*' });
    let tab;

    try {
        if (tabs.length > 0) {
            tab = tabs[0];

            // 保存URLと違うなら保存URLへ遷移
            if (tab.url !== savedUrl) {
                await chrome.tabs.update(tab.id, { url: savedUrl, active: false });
                await ensureTabLoaded(tab.id);
            } else {
                await ensureTabLoaded(tab.id);
            }
        } else {
            // 無ければ新規で開く（アクティブにはしない）
            tab = await chrome.tabs.create({ url: savedUrl, active: false });
            await ensureTabLoaded(tab.id);
        }
    } catch (e) {
        console.error('Chatworkページのオープン/ロードに失敗:', e.message);
        return;
    }

    const response = await sendMessageSafely(tab.id, { action: 'restoreName' });

    if (response && response.success) {
        console.log('自動復元が完了しました');

        // 状態をクリア
        chrome.storage.local.set({
            isChanged: false,
            scheduledTime: null
        });
    } else {
        console.error('自動復元に失敗しました:', response?.error);
    }
}
