const lunchSuffixInput = document.getElementById('lunchSuffix');
const lunchDurationInput = document.getElementById('lunchDuration');
const lunchButton = document.getElementById('lunchButton');
const stopLunchButton = document.getElementById('stopLunchButton');
const vacationSuffixInput = document.getElementById('vacationSuffix');
const vacationUntilInput = document.getElementById('vacationUntil');
const vacationButton = document.getElementById('vacationButton');
const stopVacationButton = document.getElementById('stopVacationButton');
const restoreButton = document.getElementById('restoreButton');
const statusDiv = document.getElementById('status');
const previewDiv = document.getElementById('preview');
const openContainer = document.getElementById('openContainer');
const settingsContainer = document.getElementById('settingsContainer');
const openChatworkButton = document.getElementById('openChatworkButton');
const forceNameInput = document.getElementById('forceName');
const getCurrentNameButton = document.getElementById('getCurrentNameButton');
const forceChangeButton = document.getElementById('forceChangeButton');
const forceSaveCurrentNameButton = document.getElementById('forceSaveCurrentNameButton');

// URL保存UI
const chatworkUrlInput = document.getElementById('chatworkUrl');
const saveUrlButton = document.getElementById('saveUrlButton');

// ----------------------------
// URL未保存時は実行できないようにする
// ----------------------------
function setUrlRequiredState(hasUrl) {
    // URLがない場合は全ての実行ボタンを無効化
    lunchButton.disabled = !hasUrl;
    vacationButton.disabled = !hasUrl;

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
function updatePreview(data) {
    const baseName = data.originalName || '名前';
    const now = Date.now();
    let nameParts = [baseName];

    // 有給チェック
    if (data.vacationState && data.vacationState.until > now) {
        nameParts.push(data.vacationState.suffix);
    }
    // ランチチェック
    if (data.lunchState && data.lunchState.until > now) {
        nameParts.push(data.lunchState.suffix);
    }

    previewDiv.textContent = nameParts.join('　');
    previewDiv.className = 'preview-text';
}

// 入力イベントリスナー
[lunchSuffixInput, vacationSuffixInput].forEach(input => {
    input.addEventListener('input', () => {
        chrome.storage.local.get(['originalName', 'vacationState', 'lunchState'], (data) => {
            const base = data.originalName || '名前';
            const now = Date.now();
            let nameParts = [base];

            // 自分が入力している方以外のアクティブな状態も反映させる
            const isVac = input === vacationSuffixInput;

            // 有給（自分が入力中なら入力を優先、そうでなければ現在の状態）
            const vacSuffix = isVac ? input.value.trim() : (data.vacationState && data.vacationState.until > now ? data.vacationState.suffix : '');
            if (vacSuffix) nameParts.push(vacSuffix);

            // ランチ（自分が入力中なら入力を優先、そうでなければ現在の状態）
            const lunSuffix = !isVac ? input.value.trim() : (data.lunchState && data.lunchState.until > now ? data.lunchState.suffix : '');
            if (lunSuffix) nameParts.push(lunSuffix);

            previewDiv.textContent = nameParts.join('　');
        });
    });
});

// URL入力が変わったら保存状態を再判定
chatworkUrlInput.addEventListener('input', () => {
    // 入力しただけでは保存扱いにしない（= 必ず保存ボタンを押す）
    refreshUrlState();
});

// ★設定保存リスナー
lunchSuffixInput.addEventListener('input', () => {
    chrome.storage.local.set({ lunchPresetSuffix: lunchSuffixInput.value });
});
lunchDurationInput.addEventListener('input', () => {
    chrome.storage.local.set({ lunchPresetDuration: lunchDurationInput.value });
});
vacationSuffixInput.addEventListener('input', () => {
    chrome.storage.local.set({ vacationPresetSuffix: vacationSuffixInput.value });
});

// ----------------------------
// UI更新
// ----------------------------
function updateUI(data) {
    const hasUrl = !!data.chatworkUrl;

    if (!hasUrl) {
        setUrlRequiredState(false);
        openContainer.style.display = 'none';
        settingsContainer.style.display = 'none';
        return;
    }

    // タブの存在チェックを行ってUIを切り替える
    checkTabAndToggleUI(data);

    // プレビューも更新
    updatePreview(data);
}

// タブの存在を確認して表示を切り替える
async function checkTabAndToggleUI(data) {
    const savedUrl = data.chatworkUrl;
    if (!savedUrl) return;

    // 保存URLのベース部分（#!や?の前まで）を取得
    const baseUrl = savedUrl.split('#')[0].split('?')[0].replace(/\/$/, "");

    const tabs = await chrome.tabs.query({});
    const hasMatchingTab = tabs.some(tab => {
        if (!tab.url) return false;
        const tabBase = tab.url.split('#')[0].split('?')[0].replace(/\/$/, "");
        // ドメインとベースパスが一致するか
        return tabBase.includes(baseUrl) || baseUrl.includes(tabBase);
    });

    if (hasMatchingTab) {
        openContainer.style.display = 'none';
        settingsContainer.style.display = 'block';
    } else {
        openContainer.style.display = 'block';
        settingsContainer.style.display = 'none';
    }

    // ステータス表示はContainer外にあるため常に更新する
    renderSettings(data);
}

function renderSettings(data) {
    lunchButton.disabled = false;
    vacationButton.disabled = false;

    // 個別ボタンとステータスの管理
    let statusParts = [];
    const now = Date.now();

    // ランチ状態
    if (data.lunchState && data.lunchState.until > now) {
        stopLunchButton.style.display = 'block';
        lunchButton.style.display = 'none';
        const t = new Date(data.lunchState.until).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        statusParts.push(`ランチ（${t}迄）`);
    } else {
        stopLunchButton.style.display = 'none';
        lunchButton.style.display = 'block';
    }

    // 有給状態
    if (data.vacationState && data.vacationState.until > now) {
        stopVacationButton.style.display = 'block';
        vacationButton.style.display = 'none';

        const until = new Date(data.vacationState.until);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        statusParts.push(`有給（${until.toLocaleString('ja-JP', options)}迄）`);
    } else {
        stopVacationButton.style.display = 'none';
        vacationButton.style.display = 'block';
    }

    if (statusParts.length > 0) {
        statusDiv.textContent = `🔄 ${statusParts.join(' / ')}に自動復帰`;
        statusDiv.className = 'changed';
        statusDiv.style.display = 'block';
        restoreButton.disabled = false;
    } else {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
        statusDiv.className = '';
        restoreButton.disabled = true;
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
            // URLが違う場合は遷移させるが、ポップアップが閉じないよう active: false にする
            await chrome.tabs.update(tab.id, { url: savedUrl, active: false });
            await ensureTabLoaded(tab.id);
        } else {
            // すでにURLが正しい場合も、ここでは active: true にせず後で制御する
            await ensureTabLoaded(tab.id);
        }
        return tab;
    }

    // 新規作成時も active: false で開き、ポップアップの生存を維持する
    const tab = await chrome.tabs.create({ url: savedUrl, active: false });
    await ensureTabLoaded(tab.id);
    return tab;
}

