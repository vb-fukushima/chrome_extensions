const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

// 状態を管理（初期はPCモードと仮定）
let isIphoneMode = false;

chrome.action.onClicked.addListener(async (tab) => {
  isIphoneMode = !isIphoneMode;

  if (isIphoneMode) {
    // iPhoneモードに設定
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [{
        "id": 1,
        "priority": 1,
        "action": {
          "type": "modifyHeaders",
          "requestHeaders": [{ "header": "user-agent", "operation": "set", "value": IPHONE_UA }]
        },
        "condition": { "urlFilter": "*", "resourceTypes": ["main_frame"] }
      }]
    });
    // アイコンに「SP」と表示（背景色は赤）
    chrome.action.setBadgeText({ text: "SP" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  } else {
    // PCモード（ルール削除）
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1]
    });
    // アイコンの文字を消す、または「PC」と表示
    chrome.action.setBadgeText({ text: "" }); 
  }

  // ページをリロードして反映
  chrome.tabs.reload(tab.id);
});