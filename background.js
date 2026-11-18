chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.type === 'options') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg?.type === 'httpTry') {
    // Try each URL in turn until the IDE answers 2xx (404 = file not found → next candidate).
    (async () => {
      let last = { ok: false, error: 'aucune URL' };
      for (const url of msg.urls) {
        try {
          const r = await fetch(url);
          last = { ok: r.ok, status: r.status };
          if (r.ok || r.status !== 404) break;
        } catch (e) {
          last = { ok: false, error: String(e) };
          break;
        }
      }
      send(last);
    })();
    return true;
  }
  if (msg?.type === 'http') {
    // JetBrains built-in server (or any local HTTP opener): fetched from the
    // service worker so GitHub's CSP / mixed-content rules don't get in the way.
    fetch(msg.url)
      .then((r) => send({ ok: r.ok, status: r.status }))
      .catch((e) => send({ ok: false, error: String(e) }));
    return true;
  }
});
