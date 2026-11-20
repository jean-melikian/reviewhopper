import { EDITOR_NAMES, parseMappings, serializeMappings, resolveRoot, ideUrl, checkPath, type Config, type Mapping, type PathCheck } from '@/utils/ide';
import { loadConfig, saveConfig } from '@/utils/config';

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;

let comments: string[] = []; // lignes "# …" des correspondances, conservées telles quelles

// ---------- Affichage conditionnel ----------

function toggle() {
  const ide = $('ide').value;
  $('asBox').style.display = ide === 'androidstudio' ? 'block' : 'none';
  $('jbBox').style.display = ide === 'jetbrains' ? 'block' : 'none';
  $('customBox').style.display = ide === 'custom' ? 'block' : 'none';
  $('xcodeBox').style.display = ide === 'xcode' ? 'block' : 'none';
}

function showMsg(el: HTMLElement, res: PathCheck | null) {
  el.className = 'msg' + (res ? ' ' + res.level : '');
  el.textContent = res ? res.text : '';
}

// ---------- Correspondances dépôt → dossier ----------

function addRow(repo = '', path = '', focus = false) {
  const maps = $('maps');
  const r = document.createElement('input');
  r.type = 'text';
  r.placeholder = 'acme/mon-app';
  r.value = repo;
  r.className = 'repo';
  r.setAttribute('aria-label', 'Dépôt GitHub');
  const p = document.createElement('input');
  p.type = 'text';
  p.placeholder = '/Users/moi/dev/mon-app';
  p.value = path;
  p.className = 'path';
  p.setAttribute('aria-label', 'Dossier local');
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'icon';
  del.title = 'Supprimer';
  del.setAttribute('aria-label', 'Supprimer ce dépôt');
  del.textContent = '✕';
  const msg = document.createElement('div');
  msg.className = 'msg';
  del.addEventListener('click', () => {
    [r, p, del, msg].forEach((e) => e.remove());
    changed();
  });
  for (const i of [r, p]) i.addEventListener('input', changed);
  p.addEventListener('blur', () => guessHome(p.value));
  r.addEventListener('blur', () => { r.value = cleanRepo(r.value); changed(); });
  maps.append(r, p, del, msg);
  if (focus) r.focus();
}

// Accepte une URL GitHub collée dans le champ dépôt.
function cleanRepo(v: string) {
  const m = v.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  return m ? `${m[1]}/${m[2]!.replace(/\.git$/, '')}` : v.trim();
}

// Chaque ligne : input.repo, input.path, bouton supprimer, message.
const repoInputs = () => [...$('maps').querySelectorAll<HTMLInputElement>('input.repo')];
const pathOf = (r: HTMLInputElement) => r.nextElementSibling as HTMLInputElement;
const msgOf = (r: HTMLInputElement) => pathOf(r).nextElementSibling!.nextElementSibling as HTMLElement;

function readRows(): Mapping[] {
  return repoInputs().map((r) => ({ repo: r.value, path: pathOf(r).value }));
}

function validate() {
  const home = $('home').value;
  for (const r of repoInputs()) {
    const p = pathOf(r);
    const msg = msgOf(r);
    let res = checkPath(p.value, home);
    if (!res && r.value.trim() && !p.value.trim()) res = { level: 'warn', text: 'Dossier manquant : cette ligne est ignorée.' };
    if (!res && !r.value.trim() && p.value.trim()) res = { level: 'warn', text: 'Dépôt manquant : cette ligne est ignorée.' };
    if (!res && r.value.trim() && !/^[\w.-]+(\/[\w.-]+)?$/.test(r.value.trim())) res = { level: 'err', text: 'Format attendu : owner/repo ou repo.' };
    p.classList.toggle('bad', res?.level === 'err');
    p.setAttribute('aria-invalid', String(res?.level === 'err'));
    showMsg(msg, res);
  }
  const b = checkPath($('baseDir').value, home);
  $('baseDir').classList.toggle('bad', b?.level === 'err');
  $('baseDir').setAttribute('aria-invalid', String(b?.level === 'err'));
  showMsg($('baseDirMsg'), b);
}

