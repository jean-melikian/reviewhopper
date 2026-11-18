# ReviewHopper - notes de passation

Extension Chrome (Manifest V3, JS vanilla, aucun build) qui, sur une page de diff GitHub
(PR « Files changed » / « Changes », commit), ouvre le fichier + la ligne dans l'IDE local.
Éditeur par défaut : **VS Code** (`DEFAULTS.ide` dans `shared.js`). Android Studio / JetBrains via `idea://` (testé sur macOS), les autres via leur schéma d'URL.

Nom public : **ReviewHopper** (choisi le 2026-11-17 : `gh2ide` est déjà pris par le paquet npm de justinloveless/github-to-ide, même usage). Le préfixe technique `gh2ide` (ids CSS, `GH2IDE`, `data-gh2ide-*`) est volontairement conservé ; le dossier s'appelle encore `gh-pr-to-ide` (le renommer change l'ID de l'extension non empaquetée et perd les réglages).

## Fichiers

| Fichier | Rôle |
|---|---|
| `manifest.json` | MV3. Content script sur `https://github.com/*`, `host_permissions` localhost/127.0.0.1, page d'options, service worker. |
| `shared.js` | Logique commune (chargée avant `content.js` et `options.js`, expose `globalThis.GH2IDE`) : `DEFAULTS`, résolution du dossier local (`resolveRoot`, `~` via `home`), construction du lien (`ideUrl`), parsing des correspondances, validation des chemins. |
| `content.js` | Détection fichier/ligne, bouton ↗ au survol, Alt+clic, toasts. |
| `content.css` | Style du bouton flottant `#gh2ide-btn` et du toast `#gh2ide-toast`. |
| `background.js` | Ouvre les options (install / clic sur l'icône) ; fait les `fetch` vers le serveur local de l'IDE (messages `http` et `httpTry`). |
| `options.html` / `options.js` | Réglages dans `chrome.storage.sync` : `ide`, `template`, `baseDir`, `mappings`, `home`, `hoverButton`, `jbPort`. Enregistrement automatique (400 ms), correspondances en tableau (sérialisées en texte `owner/repo = /chemin`, lignes `#` conservées, lignes au chemin invalide non enregistrées), validation des chemins, zone "Tester" (URL GitHub ou `owner/repo/chemin:ligne` → dossier, lien, bouton Ouvrir), mode sombre. |
| `helpers/xcode/install.sh` | Installe / désinstalle l'app relais Xcode (`--uninstall`). `REVIEWHOPPER_APP` change l'emplacement, `REVIEWHOPPER_NO_REGISTER=1` construit sans enregistrer. |
| `icons/` | Logo : bulle de commentaire de review avec lignes de diff (+, -, contexte) et pastille ↗ (saut vers l'IDE). Sources `icons/src/logo.svg` (32/48/128) et `logo-small.svg` (16, simplifié). PNG rendus avec Chrome headless (`--screenshot`, `--default-background-color=00000000`) d'une page contenant le SVG en `<img>`. |

Installation : `chrome://extensions` → Mode développeur → « Charger l'extension non empaquetée » → ce dossier.
Après modif : bouton ↻ sur la carte de l'extension **et** recharger l'onglet GitHub.

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

## Onglet Conversation : fils de review (relevé le 2026-11-17 sur une PR privée)

- Fil = `<article class="container__…">` (imbriqué dans `article#pullrequestreview-<id>`, qui peut
  contenir plusieurs fils → on ne prend le chemin que si tous les liens de l'article concordent).
- En-tête : `<h2><a href="/<o>/<r>/pull/<n>/changes#r<id>">‎<chemin>‎</a><span>Line 122</span></h2>`
  (sélecteur `THREAD_LINK = 'h2 a[href*="#r"]'`, U+200E à nettoyer). Plage : "Lines X to Y" → on prend Y.
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

- VS Code / Insiders / Cursor / Windsurf / VSCodium / Zed : `<scheme>://file/<abs>:<line>:<col>`,
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
- **Distribution Homebrew** : dépôts publics `jean-melikian/reviewhopper` (tag `v0.1.0`) et `jean-melikian/homebrew-tap`,
  cask `Casks/reviewhopper-xcode.rb` : `installer script` lance `install.sh` depuis l'archive du tag, `uninstall script`
  avec `--uninstall`. L'app est construite sur la machine, donc pas de quarantaine Gatekeeper. Une **formule** a été
  essayée puis abandonnée : le bac à sable de `post_install` fait échouer `lsregister` (-10822). Nouvelle version :
  tag + release, puis `version` et `sha256` (archive `archive/refs/tags/vX.tar.gz`) dans le cask.
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
  `ideUrl()` (`shared.js`) l'utilise dès qu'une racine locale est connue (`baseDir`/`mappings`) ; l'API HTTP
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