// ----------------------------
// 設定関連
// ----------------------------

// Chatworkを開くボタン
openChatworkButton.addEventListener('click', async () => {
    try {
        await openOrFocusChatworkTab();
        // 開いた後にUIを更新
        const data = await chrome.storage.local.get(['chatworkUrl', 'lunchState', 'vacationState']);
        await checkTabAndToggleUI(data);
    } catch (e) {
        alert(e.message);
    }
});

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

        // ★ 保存直後にUIを即座に更新（タブチェック等を含む）
        const updatedData = await chrome.storage.local.get(['isChanged', 'originalName', 'chatworkUrl', 'lunchState', 'vacationState']);
        updateUI(updatedData);

        alert('ChatworkページURLを保存しました');
    } catch (e) {
        alert('保存に失敗しました: ' + e.message);
    }
});


// ----------------------------
// 初期化
// ----------------------------
// 復帰日時の初期値を設定（明日の午前9時）
const now = new Date();
const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
const tzoffset = (new Date()).getTimezoneOffset() * 60000; // タイムゾーンオフセット（ミリ秒）
const localISOTime = (new Date(tomorrow - tzoffset)).toISOString().slice(0, 16);
vacationUntilInput.value = localISOTime;

chrome.storage.local.get([
    'isChanged', 'originalName', 'chatworkUrl', 'lunchState', 'vacationState',
    'lunchPresetSuffix', 'lunchPresetDuration', 'vacationPresetSuffix'
], async (data) => {
    // プリセット復元
    if (data.lunchPresetSuffix !== undefined) lunchSuffixInput.value = data.lunchPresetSuffix;
    if (data.lunchPresetDuration !== undefined) lunchDurationInput.value = data.lunchPresetDuration;
    if (data.vacationPresetSuffix !== undefined) vacationSuffixInput.value = data.vacationPresetSuffix;

    // URL復元
    if (data.chatworkUrl) chatworkUrlInput.value = data.chatworkUrl;

    // 強制変更用の入力欄に初期値をセット
    if (data.originalName) forceNameInput.value = data.originalName;

    // URL状態に応じてボタン制御（最優先）
    updateUI(data);

    // プレビュー表示
    if (data.originalName) {
        updatePreview(data);
    } else {
        // アクティブタブに限らず、開いている全てのタブからChatworkを探す
        const tabs = await chrome.tabs.query({ url: 'https://www.chatwork.com/*' });
        if (tabs.length > 0) {
            // 一番最初に見つかったChatworkタブから名前を取得
            const res = await sendMessageSafely(tabs[0].id, { action: 'getCurrentName' });
            if (res && res.success && res.name) {
                data.originalName = res.name;
                // ストレージにも保存しておく（次から楽になる）
                await chrome.storage.local.set({ originalName: res.name });
                updatePreview(data);
            }
        }
    }

    // URLが保存されていないなら警告表示を確実に出す
    await refreshUrlState();
});

