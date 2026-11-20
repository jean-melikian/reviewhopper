// Petit client CDP : lance Chrome headless, ouvre une page, expose eval / souris / capture.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function open({ width = 1280, height = 760, dark = false } = {}) {
  const port = 9333;
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rh-'))}`,
    '--no-first-run', '--hide-scrollbars', '--lang=en-US', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else listeners.forEach((l) => l(m));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', acceptLanguage: 'en-US' });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  const api = {
    send,
    async goto(url) {
      const loaded = new Promise((r) => listeners.push((m) => m.method === 'Page.loadEventFired' && r()));
      await send('Page.navigate', { url }); await loaded; await sleep(2500);
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async move(x, y) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async shot(file, clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(clip && { clip: { ...clip, scale: 1 } }) });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    sleep,
    // Charge l'URL jusqu'à obtenir un diff (GitHub renvoie parfois sa page d'erreur "Unicorn").
    async gotoDiff(url, sel = 'table[data-diff-anchor] td.diff-line-number, td[data-line-number]') {
      for (let i = 0; i < 6; i++) {
        await api.goto(url);
        for (let j = 0; j < 10; j++) {
          if (await api.eval(`!!document.querySelector(${JSON.stringify(sel)})`)) return;
          await sleep(500);
        }
      }
      throw new Error('diff introuvable : ' + url);
    },
    close() { ws.close(); proc.kill(); },
  };
  return api;
}
