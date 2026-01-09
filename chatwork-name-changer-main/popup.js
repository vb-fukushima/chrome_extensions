// DOM要素
const suffixInput = document.getElementById('suffix');
const minutesInput = document.getElementById('minutes');
const changeButton = document.getElementById('changeButton');
const restoreButton = document.getElementById('restoreButton');
const statusDiv = document.getElementById('status');
const previewDiv = document.getElementById('preview');

// URL保存UI
const chatworkUrlInput = document.getElementById('chatworkUrl');
const saveUrlButton = document.getElementById('saveUrlButton');
const saveCurrentUrlButton = document.getElementById('saveCurrentUrlButton');

// ----------------------------
// URL未保存時は実行できないようにする
// ----------------------------
function setUrlRequiredState(hasUrl) {
    // URLがない場合は「変更」も「復元」も動作させない
    changeButton.disabled = !hasUrl;

    // restoreButton は「変更中(isChanged)」かつ URLあり のときのみ有効化
    // （isChangedは updateUI 内で判定し、ここでは上書きしない）
    if (!hasUrl) {
        restoreButton.disabled = true;
    }

    // 案内表示
    if (!hasUrl) {
        statusDiv.textContent = '⚠️ 先に ChatworkページURL を保存してください（URL未保存のため実行できません）';
        statusDiv.className = 'warning';
        statusDiv.style.display = 'block';
    } else {
        // warning表示は消して、通常の updateUI が出す changed 表示に任せる
        if (statusDiv.className === 'warning') {
            statusDiv.style.display = 'none';
            statusDiv.textContent = '';
            statusDiv.className = '';
        }
    }
}

function normalizeAndValidateChatworkUrl(url) {
    const u = (url || '').trim();
    if (!u) return null;

    let parsed;
    try {
        parsed = new URL(u);
    } catch {
        throw new Error('URLの形式が正しくありません');
    }

    if (!parsed.hostname.includes('chatwork.com')) {
        throw new Error('chatwork.com のURLを入力してください');
    }

    // https 強制（Chatwork前提）
    if (parsed.protocol !== 'https:') {
        throw new Error('https のURLを入力してください');
    }

    return parsed.toString();
}

async function getSavedChatworkUrl() {
    const data = await chrome.storage.local.get(['chatworkUrl']);
    return data.chatworkUrl || null;
}

async function refreshUrlState() {
    const saved = await getSavedChatworkUrl();
    const hasUrl = !!saved;
    setUrlRequiredState(hasUrl);
    return saved;
}

// ----------------------------
// プレビュー関連
// ----------------------------
function updatePreview(baseName) {
    const suffix = suffixInput.value.trim();

    if (!baseName) {
        previewDiv.textContent = 'プレビュー';
        previewDiv.className = 'preview-text preview-empty';
        return;
    }

    if (suffix) {
        previewDiv.textContent = `${baseName}　${suffix}`;
        previewDiv.className = 'preview-text';
    } else {
        previewDiv.textContent = baseName;
        previewDiv.className = 'preview-text preview-empty';
    }
}

suffixInput.addEventListener('input', () => {
    chrome.storage.local.get(['originalName'], (data) => {
        if (data.originalName) updatePreview(data.originalName);
    });
});

// URL入力が変わったら保存状態を再判定（まだ保存してないなら無効のまま）
chatworkUrlInput.addEventListener('input', () => {
    // 入力しただけでは保存扱いにしない（= 必ず保存ボタンを押す）
    refreshUrlState();
});

// ----------------------------
// UI更新
// ----------------------------
function updateUI(data) {
    const hasUrl = !!data.chatworkUrl;

    // URL未保存なら「変更」も「復元」も不可
    if (!hasUrl) {
        setUrlRequiredState(false);
        return;
    }

    // URLがあるなら変更ボタンは有効
    changeButton.disabled = false;

    if (data.isChanged) {
        statusDiv.textContent = `🔄 ${data.scheduledTime}に自動復帰`;
        statusDiv.className = 'changed';
        statusDiv.style.display = 'block';
        restoreButton.disabled = false;
    } else {
        // 変更中でないなら「今すぐ戻す」は無効
        restoreButton.disabled = true;
        // statusは非表示
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
        statusDiv.className = '';
    }
}

