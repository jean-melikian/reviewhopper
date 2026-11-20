# ReviewHopper

[English](README.md) | **Français**

Extension navigateur qui ouvre dans l'éditeur local le fichier et la ligne d'une review GitHub : diff de PR, commit, commentaires de review.

- Bouton **↗** au survol d'une ligne du diff, ou Alt+clic (⌥+clic sur Mac).
- Onglets **Files changed** et **Conversation** d'une PR, pages de commit.
- Éditeurs : VS Code, VS Code Insiders, Cursor, Windsurf, VSCodium, Zed, Android Studio, IntelliJ et autres IDE JetBrains, Xcode, ou modèle d'URL personnalisé.
- Navigateurs : Chrome, Edge, Brave, Arc, Dia, Vivaldi, Opera (famille Chromium) ; Firefox, Zen (famille Firefox).

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Utilisation](#utilisation)
- [Réglages](#réglages)
- [Dépannage](#dépannage)
- [Build depuis les sources](#build-depuis-les-sources)
- [Publier une version](#publier-une-version)
- [Licence](#licence)

## Démarrage rapide

### 1. Télécharger l'extension

Sur la page [Releases](https://github.com/jean-melikian/reviewhopper/releases/latest), télécharger **un seul** fichier, selon le navigateur :

| Navigateur | Fichier |
|---|---|
| Chrome, Edge, Brave, Arc, Dia, Vivaldi, Opera | `reviewhopper-<version>-chrome.zip` |
| Firefox, Zen | `reviewhopper-<version>-firefox.zip` |

Le fichier `-sources.zip` ne sert qu'à la revue de Mozilla.

### 2. L'ajouter au navigateur

**Famille Chromium**

1. Décompresser le zip (double-clic sur macOS) et ranger le dossier obtenu à un endroit où il restera, par exemple `~/Applications/ReviewHopper`. Le navigateur charge l'extension depuis ce dossier : s'il est supprimé ou déplacé, l'extension disparaît.
2. Ouvrir la page des extensions : `chrome://extensions` (Chrome, Arc, Dia), `edge://extensions`, `brave://extensions`, `vivaldi://extensions` ou `opera://extensions`.
3. Activer le **Mode développeur**.
4. Cliquer sur **Charger l'extension non empaquetée** et choisir le dossier décompressé.

**Famille Firefox**

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer sur **Charger un module complémentaire temporaire** et choisir le zip téléchargé, sans le décompresser.

Tant que l'extension n'est pas publiée sur addons.mozilla.org, Firefox la retire à chaque redémarrage : il faut la recharger de la même façon.

### 3. Choisir l'éditeur

La page de réglages s'ouvre après l'installation (sinon, cliquer sur l'icône de l'extension).

1. Choisir l'éditeur.
2. Indiquer où se trouvent les clones locaux (voir [Réglages](#réglages)).

Selon l'éditeur, il reste ou non quelque chose à installer :

| Éditeur | À installer en plus |
|---|---|
| VS Code, VS Code Insiders, Cursor, Windsurf, VSCodium, Zed | Rien |
| Android Studio, IntelliJ et autres IDE JetBrains | Rien : l'IDE gère déjà les liens `idea://` |
| Xcode | L'app relais : [étape 4](#4-xcode-uniquement--lapp-relais) |

Au premier clic, le navigateur demande l'autorisation d'ouvrir l'éditeur : cocher "Toujours autoriser".

### 4. Xcode uniquement : l'app relais

**À ne faire que si l'éditeur choisi est Xcode.** Les autres éditeurs n'en ont pas besoin.

Xcode n'a pas de lien pour ouvrir un fichier à une ligne précise. Une petite app relais reçoit les liens `reviewhopper-xcode://` de l'extension et lance `xed --line`. Elle est construite sur la machine et ne tourne que le temps d'ouvrir le fichier. Prérequis : macOS, Xcode et [Homebrew](https://brew.sh).

```bash
brew install --cask jean-melikian/tap/reviewhopper-xcode
```

- Mettre à jour : `brew upgrade --cask reviewhopper-xcode`
- Désinstaller : `brew uninstall --cask reviewhopper-xcode`
- Sans Homebrew, depuis un clone du dépôt : `bash helpers/xcode/install.sh` (désinstaller : `bash helpers/xcode/install.sh --uninstall`)

### Mettre à jour l'extension

- **Chromium** : remplacer le contenu du dossier de l'étape 2 par celui du nouveau zip, cliquer sur ↻ sur la carte de l'extension, puis recharger les onglets GitHub. Garder le même dossier conserve les réglages : charger un autre dossier crée une nouvelle extension, sans réglages.
- **Firefox** : charger le nouveau zip comme à l'étape 2.

## Utilisation

- Onglet **Files changed** d'une PR ou page de commit : survoler une ligne puis cliquer sur **↗**, ou Alt+clic (⌥+clic sur Mac) sur la ligne.
- Alt+clic sur le nom d'un fichier : ouvre le fichier à la ligne 1.
- Onglet **Conversation** : même chose sur l'extrait de code d'un commentaire de review. Alt+clic sur le nom du fichier ouvre la ligne commentée.
- Bouton de copie à côté du nom du fichier (onglet Conversation) : copie le chemin du fichier, à coller dans la recherche de fichiers de l'éditeur (⌘⇧O dans Xcode et Android Studio, ⌘P dans VS Code).

La ligne ouverte est celle de la **nouvelle version** du fichier (branche de la PR). Pour une ligne supprimée, l'extension ouvre la ligne la plus proche et le signale.

## Réglages

Enregistrés automatiquement.

1. **Éditeur** : voir le tableau de l'[étape 3](#3-choisir-léditeur).
2. **Emplacement des dépôts** : un dossier par dépôt (`owner/repo` et son chemin absolu), et/ou un dossier par défaut (`/Users/moi/dev/{repo}`). `~` est accepté une fois le dossier personnel renseigné.
3. **Tester** : coller une URL de fichier GitHub (`https://github.com/acme/app/blob/main/src/App.kt#L42`) pour voir le chemin résolu et l'ouvrir.
4. **Affichage** : bouton ↗ au survol, ou Alt+clic uniquement.

## Dépannage

**Le bouton ↗ n'apparaît pas**
- Recharger l'onglet GitHub : les onglets ouverts avant l'installation ne sont pas pris en compte.
- Vérifier dans les réglages que "Afficher le bouton ↗ au survol des lignes" est coché. Alt+clic marche dans tous les cas.

**"Aucun dossier local configuré pour owner/repo"**
- Ajouter le dépôt dans les réglages, ou renseigner un dossier par défaut.

**Rien ne s'ouvre au clic**
- Le navigateur a pu bloquer le lien : cliquer à nouveau et autoriser l'ouverture.
- Android Studio / JetBrains : lancer l'IDE une fois pour qu'il enregistre les liens `idea://`.
- Xcode : vérifier que l'app relais est installée. Cette commande doit afficher son emplacement, sinon l'installer ([étape 4](#4-xcode-uniquement--lapp-relais)) :

  ```bash
  mdfind "kMDItemCFBundleIdentifier == 'com.reviewhopper.xcode'"
  ```

- Utiliser la zone **Tester** des réglages pour vérifier le dossier et le lien générés.

**Le fichier s'ouvre à une ligne décalée, ou est introuvable**
- Le clone local doit être sur la branche de la PR : la ligne indiquée est celle de la nouvelle version du fichier.
- Vérifier le dossier associé au dépôt avec la zone **Tester** des réglages.

**"ReviewHopper a été mis à jour : recharger la page"**
- L'extension a été rechargée ou mise à jour pendant que l'onglet était ouvert : recharger l'onglet GitHub.

**"Chemin de fichier refusé"**
- Le chemin lu dans la page contient `..`, un chemin absolu ou des caractères invalides : l'extension refuse de l'ouvrir, par sécurité.

**Xcode : notification "Fichier téléchargé refusé"**
- L'app relais refuse les fichiers téléchargés (marqués en quarantaine par macOS), pour qu'un site ne puisse pas faire ouvrir un fichier piégé. Travailler sur un dépôt récupéré avec `git clone`, pas sur une archive téléchargée.

**IntelliJ / JetBrains : "IDE injoignable"**
- Configurer le dossier local du dépôt : l'extension passe alors par les liens `idea://`, sans serveur.
- Sinon, dans l'IDE : Settings, Tools, Web Browsers and Preview, Built-in Server : port 63342 et "Allow unsigned requests" coché.

**Firefox : l'extension a disparu**
- Normal après un redémarrage tant qu'elle n'est pas sur addons.mozilla.org : la recharger (étape 2).

## Build depuis les sources

Prérequis : Node.js 22 ou plus récent.

```bash
git clone https://github.com/jean-melikian/reviewhopper.git
cd reviewhopper
npm install
npm run build          # Chromium : .output/chrome-mv3
npm run build:firefox  # Firefox : .output/firefox-mv3
```

Charger ensuite le dossier `.output/chrome-mv3` (Chromium) ou le fichier `.output/firefox-mv3/manifest.json` (Firefox) comme à l'[étape 2](#2-lajouter-au-navigateur).

Autres commandes :

- `npm run dev` / `npm run dev:firefox` : navigateur de test avec rechargement automatique.
- `npm run compile` : vérification TypeScript.
- `npm run zip` / `npm run zip:firefox` : archives des stores (Chrome Web Store, Edge Add-ons, addons.mozilla.org), plus l'archive des sources demandée par Mozilla.

## Publier une version

1. Mettre la nouvelle version dans `package.json` (ex. `1.3.0`) et committer.
2. Pousser le tag correspondant :

   ```bash
   git tag v1.3.0 && git push origin v1.3.0
   ```

3. Le workflow `Release` vérifie que le tag et `package.json` concordent, construit, lint le build Firefox, puis crée la release GitHub avec les zips Chrome, Firefox et sources (plus `SHA256SUMS.txt`).
4. Si `helpers/xcode/` a changé : reporter dans le cask (`jean-melikian/homebrew-tap`, `Casks/reviewhopper-xcode.rb`) les `version` et `sha256` affichés dans le résumé du workflow.

Le workflow `CI` vérifie les types et les deux builds à chaque push sur `main` et à chaque PR.

## Licence

[MIT](LICENSE)

Pour signaler une faille de sécurité, voir [SECURITY.md](SECURITY.md) (en anglais ou en français).
