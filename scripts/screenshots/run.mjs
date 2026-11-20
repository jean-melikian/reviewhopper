// Captures du README : npm run build && npm run screenshots
// Diff : vraie PR publique (vue sans connexion, donc sans la preview GitHub), extension injectée.
// Réglages : page d'options construite, servie en local avec de faux réglages.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from './cdp.mjs';
import { injectExpr, fakeChrome, OUT } from './inject.mjs';

const DEST = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const PR = 'https://github.com/jean-melikian/reviewhopper/pull/1/files';
const FILE = 'entrypoints/options/main.ts';
const LINE = /function readiness/;
const CFG = { ide: 'vscode', template: '', baseDir: '', home: '/Users/me', hoverButton: true, jbPort: '63342' };

async function diff(dark) {
  const b = await open({ width: 1280, height: 720, dark });
  try {
    await b.gotoDiff(PR, 'td[data-line-number]');
    await b.eval(injectExpr({ ...CFG, mappings: 'jean-melikian/reviewhopper = /Users/me/dev/reviewhopper' }));
    const target = `(() => { const f = [...document.querySelectorAll('[data-tagsearch-path]')].find(e => e.getAttribute('data-tagsearch-path') === ${JSON.stringify(FILE)});
      const row = [...f.querySelectorAll('tr')].find(r => ${LINE}.test(r.textContent)); return row; })()`;
    await b.eval(`${target}.scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await b.sleep(600);
    const p = await b.eval(`(() => { const c = [...${target}.querySelectorAll('td.blob-num')].at(-1).getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; })()`);
    await b.move(p.x, p.y);
    await b.sleep(300);
    const btn = await b.eval(`(() => { const r = document.getElementById('gh2ide-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await b.move(btn.x, btn.y);
    await b.click(btn.x, btn.y);
    await b.sleep(500);
    await b.shot(join(DEST, `diff-${dark ? 'dark' : 'light'}.png`));
  } finally { b.close(); }
}

async function options(dark) {
  const cfg = { ...CFG, ide: 'androidstudio', mappings: 'acme/android-app = /Users/me/dev/android-app\nacme/ios-app = /Users/me/dev/ios-app' };
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  const server = createServer((req, res) => {
    const path = join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try {
      let body = readFileSync(path);
      if (path.endsWith('options.html')) body = body.toString().replace('<head>', `<head><script>${fakeChrome(cfg)}</script>`);
      res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0);
  const b = await open({ width: 900, height: 900, dark });
  try {
    await b.goto(`http://localhost:${server.address().port}/options.html`);
    await b.eval(`(() => { const t = document.getElementById('testInput'); t.value = 'https://github.com/acme/android-app/blob/main/app/src/main/java/com/acme/MainActivity.kt#L42'; t.dispatchEvent(new Event('input')); })()`);
    await b.sleep(300);
    const h = await b.eval('document.documentElement.scrollHeight');
    await b.send('Emulation.setDeviceMetricsOverride', { width: 900, height: h, deviceScaleFactor: 2, mobile: false });
    await b.sleep(300);
    await b.shot(join(DEST, `options-${dark ? 'dark' : 'light'}.png`));
  } finally { b.close(); server.close(); }
}

for (const dark of [false, true]) {
  await diff(dark);
  await options(dark);
}
console.log('Captures écrites dans', DEST);
process.exit(0); // Chrome et la WebSocket peuvent garder le processus ouvert