// /Users/<nom>/… ou /home/<nom>/… → dossier personnel, s'il n'est pas encore renseigné.
function guessHome(path: string) {
  if ($('home').value.trim()) return;
  const m = (path || '').trim().match(/^(\/Users\/[^/]+|\/home\/[^/]+)(\/|$)/);
  if (m) {
    $('home').value = m[1]!;
    changed();
  }
}

// ---------- Enregistrement automatique ----------

function current(): Config {
  return {
    ide: $('ide').value as Config['ide'],
    template: $('template').value.trim(),
    baseDir: $('baseDir').value.trim(),
    mappings: serializeMappings(readRows().filter((r) => checkPath(r.path, $('home').value)?.level !== 'err'), comments),
    home: $('home').value.trim(),
    hoverButton: $('hoverButton').checked,
    jbPort: ($('jbPort').value.trim().match(/^\d+$/) || ['63342'])[0]!,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  validate();
  readiness();
  test();
  clearTimeout(saveTimer);
  $('status').className = '';
  $('status').textContent = 'Modifications…';
  saveTimer = setTimeout(async () => {
    await saveConfig(current());
    $('status').className = 'ok';
    $('status').textContent = 'Enregistré ✓';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { $('status').textContent = ''; }, 2000);
  }, 400);
}

// ---------- Test ----------

// URL GitHub (blob, PR, commit, dépôt) ou "owner/repo/chemin[:ligne]".
function parseTarget(input: string) {
  let v = input.trim();
  if (!v) return null;
  let line = 1;
  const hash = v.match(/#L(\d+)/);
  if (hash) line = +hash[1]!;
  v = v.replace(/#.*$/, '').replace(/\?.*$/, '');
  const colon = v.match(/:(\d+)$/);
  if (colon) { line = +colon[1]!; v = v.slice(0, -colon[0].length); }
  v = v.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '').replace(/^\/+/, '');
  const parts = v.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo, kind, ...rest] = parts;
  let rel = null;
  if (kind === 'blob' || kind === 'tree') rel = rest.slice(1).join('/') || null; // blob/<ref>/<chemin>
  else if (kind && !['pull', 'commit', 'compare', 'issues'].includes(kind)) rel = [kind, ...rest].join('/');
  return { owner: owner!, repo: repo!.replace(/\.git$/, ''), rel, line };
}

let lastUrl: string | null = null;
function test() {
  const out = $('testResult');
  const t = parseTarget($('testInput').value);
  lastUrl = null;
  $('testOpen').disabled = true;
  if (!t) {
    out.innerHTML = '';
    return;
  }
  const cfg = current();
  const res = resolveRoot(cfg, t.owner, t.repo);
  const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ESC[c]!);
  const lines = [];
  if (!res) {
    lines.push(`<div class="msg err">Aucun dossier local pour <code>${esc(t.owner)}/${esc(t.repo)}</code> : ajouter le dépôt à l'étape 2.</div>`);
  } else {
    lines.push(`<div>Dossier : <code>${esc(res.root)}</code> <span class="hint">(${esc(res.from)})</span></div>`);
    if (!t.rel) {
      lines.push('<div class="hint">Ajouter un chemin de fichier pour tester l\'ouverture.</div>');
    } else {
      const url = ideUrl(cfg, { root: res.root, rel: t.rel, line: t.line, owner: t.owner, repo: t.repo });
      if (url) {
        lastUrl = url;
        $('testOpen').disabled = false;
        lines.push(`<div>Fichier : <code>${esc(res.root.replace(/[\\/]+$/, ''))}/${esc(t.rel)}</code>, ligne ${t.line}</div>`);
        lines.push(`<div class="hint">Lien : <code>${esc(url)}</code></div>`);
      } else {
        lines.push('<div class="msg err">Modèle d\'URL vide (étape 1).</div>');
      }
    }
  }
  out.innerHTML = lines.join('');
}

