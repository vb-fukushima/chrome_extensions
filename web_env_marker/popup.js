// デフォルト設定
const DEFAULT_SETTINGS = {
    enabled: true,
    bannerHeight: 30,
    colors: {
        dev: '#28a745',
        stg: '#007bff',
        prod: '#ff0000',
        unknown: '#6c757d'
    }
};

// 設定を読み込む
function loadSettings() {
    chrome.storage.sync.get(['envMarkerSettings'], (result) => {
        const settings = result.envMarkerSettings || DEFAULT_SETTINGS;
        
        document.getElementById('enableMarker').checked = settings.enabled;
        document.getElementById('bannerHeight').value = settings.bannerHeight;
        document.getElementById('devColor').value = settings.colors.dev;
        document.getElementById('stgColor').value = settings.colors.stg;
        document.getElementById('prodColor').value = settings.colors.prod;
        document.getElementById('unknownColor').value = settings.colors.unknown;
        
        // バッジの色も更新
        updateBadges();
    });
}

// カラーバッジを更新
function updateBadges() {
    document.getElementById('devBadge').style.backgroundColor = document.getElementById('devColor').value;
    document.getElementById('stgBadge').style.backgroundColor = document.getElementById('stgColor').value;
    document.getElementById('prodBadge').style.backgroundColor = document.getElementById('prodColor').value;
    document.getElementById('unknownBadge').style.backgroundColor = document.getElementById('unknownColor').value;
}

// 設定を保存する
function saveSettings() {
    const settings = {
        enabled: document.getElementById('enableMarker').checked,
        bannerHeight: parseInt(document.getElementById('bannerHeight').value),
        colors: {
            dev: document.getElementById('devColor').value,
            stg: document.getElementById('stgColor').value,
            prod: document.getElementById('prodColor').value,
            unknown: document.getElementById('unknownColor').value
        }
    };

    chrome.storage.sync.set({ envMarkerSettings: settings }, () => {
        // 保存完了メッセージを表示
        const status = document.getElementById('status');
        status.classList.add('success');
        setTimeout(() => {
            status.classList.remove('success');
        }, 2000);

        // 開いているタブをリロードして設定を反映
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url && (
                    tab.url.includes('ben54.jp') || 
                    tab.url.includes('localhost') || 
                    tab.url.includes('127.0.0.1')
                )) {
                    chrome.tabs.reload(tab.id);
                }
            });
        });
    });
}

// 初期値に戻す
function resetSettings() {
    document.getElementById('enableMarker').checked = DEFAULT_SETTINGS.enabled;
    document.getElementById('bannerHeight').value = DEFAULT_SETTINGS.bannerHeight;
    document.getElementById('devColor').value = DEFAULT_SETTINGS.colors.dev;
    document.getElementById('stgColor').value = DEFAULT_SETTINGS.colors.stg;
    document.getElementById('prodColor').value = DEFAULT_SETTINGS.colors.prod;
    document.getElementById('unknownColor').value = DEFAULT_SETTINGS.colors.unknown;
}

// イベントリスナー
document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('saveBtn').addEventListener('click', saveSettings);
document.getElementById('resetBtn').addEventListener('click', resetSettings);

// カラーピッカーの変更をリアルタイムでバッジに反映
document.getElementById('devColor').addEventListener('input', updateBadges);
document.getElementById('stgColor').addEventListener('input', updateBadges);
document.getElementById('prodColor').addEventListener('input', updateBadges);
document.getElementById('unknownColor').addEventListener('input', updateBadges);