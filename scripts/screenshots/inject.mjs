import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../.output/chrome-mv3/', import.meta.url));

// Faux environnement d'extension : réglages fixes, liens interceptés (rien ne s'ouvre pour de vrai).
export const fakeChrome = (cfg) => `Object.defineProperty(window, 'chrome', { configurable: true, writable: true, value: {
  runtime: { id: 'demo', sendMessage: async (m) => { (window.__opened ||= []).push(m); return { ok: true }; } },
  storage: { sync: { get: async () => (${JSON.stringify(cfg)}), set: async () => {} }, onChanged: { addListener() {} } } } });`;

// Injecte le content script construit (npm run build) dans la page courante.
export const injectExpr = (cfg) => `(() => {
  ${fakeChrome(cfg)}
  window.__opened = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (/^https?:/.test(this.href)) return click.call(this); __opened.push(this.href); };
  document.hasFocus = () => false;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(${JSON.stringify(readFileSync(OUT + 'content-scripts/content.css', 'utf8'))});
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  (0, eval)(${JSON.stringify(readFileSync(OUT + 'content-scripts/content.js', 'utf8'))});
})()`;

export { OUT };