$('testOpen').addEventListener('click', async () => {
  if (!lastUrl) return;
  if (/^https?:\/\//i.test(lastUrl)) {
    try {
      const r = await fetch(lastUrl);
      $('testResult').insertAdjacentHTML('beforeend', `<div class="msg ${r.ok ? 'ok' : 'err'}">Réponse de l'IDE : ${r.status}</div>`);
    } catch (e) {
      $('testResult').insertAdjacentHTML('beforeend', '<div class="msg err">IDE injoignable.</div>');
    }
    return;
  }
  const a = document.createElement('a');
  a.href = lastUrl;
  a.click();
  const name = EDITOR_NAMES[current().ide];
  $('testResult').insertAdjacentHTML('beforeend', '<div class="msg ok"></div>');
  ($('testResult').lastElementChild as HTMLElement).textContent =
    `Lien envoyé à ${name}. Si rien ne s'ouvre, voir l'étape 1 (et cocher "Toujours autoriser" si le navigateur le demande).`;
});

// ---------- État de la configuration ----------

function readiness() {
  const cfg = current();
  const hasRepo = readRows().some((r) => r.repo.trim() && r.path.trim()) || !!cfg.baseDir;
  let todo: string | null = null;
  if (cfg.ide === 'custom' && !cfg.template) todo = "Il reste à remplir le modèle d'URL (étape 1).";
  else if (!hasRepo) todo = 'Il reste à indiquer où se trouvent les clones locaux (étape 2).';
  const el = $<HTMLElement>('ready');
  el.className = todo ? 'ready todo' : 'ready ok';
  el.textContent = todo ?? (cfg.ide === 'xcode'
    ? "Prêt, une fois l'app relais Xcode installée (étape 1) : ouvrir une PR sur GitHub et survoler une ligne du diff."
    : 'Prêt : ouvrir une PR sur GitHub et survoler une ligne du diff.');
}

// Arrivée depuis le toast "Dossier local inconnu pour owner/repo" : options.html#add=owner/repo.
function addFromHash() {
  const m = location.hash.match(/^#add=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  const repo = decodeURIComponent(m[1]!);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return;
  let target = repoInputs().find((r) => r.value.trim().toLowerCase() === repo.toLowerCase())
    ?? repoInputs().find((r) => !r.value.trim() && !pathOf(r).value.trim());
  if (!target) {
    addRow();
    target = repoInputs().at(-1)!;
  }
  if (!target.value.trim()) target.value = repo;
  const p = pathOf(target);
  p.scrollIntoView({ block: 'center' });
  p.focus();
  changed();
}

// ---------- Chargement ----------

loadConfig().then((v) => {
  $('ide').value = v.ide;
  $('template').value = v.template;
  $('baseDir').value = v.baseDir;
  $('home').value = v.home;
  $('hoverButton').checked = v.hoverButton;
  $('jbPort').value = v.jbPort;
  const parsed = parseMappings(v.mappings);
  comments = parsed.comments;
  parsed.rows.forEach((r) => addRow(r.repo, r.path));
  if (!parsed.rows.length) addRow();
  if (v.home && /^~/.test(v.baseDir)) $('home').closest('details')!.open = true;
  toggle();
  validate();
  test();
  readiness();
  addFromHash();
});

$('ide').addEventListener('change', () => { toggle(); changed(); });
for (const id of ['template', 'baseDir', 'home', 'jbPort']) $(id).addEventListener('input', changed);
$('baseDir').addEventListener('blur', () => guessHome($('baseDir').value));
$('hoverButton').addEventListener('change', changed);
$('addMap').addEventListener('click', () => addRow('', '', true));
$('xcodeCopy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('xcodeCmd').textContent);
  $('xcodeCopy').textContent = 'Copié ✓';
  setTimeout(() => { $('xcodeCopy').textContent = 'Copier'; }, 1500);
});
$('testInput').addEventListener('input', test);
