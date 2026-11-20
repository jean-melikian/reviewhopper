# ReviewHopper - notes de passation

Extension navigateur (Manifest V3, TypeScript, [WXT](https://wxt.dev) 0.21) qui, sur une page de diff GitHub
(PR « Files changed » / « Changes », commit), ouvre le fichier + la ligne dans l'IDE local.
Éditeur par défaut : **VS Code** (`DEFAULTS.ide` dans `utils/ide.ts`). Android Studio / JetBrains via `idea://` (testé sur macOS), les autres via leur schéma d'URL.

Nom public : **ReviewHopper** (choisi le 2026-11-17 : `gh2ide` est déjà pris par le paquet npm de justinloveless/github-to-ide, même usage). Le préfixe technique `gh2ide` (ids CSS, `data-gh2ide-*`) est volontairement conservé. Depuis WXT (2026-11-18), l'extension se charge depuis `.output/chrome-mv3` : l'ID non empaqueté a changé une fois (réglages à ressaisir).

## Fichiers

| Fichier | Rôle |
|---|---|
| `wxt.config.ts` | Manifest (généré par WXT) : permissions, `host_permissions` localhost/127.0.0.1, icônes ; MV3 forcé pour Firefox (WXT vise MV2 par défaut) avec `browser_specific_settings.gecko` (id `reviewhopper@jean-melikian.github.io`, Firefox 140+, `data_collection_permissions: none` exigé par AMO). |
| `utils/ide.ts` | Logique commune (modules importés par le content script et les options) : `DEFAULTS`, types `Config`, résolution du dossier local (`resolveRoot`, `~` via `home`), construction du lien (`ideUrl`), parsing des correspondances, validation des chemins. |
| `utils/config.ts` | `loadConfig` (storage.sync complété par `DEFAULTS`) / `saveConfig`. |
| `entrypoints/content/` | `index.ts` : détection fichier/ligne, bouton ↗ au survol, Alt+clic, toasts, bouton de copie. Toasts construits en DOM (pas d'innerHTML) : `ok`/`warn`/`err` (4/7/9 s, pause au survol, ✕, Échap, `role=alert` pour les erreurs), action "Indiquer le dossier" qui ouvre `options.html#add=owner/repo` (ligne préremplie, focus sur le dossier). Lien de schéma : si la fenêtre ne perd pas le focus dans les 2 s, piste "Rien ne s'ouvre ?" propre à l'éditeur (heuristique, l'ouverture d'une app fait perdre le focus). `style.css` : styles injectés sur GitHub. |
| `entrypoints/background.ts` | Ouvre les options (install / clic sur l'icône) ; fait les `fetch` vers le serveur local de l'IDE (messages `http` et `httpTry`). Service worker sur Chromium, script d'arrière-plan sur Firefox (géré par WXT). |
| `entrypoints/options/` | `index.html` + `main.ts`. Réglages dans `storage.sync` : `ide`, `template`, `baseDir`, `mappings`, `home`, `hoverButton`, `jbPort`. Enregistrement automatique (400 ms), correspondances en tableau (sérialisées en texte `owner/repo = /chemin`, lignes `#` conservées, lignes au chemin invalide non enregistrées), validation des chemins, zone "Tester", mode sombre. |
| `helpers/xcode/install.sh` | Installe / désinstalle l'app relais Xcode (`--uninstall`). `REVIEWHOPPER_APP` change l'emplacement, `REVIEWHOPPER_NO_REGISTER=1` construit sans enregistrer. |
| `scripts/screenshots/` | `npm run screenshots` : captures du README (`docs/screenshots/`, clair et sombre) via Chrome headless + CDP (`cdp.mjs`). Diff : PR publique #1 sans connexion, donc **ancienne UI, pas la preview** (la preview exige la session de l'utilisateur), content script construit injecté avec un faux `chrome`. Réglages : `options.html` servie en local. GitHub renvoie parfois sa page "Unicorn" : `gotoDiff` recharge. `window.chrome` ne s'assigne pas en headless : `Object.defineProperty`. |
| `public/icons/`, `icons/src/` | Logo : bulle de commentaire de review avec lignes de diff (+, -, contexte) et pastille ↗ (saut vers l'IDE). Sources `icons/src/logo.svg` (32/48/128) et `logo-small.svg` (16, simplifié). PNG rendus avec Chrome headless (`--screenshot`, `--default-background-color=00000000`) d'une page contenant le SVG en `<img>`. |

Build : `npm run build` (Chromium : Chrome, Edge, Brave, Arc, Dia, Vivaldi) et `npm run build:firefox` (Firefox, Zen). Charger `.output/chrome-mv3` (non empaquetée) ou `.output/firefox-mv3/manifest.json` (about:debugging, temporaire). `npm run dev` recharge à chaud. API : `browser` de WXT (promesses), jamais `chrome.*` ni de callback (`sendMessage(...).then`), sinon Firefox casse.
Vérifié après migration (2026-11-18) : `tsc` sans erreur, builds Chrome et Firefox MV3, page de test reproduisant le DOM GitHub (lignes 660/661/14, copie, réglages). **Pas encore chargé dans un vrai Chrome ni Firefox.** `web-ext lint` non lancé (installation refusée en mode auto).

## Interaction

- Survol d'une ligne du diff → bouton **↗** positionné en `position: fixed` juste à gauche de la cellule
  du numéro de ligne (`left = rect.left - 20`). Il est ajouté à `document.body`, pas dans l'arbre React
  de GitHub (sinon React l'efface).
- **Alt+clic** sur une ligne → ouvre la ligne. Alt+clic sur le nom du fichier (`h3`) → ligne 1.
- La ligne ouverte = numéro dans la **nouvelle** version du fichier (branche de la PR).
  Ligne supprimée → ligne la plus proche côté droit, toast « position approximative ».

## DOM GitHub (relevé le 2026-11-17 sur une PR publique, nouvelle UI React, vue split)

- URL `…/pull/N/files` redirige vers `…/pull/N/changes`.
- Conteneur d'un fichier : `div#diff-<sha256(path)>` (64 hex). Regex utilisée : `/^diff-[0-9a-f]{64}$/`.
- Chemin du fichier : `[data-file-path]` (un `button`) dans ce conteneur ; fallback `h3 code`
  (le texte est entouré de U+200E, à nettoyer).
- Le `<table>` porte `data-diff-anchor="diff-<sha>"`.
- Cellules numéro : `td[data-line-number][data-diff-side="left|right"]`, classe `new-diff-line-number`.
  **Les cellules de code ont AUSSI `data-line-number`** (classe `diff-text-cell`) → sélecteur
  `LINE_CELL = 'td[data-line-number]:not(.diff-text-cell)'`.
- `data-diff-line-key` ex. `b:254-l:254-r:253` : sur une ligne **supprimée** côté gauche, `r:` est la
  ligne précédente du nouveau fichier, pas la ligne elle-même → ne pas s'y fier seul.
- Ligne inchangée : la cellule gauche a la classe `diff-line-number-neutral` → `r:` du key est exact.
- GitHub affiche son propre bouton « + » (commentaire) au survol, au bord droit de la cellule numéro.
- Ancienne UI (non revérifiée, gardée en fallback) : `.file[data-tagsearch-path]`,
  `.file-header[data-path]`, `td.blob-num[data-line-number]`, `blob-num-deletion`, `data-split-side`.
- Vue unifiée de la nouvelle UI : **pas testée** (basculer de vue change la préférence du compte GitHub).
- **Diff en grille hors preview** (relevé le 2026-11-20 sur une page de commit, sans connexion) : la structure
  ci-dessus vient de la preview "nouvelle PR overview" du compte. Sans preview, les numéros sont dans
  `td.diff-line-number` **sans** `data-line-number` ni `data-diff-side` (`GRID_CELL`, `gridCellLine`).
  Unifiée : `[ancien, nouveau, texte]` ; split : `[ancien, texte, nouveau, texte]` ; le numéro du nouveau fichier est
  la cellule juste avant `td.right-side-diff-cell`. Vide = ligne supprimée (ligne la plus proche, approx).
  Vérifié en unifiée sur la vraie page (extension injectée dans Chrome headless) ; split non vérifiée (GitHub
  renvoyait sa page d'erreur). Le code de la preview n'est pas touché (sélecteur exclusif).

## Onglet Conversation : fils de review (relevé le 2026-11-17 sur une PR privée)

- Fil = `<article class="container__…">` (imbriqué dans `article#pullrequestreview-<id>`, qui peut
  contenir plusieurs fils → on ne prend le chemin que si tous les liens de l'article concordent).
- En-tête : `<h2><a href="/<o>/<r>/pull/<n>/changes#r<id>">‎<chemin>‎</a><span>Line 122</span></h2>`
  (sélecteur `THREAD_LINK = 'h2 a[href*="#r"]'`, U+200E à nettoyer). Plage : "Lines X to Y" → on prend Y.
  Sécurité (2026-11-20) : `isThreadLink` n'accepte qu'un href `/pull/<n>/(changes|files)#r<id>` hors de
  `.markdown-body`/`.comment-body` (sinon un `## [../../x](#r1)` dans un commentaire passait pour un en-tête), et
  `safeRel` (`utils/ide.ts`) refuse `..`, `.`, segments vides, chemin absolu, `\\` et caractères de contrôle, à l'ouverture
  comme à la copie.
- Snippet : `div[class*=StaticDiffPreview] table`, vue unifiée, numéros dans `td[class*=diffLineNumber] > code`.
  Une colonne, ou **deux (ancien, nouveau)** : vu sur une ligne de contexte "641 660" → on prend la
  dernière (nouveau fichier). Type de ligne via `code[class*=Addition|Deletion|…Line]`, ou colonne
  "nouveau" vide. Ligne supprimée → ligne non supprimée la plus proche (approx).
- Alt+clic sur l'en-tête `h2` → ligne commentée ; survol / Alt+clic sur une ligne du snippet → cette ligne.
- Bouton `.gh2ide-copy` ajouté dans chaque `h2` de fil (`decorateThreads`, relancé par un MutationObserver
  regroupé par frame) : copie le **chemin seul**. Ajouter `:ligne` a été abandonné : Go to File d'Android
  Studio (⌘⇧O) refuse `chemin:ligne` et `Fichier.kt:ligne` (constaté), et passer par ⌘L ensuite a été
  jugé inacceptable. Infobulle après copie : raccourci de l'éditeur choisi (`pasteHint`). Le bouton de copie a été le palliatif pour Xcode avant l'app relais (voir Ouverture dans l'IDE).
- Testé sur une page reproduisant ce DOM (pas encore sur GitHub réel). Ligne de contexte : numéro
  supposé = nouveau fichier, non vérifié.

## Ouverture dans l'IDE

- VS Code / Insiders / Cursor / Windsurf / VSCodium / Zed : `<scheme>://file/<abs>:<line>:<col>` (chaque segment encodé
  avec `encodeURIComponent`, sinon `#`/`?` tronquent le chemin ; `C:` gardé),
  ouvert via un `<a>` cliqué depuis le content script. Nécessite `baseDir` ou `mappings`.
- **Android Studio / JetBrains** avec dossier local : `idea://open?file=<abs>&line=<n>` (voir État).
  Sans dossier : Android Studio → toast "Configurer" ; `jetbrains` → ancien fallback serveur intégré
  (`openJetBrainsHttp`, chemins relatifs uniquement). Historique du serveur intégré :
  `GET http://localhost:<jbPort>/api/file?file=<path>&line=<n>&column=1`, appelé depuis le service
  worker. `openJetBrains()` envoie une liste d'URL candidates (message `httpTry`) essayées dans l'ordre
  jusqu'à une réponse 2xx (404 → candidate suivante) :
  1. chemin absolu `<root>/<rel>` si `baseDir`/`mappings` donne une racine ;
  2. `rel` (relatif aux projets ouverts) ;
  3. suffixes de `rel` de plus en plus courts (projet ouvert sur un sous-dossier du dépôt).
- **Xcode** : aucun lien profond fichier+ligne (`xcode://open?file=…&line=` ne fait rien, testé sur Xcode
  27.2). App relais `helpers/xcode/install.sh` → `~/Applications/ReviewHopper Xcode.app` : applet AppleScript
  (`on open location`) + `Contents/Resources/open.sh` qui décode l'URL, n'accepte qu'un chemin absolu vers
  un fichier existant et une ligne numérique, puis `exec xed --line`. Info.plist : `CFBundleURLTypes`
  `reviewhopper-xcode`, `LSUIElement`, re-signature ad hoc, `lsregister -f`. Lien :
  `reviewhopper-xcode://open?file=<abs encodé>&line=<n>` (validé : chemin avec espace et accents, ligne 30).
  N'importe quel site peut appeler ce schéma : `open.sh` refuse aussi les `%` mal formés et les `\\` (décodage `printf %b`)
  et les fichiers en quarantaine (téléchargés, ex. un `Package.swift` déposé par un site, que Xcode évaluerait).
  Notification via `osascript ... on run argv` (chemin en argument, pas dans le source AppleScript). Depuis v0.2.0.
- **Distribution Homebrew** : dépôts publics `jean-melikian/reviewhopper` (tag `v0.1.0`) et `jean-melikian/homebrew-tap`,
  cask `Casks/reviewhopper-xcode.rb` : `installer script` lance `install.sh` depuis l'archive du tag, `uninstall script`
  avec `--uninstall`. L'app est construite sur la machine, donc pas de quarantaine Gatekeeper. Une **formule** a été
  essayée puis abandonnée : le bac à sable de `post_install` fait échouer `lsregister` (-10822). Nouvelle version :
  tag + release, puis `version` et `sha256` (archive `archive/refs/tags/vX.tar.gz`) dans le cask.
- **GitHub Actions** (2026-11-20) : `ci.yml` (push main / PR : `compile`, deux builds, `web-ext lint`, `bash -n` du
  script Xcode) et `release.yml` (tag `v*` : échoue si le tag diffère de `package.json`, zips + `SHA256SUMS.txt` attachés
  à la release, `version`/`sha256` du cask dans le résumé du job). Le cask reste mis à jour à la main (pas de jeton
  vers `homebrew-tap`). Versions unifiées à partir de 1.2.0 : tag = version de l'extension (v0.1.0 n'avait que l'app Xcode).
- Modèle personnalisé : variables `{abs} {absUri} {absEnc} {rel} {root} {line} {line0} {col} {owner} {repo}` ;
  un modèle `http(s)://` est appelé via le service worker au lieu d'être ouvert.

## Serveur intégré JetBrains (fallback `jetbrains` sans dossier local uniquement)

Settings › Tools › **Web Browsers and Preview** › Built-in Server : port **63342** par défaut,
**Allow unsigned requests** coché. Inutile pour Android Studio (voir État).

## État (2026-11-17)

- **Android Studio Rabbit 2 (2026.2.2) n'expose pas `/api/file`** : toute URL `/api/file...` renvoie la
  même page 404 qu'un endpoint inexistant (`/api/foobar`), même pour un fichier présent dans le projet
  ouvert. `/api/about` répond 200. Inutile de creuser chemins absolus/relatifs.
- Solution retenue : Android Studio enregistre le schéma **`idea://`** (Info.plist). 
  `idea://open?file=<abs encodé>&line=<n>` ouvre le fichier à la ligne `n` (base 1, validé à la main).
  `ideUrl()` (`utils/ide.ts`) l'utilise dès qu'une racine locale est connue (`baseDir`/`mappings`) ; l'API HTTP
  reste en fallback sans racine (utile seulement pour d'autres IDE JetBrains).
- Validation via l'extension (clic ↗ sur une vraie PR) **pas encore faite**.

## À vérifier en premier

1. Depuis un terminal, avec Android Studio ouvert sur le dépôt, tester l'endpoint à la main :
   ```sh
   curl -i "http://localhost:63342/api/file?file=<chemin/relatif/au/repo>&line=10&column=1"
   curl -i "http://localhost:63342/api/file?file=<chemin/absolu>&line=10&column=1"
   ```
   Déterminer quelles formes Android Studio accepte (absolu ? relatif ? forme `/api/file/<path>:<line>`)
   et si la ligne est bien en base 1.
2. Si 403/refus : vérifier l'en-tête `Origin` (`chrome-extension://…`) que le serveur intégré peut rejeter
   malgré « Allow unsigned requests ».
3. Valider le décalage de ligne (base 0/1) sur une vraie PR.
4. Tester la vue unifiée de la nouvelle UI et l'onglet Conversation (snippets de review), non couverts.

## Pistes d'amélioration

- Raccourci clavier pour ouvrir la ligne sélectionnée / survolée.
- Support GitHub Enterprise (domaine configurable → `matches` + permission optionnelle).
- Pages `blob` (`/blob/<ref>/<path>#L10`).
- Si l'API HTTP pose problème : alternative Toolbox `jetbrains://studio/navigate/reference?project=…&path=…:<line0>`
  (Android Studio ne l'enregistre pas toujours).
