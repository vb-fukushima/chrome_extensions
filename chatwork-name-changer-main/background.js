// アラームリスナー
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('アラームが発火しました:', alarm.name);

    // 期限切れのステータスを明示的にクリアする
    if (alarm.name === 'restoreLunch') {
        await chrome.storage.local.set({ lunchState: null });
    } else if (alarm.name === 'restoreVacation') {
        await chrome.storage.local.set({ vacationState: null });
    }

    // 全ての状態をチェックして名前を同期する
    await syncNameToCurrentState();
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

// 現在の全てのストレージ状態（ランチ・有給）を確認し、Chatworkの名前を同期する
async function syncNameToCurrentState() {
    console.log('名前の同期処理を開始します');

    const data = await chrome.storage.local.get(['originalName', 'lunchState', 'vacationState', 'chatworkUrl']);
    const savedUrl = data.chatworkUrl;

    if (!savedUrl || !data.originalName) {
        console.log('同期に必要な情報が足りません');
        return;
    }

    const now = Date.now();
    let nameParts = [data.originalName];

    // 有給チェック
    let isVacationActive = false;
    if (data.vacationState && data.vacationState.until > now) {
        nameParts.push(data.vacationState.suffix);
        isVacationActive = true;
    }

    // ランチチェック
    let isLunchActive = false;
    if (data.lunchState && data.lunchState.until > now) {
        nameParts.push(data.lunchState.suffix);
        isLunchActive = true;
    }

    const fullName = nameParts.join('　');
    console.log('構築した名前:', fullName);

    // Chatworkタブの準備
    const tabs = await chrome.tabs.query({ url: 'https://www.chatwork.com/*' });
    let tab;

    try {
        if (tabs.length > 0) {
            tab = tabs[0];
            if (tab.url !== savedUrl) {
                await chrome.tabs.update(tab.id, { url: savedUrl, active: false });
                await ensureTabLoaded(tab.id);
            }
        } else {
            tab = await chrome.tabs.create({ url: savedUrl, active: false });
            await ensureTabLoaded(tab.id);
        }
    } catch (e) {
        console.error('タブ操作エラー:', e.message);
        return;
    }

    // メッセージ送信
    const response = await sendMessageSafely(tab.id, { action: 'updateFullName', fullName });

    if (response && response.success) {
        console.log('名前の同期が完了しました');
        // UI更新用に状態を保存（popupが読み込む用）
        await chrome.storage.local.set({
            isChanged: isVacationActive || isLunchActive,
            // scheduledTime などは各タイマーが個別管理するのでここでは無理に更新しない
        });
    } else {
        console.error('同期エラー:', response?.error);
    }
}