// 名前更新の共通同期処理
async function requestSyncName() {
    // ページ（コンテキスト）側でもAPIを実行できるが、
    // バックグラウンドに任せて一元管理する
    const data = await chrome.storage.local.get(['originalName', 'lunchState', 'vacationState', 'chatworkUrl']);
    const savedUrl = data.chatworkUrl;

    if (!savedUrl) {
        alert('URLが保存されていません');
        return;
    }

    const now = Date.now();
    let nameParts = [data.originalName || '名前'];

    // 有給チェック（日付順or重要度順。ここでは有給→ランチの順に連結します）
    if (data.vacationState && data.vacationState.until > now) {
        nameParts.push(data.vacationState.suffix);
    }
    if (data.lunchState && data.lunchState.until > now) {
        nameParts.push(data.lunchState.suffix);
    }

    const fullName = nameParts.join('　');

    let tab;
    try {
        tab = await openOrFocusChatworkTab();
    } catch (e) {
        alert(e.message);
        return;
    }

    const response = await sendMessageSafely(tab.id, { action: 'updateFullName', fullName });

    if (response && response.success) {
        chrome.tabs.update(tab.id, { active: true });
        // 状態を保存してUIを更新
        await chrome.storage.local.set({ isChanged: true });
        updateUI(await chrome.storage.local.get(['chatworkUrl', 'isChanged', 'lunchState', 'vacationState']));
    } else {
        alert('名前の更新に失敗しました: ' + (response?.error || '不明なエラー'));
    }
}

// ----------------------------
// 実行ボタン
// ----------------------------

