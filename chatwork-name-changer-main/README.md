# Chatwork Name Changer v2

API呼び出しによる永続的な名前変更機能を実装したバージョン。

## ファイル構成
- manifest.json: 拡張機能の設定
- popup.html: ポップアップUI
- popup.js: ポップアップのロジック
- content.js: Chatwork API呼び出し（名前変更・復元）
- background.js: タイマー管理

## アイコンについて
以下のアイコンファイルが必要です：
- icon16.png (16x16)
- icon48.png (48x48)
- icon128.png (128x128)

アイコンがない場合は、一時的にmanifest.jsonの"default_icon"セクションをコメントアウトしてテストできます。

## 動作フロー

1. **初回変更時：**
   - 現在の表示名（例: 「山田太郎」）を取得
   - Chrome Storageに元の名前として保存
   - 指定したsuffixを追加（例: 「山田太郎　🍴ランチ中」）
   - Chatwork APIで名前を変更
   - 指定時間後に自動復帰するタイマーを設定

2. **復元時：**
   - Chrome Storageから元の名前を取得
   - Chatwork APIで元の名前に戻す
   - タイマーをキャンセル

3. **2回目以降の変更時：**
   - 保存済みの元の名前を使用（再取得しない）

## 使用するAPI
- エンドポイント: `https://www.chatwork.com/gateway/send_profile_setting.php`
- メソッド: POST
- 必須パラメータ: 
  - URL: myid, _v, _av, ln
  - ペイロード: name, _t (CSRFトークン)

## グローバル変数
- `window.ACCESS_TOKEN`: CSRFトークン
- `window.MYID`: ユーザーID

## インストール方法
1. Chrome拡張機能管理ページ (chrome://extensions/) を開く
2. 「デベロッパーモード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このフォルダを選択

## テスト手順
1. Chatworkにログイン
2. 拡張機能のアイコンをクリック
3. 追加する文言（例: 🍴ランチ中）を入力
4. 自動復帰時間を設定（デフォルト30分）
5. 「名前を変更」をクリック
6. ページをリロードして名前が変わっていることを確認
7. 「今すぐ戻す」で元に戻ることを確認