// ----------------------------
// content script に安全にメッセージ送信
// ----------------------------
async function sendMessageSafely(tabId, message) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                console.log('Content script not loaded, injecting...');
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                }).then(() => {
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

// 毎回「保存URLを開いてから」処理する
async function openOrFocusChatworkTab() {
    const savedUrl = await getSavedChatworkUrl();
    if (!savedUrl) {
        throw new Error('ChatworkページURLが未保存です。先にURLを保存してください。');
    }

    const tabs = await chrome.tabs.query({ url: 'https://www.chatwork.com/*' });

    if (tabs.length > 0) {
        const tab = tabs[0];

        if (tab.url !== savedUrl) {
            await chrome.tabs.update(tab.id, { url: savedUrl, active: true });
            await ensureTabLoaded(tab.id);
        } else {
            await chrome.tabs.update(tab.id, { active: true });
            await ensureTabLoaded(tab.id);
        }
        return tab;
    }

    const tab = await chrome.tabs.create({ url: savedUrl, active: true });
    await ensureTabLoaded(tab.id);
    return tab;
}

// ----------------------------
// URL保存ボタン（手入力保存）
// ----------------------------
saveUrlButton.addEventListener('click', async () => {
    try {
        const normalized = normalizeAndValidateChatworkUrl(chatworkUrlInput.value);
        if (!normalized) {
            alert('ChatworkページURLを入力してください');
            return;
        }

        await chrome.storage.local.set({ chatworkUrl: normalized });
        chatworkUrlInput.value = normalized;

        await refreshUrlState();
        alert('ChatworkページURLを保存しました');
    } catch (e) {
        alert('保存に失敗しました: ' + e.message);
    }
});

// 今開いているChatworkのURLを保存
saveCurrentUrlButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url || !tab.url.includes('chatwork.com')) {
        alert('Chatworkのページを開いた状態で押してください');
        return;
    }

    try {
        const normalized = normalizeAndValidateChatworkUrl(tab.url);
        await chrome.storage.local.set({ chatworkUrl: normalized });
        chatworkUrlInput.value = normalized;

        await refreshUrlState();
        alert('ChatworkページURLを保存しました');
    } catch (e) {
        alert('保存に失敗しました: ' + e.message);
    }
});

// ----------------------------
// 初期化
// ----------------------------
chrome.storage.local.get(['isChanged', 'scheduledTime', 'suffix', 'originalName', 'chatworkUrl'], async (data) => {
    // suffix復元
    if (data.suffix) suffixInput.value = data.suffix;

    // URL復元
    if (data.chatworkUrl) chatworkUrlInput.value = data.chatworkUrl;

    // URL状態に応じてボタン制御（最優先）
    updateUI(data);

    // プレビュー（URL未保存なら無理に開かない）
    if (data.originalName) {
        updatePreview(data.originalName);
    } else {
        // URLが保存済みなら、保存URLを開いて取得もできるが
        // ここでは「アクティブがChatworkなら取る」程度に留める（勝手にタブを開かない）
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.url?.includes('chatwork.com')) {
            const res = await sendMessageSafely(activeTab.id, { action: 'getCurrentName' });
            if (res && res.success && res.name) updatePreview(res.name);
        }
    }

    // URLが保存されていないなら警告表示を確実に出す
    await refreshUrlState();
});

// ----------------------------
// 実行ボタン
// ----------------------------
changeButton.addEventListener('click', async () => {
    // 念のため二重ガード（URL未保存なら何もしない）
    const savedUrl = await getSavedChatworkUrl();
    if (!savedUrl) {
        await refreshUrlState();
        return;
    }

    const suffix = suffixInput.value.trim();
    const minutes = parseInt(minutesInput.value);

    if (!suffix) {
        alert('追加する文言を入力してください');
        return;
    }

    if (minutes < 1 || minutes > 480) {
        alert('時間は1〜480分の範囲で指定してください');
        return;
    }

    await chrome.storage.local.set({ suffix });

    let tab;
    try {
        tab = await openOrFocusChatworkTab();
    } catch (e) {
        alert(e.message);
        return;
    }

    const response = await sendMessageSafely(tab.id, { action: 'changeName', suffix });

    if (response && response.success) {
        const scheduledTime = new Date(Date.now() + minutes * 60 * 1000);
        const timeString = scheduledTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        chrome.alarms.create('restoreName', { delayInMinutes: minutes });

        await chrome.storage.local.set({
            isChanged: true,
            scheduledTime: timeString,
            suffix
        });

        updateUI({
            isChanged: true,
            scheduledTime: timeString,
            chatworkUrl: savedUrl
        });

        alert(`名前を変更しました。${timeString}に自動復帰します。`);
    } else {
        alert('名前の変更に失敗しました: ' + (response?.error || '不明なエラー'));
    }
});

restoreButton.addEventListener('click', async () => {
    // 念のため二重ガード（URL未保存なら何もしない）
    const savedUrl = await getSavedChatworkUrl();
    if (!savedUrl) {
        await refreshUrlState();
        return;
    }

    let tab;
    try {
        tab = await openOrFocusChatworkTab();
    } catch (e) {
        alert(e.message);
        return;
    }

    const response = await sendMessageSafely(tab.id, { action: 'restoreName' });

    if (response && response.success) {
        chrome.alarms.clear('restoreName');

        await chrome.storage.local.set({
            isChanged: false,
            scheduledTime: null
        });

        updateUI({ isChanged: false, chatworkUrl: savedUrl });

        alert('名前を元に戻しました。');
    } else {
        alert('名前の復元に失敗しました: ' + (response?.error || '不明なエラー'));
    }
});
