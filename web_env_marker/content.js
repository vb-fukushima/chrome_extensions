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

// 設定を取得してバナーを表示
chrome.storage.sync.get(['envMarkerSettings'], (result) => {
    const settings = result.envMarkerSettings || DEFAULT_SETTINGS;
    
    // バナーが無効の場合は何もしない
    if (!settings.enabled) {
        return;
    }

    const currentUrl = window.location.href;
    const environments = [
        { name: '開発環境', type: 'dev', patterns: ['localhost', '127.0.0.1'] },
        { name: 'STG環境', type: 'stg', patterns: ['ww9.', 'admin9.'] },
        { name: '本番環境', type: 'prod', patterns: ['www.ben54.jp', 'admin.ben54.jp'] }
    ];
    
    let envText = '環境不明';
    let envType = 'unknown';

    // currentUrlにマッチする最初の環境設定を見つける
    const matchedEnv = environments.find(env => {
        return env.patterns.some(pattern => currentUrl.includes(pattern));
    });

    // マッチする環境があれば、テキストとタイプを更新
    if (matchedEnv) {
        envText = matchedEnv.name;
        envType = matchedEnv.type;
    }

    // 新しい div 要素を作成
    const envMarker = document.createElement('div');
    envMarker.id = 'chrome-env-marker';
    envMarker.textContent = envText;
    
    // 設定から色を取得して適用
    envMarker.style.backgroundColor = settings.colors[envType];
    envMarker.style.height = `${settings.bannerHeight}px`;
    envMarker.style.lineHeight = `${settings.bannerHeight}px`;

    // ページの上部に挿入
    document.body.prepend(envMarker);

    // <body>要素の上部全体に、バナーの高さ分のパディングを追加
    document.body.style.paddingTop = `${settings.bannerHeight}px`;
});