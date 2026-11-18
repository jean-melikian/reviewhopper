// Logique commune au content script et à la page d'options.
// Chargé avant content.js (manifest) et avant options.js (options.html).
(() => {
  'use strict';

  const DEFAULTS = { ide: 'vscode', template: '', baseDir: '', mappings: '', home: '', hoverButton: true, jbPort: '63342' };

  const SCHEMES = {
    vscode: 'vscode',
    insiders: 'vscode-insiders',
    cursor: 'cursor',
    windsurf: 'windsurf',
    vscodium: 'vscodium',
    zed: 'zed',
  };

  const isJetBrains = (ide) => ide === 'androidstudio' || ide === 'jetbrains';

  function expandHome(path, home) {
    const h = (home || '').trim().replace(/[\\/]+$/, '');
    if (h && /^~(?=$|[\\/])/.test(path)) return h + path.slice(1);
    return path;
  }

  // "owner/repo = /path" or "repo = /path"; lines starting with # are comments.
  function parseMappings(text) {
    const rows = [];
    const comments = [];
    for (const raw of (text || '').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#')) { comments.push(line); continue; }
      const m = line.match(/^([^=]+?)\s*=\s*(.+)$/);
      if (m) rows.push({ repo: m[1].trim(), path: m[2].trim() });
    }
    return { rows, comments };
  }

  function serializeMappings(rows, comments = []) {
    return [...comments, ...rows.filter((r) => r.repo.trim() && r.path.trim()).map((r) => `${r.repo.trim()} = ${r.path.trim()}`)].join('\n');
  }

  // Local clone of owner/repo, or null. Also says where it came from (for the options test).
  function resolveRoot(cfg, owner, repo) {
    const full = `${owner}/${repo}`.toLowerCase();
    let byName = null;
    for (const { repo: key, path } of parseMappings(cfg.mappings).rows) {
      const k = key.toLowerCase();
      if (k === full) return { root: expandHome(path, cfg.home), from: `correspondance ${key}` };
      if (k === repo.toLowerCase()) byName = { root: expandHome(path, cfg.home), from: `correspondance ${key}` };
    }
    if (byName) return byName;
    const base = expandHome((cfg.baseDir || '').trim(), cfg.home);
    if (!base) return null;
    const root = /\{(repo|owner)\}/.test(base)
      ? base.replace(/\{owner\}/g, owner).replace(/\{repo\}/g, repo)
      : base.replace(/[\\/]+$/, '') + '/' + repo;
    return { root, from: 'dossier par défaut' };
  }

  const localRoot = (cfg, owner, repo) => resolveRoot(cfg, owner, repo)?.root || null;

  // URL that opens rel:line in the IDE, or null (no root / empty template).
  function ideUrl(cfg, { root, rel, line, owner, repo }) {
    if (!root) return null;
    const rootPosix = root.replace(/\\/g, '/').replace(/\/+$/, '');
    const abs = `${rootPosix}/${rel}`;
    const absUri = encodeURI(abs.startsWith('/') ? abs : '/' + abs); // "/C:/..." on Windows
    const col = 1;

    // Android Studio n'expose pas /api/file (404, vérifié en 2026.2.2) : schéma idea:// (ligne en base 1).
    if (isJetBrains(cfg.ide)) return `idea://open?file=${encodeURIComponent(abs)}&line=${line}`;
    // Xcode n'a pas de lien fichier+ligne : app relais (helpers/xcode/install.sh) qui lance `xed --line`.
    if (cfg.ide === 'xcode') return `reviewhopper-xcode://open?file=${encodeURIComponent(abs)}&line=${line}`;
    if (SCHEMES[cfg.ide]) return `${SCHEMES[cfg.ide]}://file${absUri}:${line}:${col}`;
    const tpl = (cfg.template || '').trim();
    if (!tpl) return null;
    return tpl
      .replace(/\{abs\}/g, abs)
      .replace(/\{absUri\}/g, absUri)
      .replace(/\{absEnc\}/g, encodeURIComponent(abs))
      .replace(/\{rel\}/g, rel)
      .replace(/\{root\}/g, rootPosix)
      .replace(/\{line0\}/g, String(line - 1))
      .replace(/\{line\}/g, String(line))
      .replace(/\{col\}/g, String(col))
      .replace(/\{owner\}/g, owner)
      .replace(/\{repo\}/g, repo);
  }

  // "" | {level, text} for a local path typed in the options.
  function checkPath(path, home) {
    const p = (path || '').trim();
    if (!p) return null;
    if (p.startsWith('~') && !(home || '').trim()) return { level: 'warn', text: 'Le ~ ne sera remplacé que si le dossier personnel est renseigné.' };
    const e = expandHome(p, home);
    if (!/^(\/|[A-Za-z]:[\\/])/.test(e)) return { level: 'err', text: 'Chemin absolu attendu (commence par / ou C:/).' };
    return null;
  }

  globalThis.GH2IDE = { DEFAULTS, SCHEMES, isJetBrains, expandHome, parseMappings, serializeMappings, resolveRoot, localRoot, ideUrl, checkPath };
})();