// ランチボタン
lunchButton.addEventListener('click', async () => {
    try {
        const suffix = lunchSuffixInput.value.trim();
        const minutesValue = parseInt(lunchDurationInput.value);

        if (!suffix || isNaN(minutesValue)) {
            alert('文言と時間を入力してください');
            return;
        }

        // アラーム用に最小1分を保証
        const minutes = Math.max(1, minutesValue);
        const until = Date.now() + minutes * 60 * 1000;

        const baseName = await getBaseName();
        await chrome.storage.local.set({
            lunchState: { suffix, until },
            originalName: baseName
        });

        chrome.alarms.create('restoreLunch', { delayInMinutes: minutes });
        await requestSyncName();
        alert('ランチモードを開始しました');
    } catch (e) {
        alert('エラーが発生しました: ' + e.message);
    }
});

// 有給ボタン
vacationButton.addEventListener('click', async () => {
    try {
        const suffix = vacationSuffixInput.value.trim();
        if (!vacationUntilInput.value) {
            alert('復帰日時を選択してください');
            return;
        }

        const untilDate = new Date(vacationUntilInput.value);
        const now = new Date();

        if (untilDate <= now) {
            alert('復帰日時は現在より後の時間を設定してください');
            return;
        }

        const diffMs = untilDate - now;
        // アラーム用に最小1分を保証（0や負数はエラーになるため）
        const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

        const baseName = await getBaseName();
        await chrome.storage.local.set({
            vacationState: { suffix, until: untilDate.getTime() },
            originalName: baseName
        });

        chrome.alarms.create('restoreVacation', { delayInMinutes: minutes });
        await requestSyncName();
        alert('有給モードを開始しました');
    } catch (e) {
        alert('エラーが発生しました: ' + e.message);
    }
});

// モード開始時のベース名（元の名前）を決定する
// どのモードも有効でなければ、Chatwork上の現在の名前を取り直してベースにする
// （拡張機能の外で手動変更された名前（例: 「〇日休み」付き）も引き継ぐため）
async function getBaseName() {
    const stored = await chrome.storage.local.get([
        'originalName', 'lunchState', 'vacationState', 'lunchPresetSuffix', 'vacationPresetSuffix'
    ]);
    const now = Date.now();
    const isLunchActive = stored.lunchState && stored.lunchState.until > now;
    const isVacationActive = stored.vacationState && stored.vacationState.until > now;

    // 既にモード中なら、現在の名前には文言が付いているので保存済みの名前を使う
    if ((isLunchActive || isVacationActive) && stored.originalName) {
        return stored.originalName;
    }

    try {
        const tab = await openOrFocusChatworkTab();
        const res = await sendMessageSafely(tab.id, { action: 'getCurrentName' });
        if (res && res.success && res.name) {
            // ページ表示が古く、拡張機能の文言が残っている場合に備えて取り除く
            const knownSuffixes = [
                lunchSuffixInput.value.trim(),
                vacationSuffixInput.value.trim(),
                stored.lunchPresetSuffix,
                stored.vacationPresetSuffix,
                stored.lunchState?.suffix,
                stored.vacationState?.suffix
            ];
            const name = stripKnownSuffixes(res.name, knownSuffixes);
            await chrome.storage.local.set({ originalName: name });
            forceNameInput.value = name;
            return name;
        }
    } catch (e) {
        console.error('現在名の取得に失敗しました:', e);
    }

    return stored.originalName || '名前';
}

// 名前の末尾に付いている拡張機能の文言（全角スペース区切り）を取り除く
function stripKnownSuffixes(name, suffixes) {
    const list = [...new Set(suffixes.map(s => (s || '').trim()).filter(Boolean))];
    let result = name.trim();
    let stripped = true;
    while (stripped) {
        stripped = false;
        for (const suffix of list) {
            const tail = '　' + suffix;
            if (result.endsWith(tail)) {
                result = result.slice(0, -tail.length).trim();
                stripped = true;
            }
        }
    }
    return result;
}

