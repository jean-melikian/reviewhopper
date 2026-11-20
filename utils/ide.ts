// Logique commune au content script et à la page d'options.

export type Ide = 'vscode' | 'insiders' | 'cursor' | 'windsurf' | 'vscodium' | 'zed' | 'androidstudio' | 'jetbrains' | 'xcode' | 'custom';
export interface Config {
  ide: Ide; template: string; baseDir: string; mappings: string; home: string; hoverButton: boolean; jbPort: string;
}
export interface Mapping { repo: string; path: string }
export interface PathCheck { level: 'warn' | 'err'; text: string }

export const DEFAULTS: Config = { ide: 'vscode', template: '', baseDir: '', mappings: '', home: '', hoverButton: true, jbPort: '63342' };

export const SCHEMES: Partial<Record<Ide, string>> = {
  vscode: 'vscode',
  insiders: 'vscode-insiders',
  cursor: 'cursor',
  windsurf: 'windsurf',
  vscodium: 'vscodium',
  zed: 'zed',
};

export const isJetBrains = (ide: string) => ide === 'androidstudio' || ide === 'jetbrains';

export function expandHome(path: string, home: string): string {
  const h = (home || '').trim().replace(/[\\/]+$/, '');
  if (h && /^~(?=$|[\\/])/.test(path)) return h + path.slice(1);
  return path;
}

// "owner/repo = /path" or "repo = /path"; lines starting with # are comments.
export function parseMappings(text: string): { rows: Mapping[]; comments: string[] } {
  const rows: Mapping[] = [];
  const comments: string[] = [];
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { comments.push(line); continue; }
    const m = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (m) rows.push({ repo: m[1]!.trim(), path: m[2]!.trim() });
  }
  return { rows, comments };
}

export function serializeMappings(rows: Mapping[], comments: string[] = []): string {
  return [...comments, ...rows.filter((r) => r.repo.trim() && r.path.trim()).map((r) => `${r.repo.trim()} = ${r.path.trim()}`)].join('\n');
}

// Local clone of owner/repo, or null. Also says where it came from (for the options test).
export function resolveRoot(cfg: Config, owner: string, repo: string): { root: string; from: string } | null {
  const full = `${owner}/${repo}`.toLowerCase();
  let byName: { root: string; from: string } | null = null;
  for (const { repo: key, path } of parseMappings(cfg.mappings).rows) {
    const k = key.toLowerCase();
    if (k === full) return { root: expandHome(path, cfg.home), from: `correspondance ${key}` };
    if (k === repo.toLowerCase()) byName = { root: expandHome(path, cfg.home), from: `correspondance ${key}` };
  }
  if (byName) return byName;
  const base = expandHome((cfg.baseDir || '').trim(), cfg.home);
  if (!base) return null;
  const root = /\{(repo|owner)\}/.test(base)
    ? base.replace(/\{owner\}/g, owner).replace(/\{repo\}/g, () => repo)
    : base.replace(/[\\/]+$/, '') + '/' + repo;
  return { root, from: 'dossier par défaut' };
}

export const localRoot = (cfg: Config, owner: string, repo: string) => resolveRoot(cfg, owner, repo)?.root || null;

// Chemin relatif au dépôt lu dans la page, ou null s'il est suspect : un commentaire de PR ne doit pas
// pouvoir faire ouvrir (ou copier) un fichier hors du dépôt.
export function safeRel(rel: string | null | undefined): string | null {
  if (!rel) return null;
  if (/^[\\/]|^[A-Za-z]:|\\|[\u0000-\u001f\u007f]/.test(rel)) return null;
  if (rel.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null;
  return rel;
}

// Encode chaque segment (#, ?, & compris) en gardant les / et un lecteur Windows "C:".
const encodePath = (p: string) => p.split('/').map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/');

// URL that opens rel:line in the IDE, or null (no root / empty template / suspicious path).
export function ideUrl(
  cfg: Config,
  { root, rel, line, owner, repo }: { root: string | null; rel: string; line: number; owner: string; repo: string },
): string | null {
  if (!root || !safeRel(rel)) return null;
  const rootPosix = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const abs = `${rootPosix}/${rel}`;
  const absUri = encodePath(abs.startsWith('/') ? abs : '/' + abs); // "/C:/..." on Windows
  const col = 1;

  // Android Studio n'expose pas /api/file (404, vérifié en 2026.2.2) : schéma idea:// (ligne en base 1).
  if (isJetBrains(cfg.ide)) return `idea://open?file=${encodeURIComponent(abs)}&line=${line}`;
  // Xcode n'a pas de lien fichier+ligne : app relais (helpers/xcode/install.sh) qui lance `xed --line`.
  if (cfg.ide === 'xcode') return `reviewhopper-xcode://open?file=${encodeURIComponent(abs)}&line=${line}`;
  if (SCHEMES[cfg.ide]) return `${SCHEMES[cfg.ide]}://file${absUri}:${line}:${col}`;
  const tpl = (cfg.template || '').trim();
  if (!tpl) return null;
  return tpl
    .replace(/\{abs\}/g, () => abs)
    .replace(/\{absUri\}/g, () => absUri)
    .replace(/\{absEnc\}/g, () => encodeURIComponent(abs))
    .replace(/\{rel\}/g, () => rel)
    .replace(/\{root\}/g, () => rootPosix)
    .replace(/\{line0\}/g, () => String(line - 1))
    .replace(/\{line\}/g, () => String(line))
    .replace(/\{col\}/g, () => String(col))
    .replace(/\{owner\}/g, () => owner)
    .replace(/\{repo\}/g, () => repo);
}

// "" | {level, text} for a local path typed in the options.
export function checkPath(path: string, home: string): PathCheck | null {
  const p = (path || '').trim();
  if (!p) return null;
  if (p.startsWith('~') && !(home || '').trim()) return { level: 'warn', text: 'Le ~ ne sera remplacé que si le dossier personnel est renseigné.' };
  const e = expandHome(p, home);
  if (!/^(\/|[A-Za-z]:[\\/])/.test(e)) return { level: 'err', text: 'Chemin absolu attendu (commence par / ou C:/).' };
  return null;
}

