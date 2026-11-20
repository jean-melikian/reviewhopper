import './style.css';
import { DEFAULTS, EDITOR_NAMES, localRoot, ideUrl, safeRel, type Config } from '@/utils/ide';
import { loadConfig } from '@/utils/config';

export default defineContentScript({
  matches: ['https://github.com/*'],
  runAt: 'document_idle',
  main() {
  let cfg: Config = { ...DEFAULTS };
  loadConfig().then((v) => { cfg = v; });
  browser.storage.onChanged.addListener((ch, area) => {
    if (area === 'sync') for (const k in ch) (cfg as any)[k] = ch[k]?.newValue;
  });

  const LINE_CELL = 'td[data-line-number]:not(.diff-text-cell)';
  // Snippet de diff d'un fil de review dans l'onglet Conversation (une seule colonne de numéros)
  const THREAD_CELL = 'td[class*="diffLineNumber"]';
  const ANY_CELL = `${LINE_CELL}, ${THREAD_CELL}`;
  const THREAD_LINK = 'h2 a[href*="#r"]';
  // Vrai en-tête de fil de review : lien vers ".../pull/<n>/changes#r<id>" (ou /files), hors du corps
  // d'un commentaire (un "## [chemin](...#r1)" en markdown ne doit pas passer pour un en-tête).
  const isThreadLink = (a: Element) =>
    /\/pull\/\d+\/(changes|files)#r\d+$/.test(a.getAttribute('href') ?? '') &&
    !a.closest('.markdown-body, .comment-body, [class*="markdown"]');
  const threadLinks = (root: ParentNode) => [...root.querySelectorAll(THREAD_LINK)].filter(isThreadLink);
  const HASH_ID = /^diff-[0-9a-f]{64}$/;
  const clean = (s: string | null | undefined) => (s ?? '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();

  // ---------- Reading the page ----------

  function repoInfo(): { owner: string; repo: string } | null {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)/);
    return m ? { owner: m[1]!, repo: m[2]! } : null;
  }

  function filePathFor(el: Element): string | null {
    for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
      // New React diff view: <div id="diff-<sha256(path)>">
      if (p.id && HASH_ID.test(p.id)) {
        const b = p.querySelector('[data-file-path]');
        if (b) return b.getAttribute('data-file-path');
        const code = p.querySelector('h3 code, h3 a');
        if (code) return clean(code.textContent);
      }
      // Conversation tab: review thread <article> with an <h2><a href="…/changes#r<id>">path</a>
      if (p.tagName === 'ARTICLE') {
        const links = threadLinks(p);
        const paths = new Set(links.map((a) => clean(a.textContent)));
        if (paths.size === 1) return [...paths][0]!;
      }
      // Classic diff view
      if (p.hasAttribute && p.hasAttribute('data-tagsearch-path')) return p.getAttribute('data-tagsearch-path');
      if (p.classList && p.classList.contains('file')) {
        const h = p.querySelector('.file-header[data-path]');
        if (h) return h.getAttribute('data-path');
      }
    }
    // Last resort: nearest ancestor whose path markers all agree
    for (let p: Element | null = el, i = 0; p && i < 12; p = p.parentElement, i++) {
      const marks = p.querySelectorAll ? [...p.querySelectorAll('[data-file-path], [data-path]')] : [];
      if (!marks.length) continue;
      const vals = new Set(marks.map((m) => m.getAttribute('data-file-path') || m.getAttribute('data-path')));
      return vals.size === 1 ? ([...vals][0] ?? null) : null;
    }
    return null;
  }

  const isOld = (c: Element) =>
    c.classList.contains('blob-num-deletion') ||
    c.getAttribute('data-diff-side') === 'left' ||
    c.getAttribute('data-split-side') === 'left';

  // Returns the line number in the PR's *new* version of the file.
  function lineFor(cell: Element): { line: number; approx: boolean } {
    if (cell.matches(THREAD_CELL)) return threadCellLine(cell);
    const row = cell.closest('tr');
    const cells = row ? [...row.querySelectorAll(LINE_CELL)] : [cell];
    const own = parseInt(cell.getAttribute('data-line-number') ?? '', 10);

    // New React diff view: data-diff-side + data-diff-line-key="b:254-l:254-r:253"
    const side = cell.getAttribute('data-diff-side');
    if (side) {
      if (side === 'right') {
        if (!Number.isNaN(own)) return { line: own, approx: false };
        // Moitié droite vide d'une ligne supprimée : même calcul que depuis la cellule de gauche.
        const left = cells.find((c) => c.getAttribute('data-diff-side') === 'left');
        if (left) return lineFor(left);
        return { line: 1, approx: true };
      }
      const r = (cell.getAttribute('data-diff-line-key') || '').match(/(?:^|-)r:(\d+)/);
      // Unchanged line shown on the left: the key gives its number in the new file
      if (cell.classList.contains('diff-line-number-neutral') && r) return { line: +r[1]!, approx: false };
      // Deleted line: only exists in the old file → nearest line in the new file
      const right = cells.find((c) => c.getAttribute('data-diff-side') === 'right' && /^\d+$/.test(c.getAttribute('data-line-number') ?? ''));
      if (right) return { line: parseInt(right.getAttribute('data-line-number') ?? '', 10), approx: true };
      if (r) return { line: +r[1]!, approx: true };
      return { line: own, approx: true };
    }

    // Classic diff view
    let target = cell;
    const sideless = !cell.hasAttribute('data-split-side') && !cell.hasAttribute('data-diff-side');
    if (isOld(cell) || sideless) {
      const cands = cells.filter((c) => !isOld(c) && c.getAttribute('data-line-number'));
      if (cands.length) target = cands[cands.length - 1]!;
    }
    const line = parseInt(target.getAttribute('data-line-number') ?? '', 10);
    return { line, approx: isOld(target) || cell.classList.contains('blob-num-deletion') };
  }

  // Conversation snippet: one number column, or two (old, new) as on context lines.
  // Each slot is a number or null (empty column).
  const rowSlots = (row: Element): (number | null)[] => [...row.querySelectorAll(THREAD_CELL)]
    .flatMap((c) => { const codes = [...c.querySelectorAll('code')]; return codes.length ? codes : [c]; })
    .flatMap((e) => { const nums = clean(e.textContent).match(/\d+/g); return nums ? nums.map(Number) : [null]; });
  // Two columns → the new-file one (last); one column → that number.
  const rowNumber = (row: Element): number | null => {
    const s = rowSlots(row);
    return s.length ? s[s.length - 1]! : null;
  };
  // A deleted line only has an old-file number: use the nearest non-deleted row (below first, then above).
  const isDeletedRow = (row: Element) => !!row.querySelector('code[class*="DeletionLine"]') ||
    (rowSlots(row).length >= 2 && rowNumber(row) == null);
  function threadCellLine(cell: Element): { line: number; approx: boolean } {
    const row = cell.closest('tr')!;
    if (!isDeletedRow(row)) return { line: rowNumber(row) ?? 1, approx: false };
    const rows = [...row.closest('table')!.querySelectorAll('tr')].filter((r) => rowNumber(r) != null && !isDeletedRow(r));
    const below = rows.find((r) => row.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
    const above = rows.filter((r) => row.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_PRECEDING).pop();
    const near = below || above;
    return { line: (near ? rowNumber(near) : rowNumber(row)) ?? 1, approx: true };
  }

  // "Line 122" / "Lines 118 to 122" next to the file name of a review thread → commented line.
  function threadHeaderLine(h2: Element): number {
    const m = (h2.textContent ?? '').match(/Lines?\s+(\d+)(?:\D+(\d+))?/);
    return m ? parseInt(m[2] || m[1]!, 10) : 1;
  }

  // Line-number cell to use for an element inside a diff row.
  function cellFor(el: EventTarget | Element | null): Element | null {
    if (!(el instanceof Element)) return null;
    const td = el.closest('td');
    if (td && td.matches(ANY_CELL)) return td;
    const row = el.closest('tr');
    if (!row) return null;
    const cells = [...row.querySelectorAll(ANY_CELL)];
    if (!cells.length) return null;
    const side = td && (td.getAttribute('data-split-side') || td.getAttribute('data-diff-side'));
    if (side) {
      const same = cells.find((c) => (c.getAttribute('data-split-side') || c.getAttribute('data-diff-side')) === side);
      if (same) return same;
    }
    return cells[0] ?? null;
  }

  // ---------- Opening ----------

  // Message au background. Après un rechargement ou une mise à jour de l'extension, le script de cet
  // onglet est orphelin : l'appel lève (parfois sans attendre) "Extension context invalidated".
  type Reply = { ok: boolean; status?: number; error?: string } | undefined;
  async function send(msg: object): Promise<Reply> {
    try {
      return (await browser.runtime.sendMessage(msg)) as Reply;
    } catch (e) {
      if (/context invalidated/i.test(String(e))) {
        toast({ kind: 'warn', text: 'ReviewHopper a été mis à jour : recharger la page.' });
        return new Promise(() => {}); // aucun autre message
      }
      return { ok: false, error: String(e) };
    }
  }

  const editorName = () => EDITOR_NAMES[cfg.ide] ?? "l'éditeur";
  const APPROX = 'Ligne supprimée : ouverture de la ligne la plus proche. ';

  // Piste affichée si rien ne s'est ouvert : un lien de schéma non enregistré ne fait rien, sans erreur.
  function noOpenHint(): Partial<ToastOpts> {
    const n = editorName();
    if (cfg.ide === 'xcode') return { hint: "Rien ne s'ouvre ? Installer l'app ReviewHopper Xcode.", action: { label: 'Voir les réglages' } };
    if (cfg.ide === 'androidstudio' || cfg.ide === 'jetbrains') return { hint: `Rien ne s'ouvre ? Lancer ${n} une fois pour qu'il gère les liens idea://.` };
    if (cfg.ide === 'custom') return { hint: "Rien ne s'ouvre ? Vérifier le modèle d'URL.", action: { label: 'Voir les réglages' } };
    return { hint: `Rien ne s'ouvre ? Vérifier que ${n} est installé.` };
  }

  function openUrl(url: string, opened: ToastOpts) {
    if (/^https?:\/\//i.test(url)) {
      send({ type: 'http', url }).then((res) => {
        if (res?.ok) toast(opened);
        else toast({ kind: 'err', text: `L'éditeur ne répond pas (${res?.status || res?.error || 'pas de réponse'}). Est-il lancé ? Vérifier aussi le modèle d'URL.`, action: { label: 'Voir les réglages' } });
      });
      return;
    }
    // Lien de schéma (vscode://, idea://…) : si l'éditeur prend la main, la fenêtre perd le focus.
    // Sinon, au bout de 2 s, on ajoute la piste "Rien ne s'ouvre ?".
    let left = false;
    const onBlur = () => { left = true; };
    window.addEventListener('blur', onBlur, { once: true });
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    const shown = toast(opened);
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      if (!left && document.hasFocus() && shown.isCurrent()) toast({ ...opened, ...noOpenHint() });
    }, 2000);
  }

  function openFor(el: Element, forcedLine?: number) {
    const repoI = repoInfo();
    const rel = filePathFor(el);
    if (!repoI || !rel) {
      toast({ kind: 'err', text: 'Impossible de trouver le chemin du fichier sur cette page.' });
      return;
    }
    if (!safeRel(rel)) {
      toast({ kind: 'err', text: 'Chemin de fichier refusé (.., chemin absolu ou caractères invalides).' });
      return;
    }
    let line: number | undefined = forcedLine;
    let approx = false;
    if (line == null) {
      const cell = cellFor(el);
      if (!cell) return;
      ({ line, approx } = lineFor(cell));
    }
    if (!line || Number.isNaN(line)) { line = 1; approx = true; }

    const repo = `${repoI.owner}/${repoI.repo}`;
    const root = localRoot(cfg, repoI.owner, repoI.repo);
    if (!root && cfg.ide === 'jetbrains') {
      openJetBrainsHttp({ rel, line, approx, repo });
      return;
    }
    if (!root) {
      toast({ kind: 'warn', text: `Dossier local inconnu pour ${repo}.`, action: { label: 'Indiquer le dossier', repo } });
      return;
    }
    const url = ideUrl(cfg, { root, rel, line, ...repoI });
    if (!url) {
      toast({ kind: 'warn', text: "Modèle d'URL personnalisé vide.", action: { label: 'Voir les réglages' } });
      return;
    }
    openUrl(url, { kind: approx ? 'warn' : 'ok', text: `${approx ? APPROX : ''}Ouverture dans ${editorName()} : ${rel}:${line}` });
  }

  // IntelliJ & co sans dossier local : serveur intégré de l'IDE, chemin relatif aux projets ouverts.
  function openJetBrainsHttp({ rel, line, approx, repo }: { rel: string; line: number; approx: boolean; repo: string }) {
    const port = /^\d+$/.test(cfg.jbPort || '') ? cfg.jbPort : '63342';
    const q = (file: string) => `http://localhost:${port}/api/file?file=${encodeURIComponent(file)}&line=${line}&column=1`;
    const urls = [];
    const parts = rel.split('/');
    for (let i = 0; i < parts.length; i++) urls.push(q(parts.slice(i).join('/')));
    send({ type: 'httpTry', urls }).then((res) => {
      if (res && res.ok) {
        toast({ kind: approx ? 'warn' : 'ok', text: `${approx ? APPROX : ''}Ouverture dans ${editorName()} : ${rel}:${line}` });
      } else if (res && res.status === 404) {
        toast({ kind: 'warn', text: `Fichier introuvable dans les projets ouverts. Indiquer le dossier local de ${repo} (recommandé).`, action: { label: 'Indiquer le dossier', repo } });
      } else {
        toast({ kind: 'err', text: `L'IDE ne répond pas sur le port ${port}. Indiquer le dossier local de ${repo} (recommandé), ou cocher "Allow unsigned requests" dans l'IDE.`, action: { label: 'Indiquer le dossier', repo } });
      }
    });
  }

  // ---------- UI ----------

  // Toast construit en DOM (jamais d'innerHTML). Erreur : role=alert ; minuterie en pause au survol.
  type ToastOpts = { kind: 'ok' | 'warn' | 'err'; text: string; hint?: string; action?: { label: string; repo?: string } };
  const DURATION = { ok: 4000, warn: 7000, err: 9000 };
  let toastSeq = 0;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let toastLeft = 0;
  let toastStart = 0;
  const toastEl = document.createElement('div');
  toastEl.id = 'gh2ide-toast';
  const hideToast = () => { clearTimeout(toastTimer); toastEl.hidden = true; };
  const armToast = (ms: number) => { clearTimeout(toastTimer); toastStart = Date.now(); toastLeft = ms; toastTimer = setTimeout(hideToast, ms); };
  toastEl.addEventListener('mouseenter', () => { clearTimeout(toastTimer); toastLeft -= Date.now() - toastStart; });
  toastEl.addEventListener('mouseleave', () => { if (!toastEl.hidden) armToast(Math.max(toastLeft, 1500)); });
  toastEl.addEventListener('focusin', () => clearTimeout(toastTimer));
  toastEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideToast(); });

  function toast(o: ToastOpts) {
    const seq = ++toastSeq;
    toastEl.replaceChildren();
    toastEl.className = o.kind;
    toastEl.setAttribute('role', o.kind === 'err' ? 'alert' : 'status');
    const body = document.createElement('div');
    body.className = 'body';
    const text = document.createElement('div');
    text.textContent = o.text;
    body.append(text);
    if (o.hint) {
      const h = document.createElement('div');
      h.className = 'hint';
      h.textContent = o.hint;
      body.append(h);
    }
    if (o.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.textContent = o.action.label;
      const repo = o.action.repo;
      b.addEventListener('click', () => { send({ type: 'options', repo }); hideToast(); });
      body.append(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.setAttribute('aria-label', 'Fermer');
    close.textContent = '✕';
    close.addEventListener('click', hideToast);
    toastEl.append(body, close);
    if (!toastEl.isConnected) document.body.appendChild(toastEl);
    toastEl.hidden = false;
    armToast(DURATION[o.kind] + (o.hint ? 3000 : 0));
    return { isCurrent: () => seq === toastSeq && !toastEl.hidden };
  }

  const btn = document.createElement('button');
  btn.id = 'gh2ide-btn';
  btn.type = 'button';
  btn.textContent = '↗';
  const ALT = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌥' : 'Alt';
  const labelBtn = () => {
    btn.title = `Ouvrir dans ${editorName()} (ou ${ALT}+clic sur la ligne)`;
    btn.setAttribute('aria-label', `Ouvrir la ligne dans ${editorName()}`);
  };
  labelBtn();
  let hoverCell: Element | null = null;
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (hoverCell && hoverCell.isConnected) openFor(hoverCell);
  });
  const mountBtn = () => { if (!btn.isConnected) document.body.appendChild(btn); };

  // Masquage différé : en quittant la ligne, la souris traverse la marge (bordure du snippet,
  // padding) avant d'atteindre le bouton → on laisse le temps de l'atteindre.
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  function hideBtnNow() {
    clearTimeout(hideTimer);
    btn.style.display = 'none';
    hoverCell = null;
  }
  function hideBtn() {
    if (btn.style.display !== 'block') return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBtnNow, 600);
  }
  btn.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  btn.addEventListener('mouseleave', hideBtn);

  document.addEventListener('mouseover', (e) => {
    if (!cfg.hoverButton) return;
    if (e.target === btn) return;
    const cell = cellFor(e.target);
    if (!cell || !filePathFor(cell)) return hideBtn();
    const r = cell.getBoundingClientRect();
    if (!r.width) return hideBtn();
    clearTimeout(hideTimer);
    mountBtn();
    labelBtn();
    hoverCell = cell;
    btn.style.left = `${Math.max(0, r.left - 20)}px`;
    btn.style.top = `${r.top + (r.height - 18) / 2}px`;
    btn.style.display = 'block';
  }, true);
  window.addEventListener('scroll', hideBtnNow, true);

  // ---------- Copier le chemin (en-tête des fils de review, onglet Conversation) ----------
  // Utile pour les éditeurs sans lien profond (Cmd+Shift+O puis coller).

  const COPY_ICON = '<svg class="i-copy" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';

  // Coche tracée (stroke) pour l'animer au dessin.
  const CHECK_ICON = '<svg class="i-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" d="M2.75 8.75l3.5 3.5 7-7.5"/></svg>';

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  // Infobulle façon Primer (bouton "copy branch name") : au survol, puis "Copié !" après le clic.
  const tip = document.createElement('div');
  tip.id = 'gh2ide-tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-live', 'polite');
  function showTip(el: Element, text: string) {
    tip.textContent = text;
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    // Centrée au-dessus du bouton, gardée dans la fenêtre ; dessous s'il n'y a pas la place.
    const left = Math.min(Math.max(4, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 4);
    const below = r.top - t.height - 8 < 4;
    tip.classList.toggle('below', below);
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? r.bottom + 8 : r.top - t.height - 8}px`;
    tip.style.setProperty('--arrow-x', `${r.left + r.width / 2 - left}px`);
  }
  const hideTip = () => { tip.style.display = 'none'; };
  window.addEventListener('scroll', hideTip, true);

  // Raccourci "ouvrir un fichier" de l'éditeur choisi, pour l'infobulle après copie.
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function pasteHint() {
    const quick = MAC ? '⌘P' : 'Ctrl+P';
    const jb = MAC ? '⌘⇧O' : 'Ctrl+Shift+N';
    const paste = MAC ? '⌘V' : 'Ctrl+V';
    const keys: Partial<Record<Config['ide'], string>> = {
      vscode: quick, insiders: quick, cursor: quick, windsurf: quick, vscodium: quick, zed: quick,
      androidstudio: jb, jetbrains: jb, xcode: '⌘⇧O',
    };
    const k = keys[cfg.ide];
    return k ? `Chemin copié. ${k} dans ${EDITOR_NAMES[cfg.ide]}, puis ${paste}` : 'Chemin copié';
  }



  function decorateThreads() {
    for (const a of threadLinks(document)) {
      const h2 = a.closest('h2');
      if (!h2 || h2.querySelector('.gh2ide-copy')) continue;
      const rel = safeRel(clean(a.textContent));
      if (!rel) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gh2ide-copy';
      b.setAttribute('aria-label', 'Copier le chemin du fichier');
      b.innerHTML = COPY_ICON + CHECK_ICON;
      let timer: ReturnType<typeof setTimeout> | undefined;
      b.setAttribute('aria-describedby', 'gh2ide-tip');
      const tipFor = () => showTip(b, b.classList.contains('done') ? pasteHint() : 'Copier le chemin');
      b.addEventListener('mouseenter', tipFor);
      b.addEventListener('focus', tipFor);
      b.addEventListener('mouseleave', () => { if (document.activeElement !== b) hideTip(); });
      b.addEventListener('blur', hideTip);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyText(rel);
        // Retour visuel comme le bouton natif de GitHub : coche verte pendant 2 s.
        // Relance l'animation même si on reclique pendant l'état "copié".
        b.classList.remove('done');
        void b.offsetWidth;
        b.classList.add('done');
        showTip(b, pasteHint());
        clearTimeout(timer);
        timer = setTimeout(() => { b.classList.remove('done'); if (b.matches(':hover') || document.activeElement === b) showTip(b, 'Copier le chemin'); else hideTip(); }, 2000);
      });
      h2.appendChild(b);
    }
  }
  let decoPending = false;
  new MutationObserver(() => {
    if (decoPending) return;
    decoPending = true;
    requestAnimationFrame(() => { decoPending = false; decorateThreads(); });
  }).observe(document.body, { childList: true, subtree: true });
  decorateThreads();

  // Alt+click on a diff line → open that line. Alt+click on a file name → open the file.
  document.addEventListener('click', (e) => {
    if (!e.altKey) return;
    const cell = cellFor(e.target);
    if (cell && filePathFor(cell)) {
      e.preventDefault();
      e.stopPropagation();
      openFor(cell);
      return;
    }
    const header = (e.target as Element).closest('h2, h3, .file-header, .file-info');
    if (header && filePathFor(header)) {
      e.preventDefault();
      e.stopPropagation();
      const isThread = header.tagName === 'H2' && threadLinks(header).length > 0;
      openFor(header, isThread ? threadHeaderLine(header) : 1);
    }
  }, true);
  },
});