// ランチ終了ボタン
stopLunchButton.addEventListener('click', async () => {
    chrome.alarms.clear('restoreLunch');
    await chrome.storage.local.set({ lunchState: null });
    await requestSyncName();
    alert('ランチモードを終了しました');
});

// 有給終了ボタン
stopVacationButton.addEventListener('click', async () => {
    chrome.alarms.clear('restoreVacation');
    await chrome.storage.local.set({ vacationState: null });
    await requestSyncName();
    alert('有給モードを終了しました');
});

restoreButton.addEventListener('click', async () => {
    const savedUrl = await getSavedChatworkUrl();

    // すべての状態をクリア
    chrome.alarms.clearAll();
    await chrome.storage.local.set({
        lunchState: null,
        vacationState: null,
        isChanged: false
    });

    let tab;
    try {
        tab = await openOrFocusChatworkTab();
    } catch (e) {
        alert(e.message);
        return;
    }

    // 元の名前に戻す命令
    const data = await chrome.storage.local.get(['originalName']);
    const originalName = data.originalName || '名前';
    const response = await sendMessageSafely(tab.id, { action: 'updateFullName', fullName: originalName });

    if (response && response.success) {
        chrome.tabs.update(tab.id, { active: true });
        // すべてクリアした後のUI更新
        updateUI({
            chatworkUrl: savedUrl,
            lunchState: null,
            vacationState: null
        });
        alert('すべての設定を解除し、元の名前に戻しました。');
    } else {
        alert('名前の復元に失敗しました');
    }
});

// ----------------------------
// メンテナンス / 強制操作
// ----------------------------

// この名前に強制変更
forceChangeButton.addEventListener('click', async () => {
    const newName = forceNameInput.value.trim();
    if (!newName) {
        alert('名前を入力してください');
        return;
    }

    if (!confirm(`名前を強制的に「${newName}」に変更し、これを初期の名前として保存しますか？\n（現在のランチ/有給の設定も解除されます）`)) {
        return;
    }

    // すべての状態をクリア
    chrome.alarms.clearAll();
    await chrome.storage.local.set({
        lunchState: null,
        vacationState: null,
        isChanged: false,
        originalName: newName
    });

    let tab;
    try {
        tab = await openOrFocusChatworkTab();
    } catch (e) {
        alert(e.message);
        return;
    }

    const response = await sendMessageSafely(tab.id, { action: 'updateFullName', fullName: newName });

    if (response && response.success) {
        chrome.tabs.update(tab.id, { active: true });
        // UI更新
        const updatedData = await chrome.storage.local.get(['chatworkUrl', 'lunchState', 'vacationState', 'originalName']);
        updateUI(updatedData);
        alert('名前を強制更新し、初期の名前として保存しました。');
    } else {
        alert('名前の更新に失敗しました: ' + (response?.error || '不明なエラー'));
    }
});

// チャットワークから現在の名前を取得して入力欄に入れる
getCurrentNameButton.addEventListener('click', async () => {
    let tab;
    try {
        tab = await openOrFocusChatworkTab();
    } catch (e) {
        alert(e.message);
        return;
    }

    const res = await sendMessageSafely(tab.id, { action: 'getCurrentName' });
    if (res && res.success && res.name) {
        forceNameInput.value = res.name;
        alert(`現在の名前「${res.name}」を取得しました。`);
    } else {
        alert('名前の取得に失敗しました。Chatworkのページが正しく表示されているか確認してください。');
    }
});

// 入力欄の名前を初期の名前として保存
forceSaveCurrentNameButton.addEventListener('click', async () => {
    const nameToSave = forceNameInput.value.trim();
    if (!nameToSave) {
        alert('保存する名前を入力してください');
        return;
    }

    await chrome.storage.local.set({ originalName: nameToSave });

    // プレビューも即時更新
    const data = await chrome.storage.local.get(['originalName', 'lunchState', 'vacationState']);
    updatePreview(data);

    alert(`「${nameToSave}」を初期の名前として保存しました。`);
});
