import './style.css';
import { DEFAULTS, localRoot, ideUrl, type Config } from '@/utils/ide';
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
        const links = [...p.querySelectorAll(THREAD_LINK)];
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
      if (side === 'right') return { line: own, approx: false };
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

  function openUrl(url: string) {
    if (/^https?:\/\//i.test(url)) {
      browser.runtime.sendMessage({ type: 'http', url }).then((res: any) => {
        if (!res || !res.ok) {
          toast(`IDE injoignable (${res?.status || res?.error || 'pas de réponse'}). L'IDE est-il lancé ? Vérifier l'URL du modèle personnalisé.`);
        }
      });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openFor(el: Element, forcedLine?: number) {
    const repoI = repoInfo();
    const rel = filePathFor(el);
    if (!repoI || !rel) {
      toast('Impossible de trouver le chemin du fichier sur cette page.');
      return;
    }
    let line: number | undefined = forcedLine;
    let approx = false;
    if (line == null) {
      const cell = cellFor(el);
      if (!cell) return;
      ({ line, approx } = lineFor(cell));
    }
    if (!line || Number.isNaN(line)) line = 1;

    const root = localRoot(cfg, repoI.owner, repoI.repo);
    if (!root && cfg.ide === 'jetbrains') {
      openJetBrainsHttp({ rel, line, approx });
      return;
    }
    if (!root) {
      const name = `${repoI.owner}/${repoI.repo}`.replace(/[<>&"']/g, '');
      toast(`Aucun dossier local configuré pour ${name}. <a data-gh2ide-options>Configurer</a>`, true);
      return;
    }
    const url = ideUrl(cfg, { root, rel, line, ...repoI });
    if (!url) {
      toast('Modèle d\'URL personnalisé vide. <a data-gh2ide-options>Configurer</a>', true);
      return;
    }
    openUrl(url);
    toast(`${approx ? '⚠︎ Ligne supprimée, position approximative · ' : ''}${rel}:${line}`);
  }

  // IntelliJ & co sans dossier local : serveur intégré de l'IDE, chemin relatif aux projets ouverts.
  function openJetBrainsHttp({ rel, line, approx }: { rel: string; line: number; approx: boolean }) {
    const port = /^\d+$/.test(cfg.jbPort || '') ? cfg.jbPort : '63342';
    const q = (file: string) => `http://localhost:${port}/api/file?file=${encodeURIComponent(file)}&line=${line}&column=1`;
    const urls = [];
    const parts = rel.split('/');
    for (let i = 0; i < parts.length - 1; i++) urls.push(q(parts.slice(i).join('/')));
    browser.runtime.sendMessage({ type: 'httpTry', urls }).then((res: any) => {
      if (res && res.ok) {
        toast(`${approx ? '⚠︎ Ligne supprimée, position approximative · ' : ''}${rel}:${line}`);
      } else if (res && res.status === 404) {
        toast('Aucun dossier local configuré pour ce dépôt. <a data-gh2ide-options>Configurer</a>', true);
      } else {
        toast(`IDE injoignable (${res?.status || res?.error || 'pas de réponse'}). L'IDE est-il lancé ? Vérifier le port et "Allow unsigned requests" (Settings › Tools › Web Browsers and Preview), ou configurer le dossier local du dépôt.`);
      }
    });
  }

  // ---------- UI ----------

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function toast(msg: string, html = false) {
    let t = document.getElementById('gh2ide-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gh2ide-toast';
      t.addEventListener('click', (e) => {
        if ((e.target as Element | null)?.closest('[data-gh2ide-options]')) browser.runtime.sendMessage({ type: 'options' });
      });
      document.body.appendChild(t);
    }
    if (html) t.innerHTML = msg;
    else t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t!.style.display = 'none'), html ? 6000 : 2500);
  }

  const btn = document.createElement('button');
  btn.id = 'gh2ide-btn';
  btn.type = 'button';
  btn.textContent = '↗';
  btn.title = 'Ouvrir dans l\'IDE (ou Alt+clic sur la ligne)';
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
  function showTip(el: Element, text: string) {
    tip.textContent = text;
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(4, r.left + r.width / 2 - t.width / 2)}px`;
    tip.style.top = `${r.top - t.height - 8}px`;
  }
  const hideTip = () => { tip.style.display = 'none'; };
  window.addEventListener('scroll', hideTip, true);

  // Raccourci "ouvrir un fichier" de l'éditeur choisi, pour l'infobulle après copie.
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function pasteHint() {
    const quick = MAC ? '⌘P' : 'Ctrl+P';
    const jb = MAC ? '⌘⇧O' : 'Ctrl+Shift+N';
    const hints: Record<string, [string, string]> = {
      vscode: [quick, 'VS Code'], insiders: [quick, 'VS Code Insiders'], cursor: [quick, 'Cursor'],
      windsurf: [quick, 'Windsurf'], vscodium: [quick, 'VSCodium'], zed: [quick, 'Zed'],
      androidstudio: [jb, 'Android Studio'], jetbrains: [jb, "l'IDE JetBrains"], xcode: ['⌘⇧O', 'Xcode'],
    };
    const h = hints[cfg.ide];
    return h ? `Copié ! ${h[0]} dans ${h[1]} puis coller` : 'Copié !';
  }


  function decorateThreads() {
    for (const a of document.querySelectorAll(THREAD_LINK)) {
      const h2 = a.closest('h2');
      if (!h2 || h2.querySelector('.gh2ide-copy')) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gh2ide-copy';
      b.setAttribute('aria-label', 'Copier le chemin du fichier');
      b.innerHTML = COPY_ICON + CHECK_ICON;
      let timer: ReturnType<typeof setTimeout> | undefined;
      b.addEventListener('mouseenter', () => showTip(b, b.classList.contains('done') ? pasteHint() : 'Copier le chemin'));
      b.addEventListener('mouseleave', hideTip);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rel = clean(a.textContent);
        copyText(rel);
        // Retour visuel comme le bouton natif de GitHub : coche verte pendant 2 s.
        // Relance l'animation même si on reclique pendant l'état "copié".
        b.classList.remove('done');
        void b.offsetWidth;
        b.classList.add('done');
        showTip(b, pasteHint());
        clearTimeout(timer);
        timer = setTimeout(() => { b.classList.remove('done'); if (b.matches(':hover')) showTip(b, 'Copier le chemin'); else hideTip(); }, 2000);
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
      const isThread = header.tagName === 'H2' && header.querySelector(THREAD_LINK);
      openFor(header, isThread ? threadHeaderLine(header) : 1);
    }
  }, true);
  },
});
