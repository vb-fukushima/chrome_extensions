// ページコンテキストで実行されるスクリプト
// このスクリプトはwindow.ACCESS_TOKENとwindow.MYIDにアクセスできる

(function() {
  // MutationObserverでリクエストを監視
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.id === 'chatwork-credentials-request') {
          // リクエストを検知したら認証情報をDOM経由で返す
          const responseElement = document.createElement('div');
          responseElement.id = 'chatwork-credentials';
          responseElement.style.display = 'none';
          
          if (window.ACCESS_TOKEN) {
            responseElement.dataset.accessToken = window.ACCESS_TOKEN;
          }
          if (window.MYID) {
            responseElement.dataset.myId = window.MYID;
          }
          
          document.body.appendChild(responseElement);
          
          // リクエスト要素を削除
          node.remove();
        }
      }
    }
  });
  
  observer.observe(document.body, { childList: true });
  
  console.log('📡 Page script loaded (can access window.ACCESS_TOKEN and window.MYID)');
})();
