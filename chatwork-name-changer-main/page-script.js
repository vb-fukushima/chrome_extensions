// ページコンテキストで実行されるスクリプト
// window.ACCESS_TOKEN と window.MYID を DOM 経由で拡張機能へ渡す
(function () {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.id === 'chatwork-credentials-request') {
          const resp = document.createElement('div');
          resp.id = 'chatwork-credentials';
          resp.style.display = 'none';

          if (window.ACCESS_TOKEN) resp.dataset.accessToken = window.ACCESS_TOKEN;
          if (window.MYID) resp.dataset.myId = window.MYID;

          document.body.appendChild(resp);
          node.remove();
        }
      }
    }
  });

  observer.observe(document.body, { childList: true });
})();
