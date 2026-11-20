# ReviewHopper

Extension navigateur (Manifest V3) qui ouvre le fichier et la ligne d'un diff GitHub (PR, commit, commentaires de review) dans l'éditeur local.

## Installation

L'installation se fait en 3 étapes. La 4e ne concerne que Xcode.

### 1. Construire l'extension

Prérequis : Node.js 22 ou plus récent.

```bash
git clone https://github.com/jean-melikian/reviewhopper.git
cd reviewhopper
npm install
```

### 2. L'ajouter au navigateur

Choisir **une seule** des deux familles, selon le navigateur utilisé.

**Famille Chromium : Chrome, Edge, Brave, Arc, Dia, Vivaldi, Opera**

```bash
npm run build
```

1. Ouvrir la page des extensions : `chrome://extensions` (Chrome, Arc, Dia), `edge://extensions` (Edge), `brave://extensions` (Brave), `vivaldi://extensions` (Vivaldi), `opera://extensions` (Opera).
2. Activer le **Mode développeur**.
3. Cliquer sur **Charger l'extension non empaquetée** et choisir le dossier `.output/chrome-mv3`.

**Famille Firefox : Firefox, Zen**

```bash
npm run build:firefox
```

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer sur **Charger un module complémentaire temporaire** et choisir le fichier `.output/firefox-mv3/manifest.json`.

Firefox retire une extension temporaire à chaque redémarrage : il faut la recharger jusqu'à sa publication sur addons.mozilla.org.

### 3. Régler l'éditeur

La page de réglages s'ouvre après l'installation (sinon, cliquer sur l'icône de l'extension). Choisir l'éditeur et indiquer où se trouvent les clones locaux (voir [Réglages](#réglages)).

Pour la plupart des éditeurs, c'est terminé :

| Éditeur | À installer en plus |
|---|---|
| VS Code, VS Code Insiders, Cursor, Windsurf, VSCodium, Zed | Rien |
| Android Studio, IntelliJ et autres IDE JetBrains | Rien (l'IDE gère déjà les liens `idea://`) |
| Xcode | L'app relais, étape 4 |

Au premier clic, le navigateur demande l'autorisation d'ouvrir l'éditeur : cocher "Toujours autoriser".

### 4. Xcode uniquement : l'app relais

**À ne faire que si l'éditeur choisi est Xcode.** Les autres éditeurs n'en ont pas besoin.

Xcode n'a pas de lien pour ouvrir un fichier à une ligne précise. Une petite app relais, construite sur la machine, reçoit les liens `reviewhopper-xcode://` de l'extension et lance `xed --line`. Prérequis : macOS et Xcode installé.

```bash
brew install --cask jean-melikian/tap/reviewhopper-xcode
```

Elle s'installe dans `~/Applications/ReviewHopper Xcode.app` et ne tourne que le temps d'ouvrir un fichier.

- Mettre à jour : `brew upgrade --cask reviewhopper-xcode`
- Désinstaller : `brew uninstall --cask reviewhopper-xcode`
- Sans Homebrew, depuis le dossier cloné : `bash helpers/xcode/install.sh` (désinstaller : `bash helpers/xcode/install.sh --uninstall`)

## Développement

- `npm run dev` / `npm run dev:firefox` : navigateur de test avec rechargement automatique.
- `npm run compile` : vérification TypeScript.
- `npm run zip` / `npm run zip:firefox` : archives pour le Chrome Web Store, Edge Add-ons et addons.mozilla.org (plus l'archive des sources demandée par Mozilla, reconstruite avec `npm install` puis `npm run zip:firefox`).

### Publier une version

1. Mettre la nouvelle version dans `package.json` (ex. `1.3.0`) et committer.
2. Pousser le tag correspondant :

   ```bash
   git tag v1.3.0 && git push origin v1.3.0
   ```

3. Le workflow `Release` vérifie que le tag et `package.json` concordent, construit, lint le build Firefox, puis crée la release GitHub avec les zips Chrome, Firefox et sources (plus `SHA256SUMS.txt`).
4. Si `helpers/xcode/` a changé : reporter `version` et `sha256` affichés dans le résumé du workflow dans le cask (`jean-melikian/homebrew-tap`, `Casks/reviewhopper-xcode.rb`).

Le workflow `CI` vérifie les types et les deux builds à chaque push sur `main` et à chaque PR.

## Utilisation

- Onglet **Files changed** d'une PR ou page de commit : survoler une ligne puis cliquer sur le bouton **↗**, ou Alt+clic (⌥+clic sur Mac) sur la ligne.
- Alt+clic sur le nom d'un fichier : ouvre le fichier à la ligne 1.
- Onglet **Conversation** : même chose sur l'extrait de code d'un commentaire de review ; Alt+clic sur le nom du fichier ouvre la ligne commentée. Le bouton de copie à côté du nom du fichier copie le chemin du fichier (à coller dans la recherche de fichiers de l'éditeur, ex. Cmd+Shift+O dans Xcode ou Android Studio).

La ligne ouverte est celle de la **nouvelle version** du fichier (branche de la PR). Pour une ligne supprimée, l'extension ouvre la ligne la plus proche et le signale.

## Réglages

Enregistrés automatiquement.

1. **Éditeur** : Android Studio, IntelliJ / JetBrains, Xcode, VS Code, Insiders, Cursor, Windsurf, VSCodium, Zed ou modèle d'URL personnalisé.
2. **Emplacement des dépôts** : un dossier par dépôt (`owner/repo` et son chemin absolu) et/ou un dossier par défaut (`/Users/moi/dev/{repo}`). `~` est accepté une fois le dossier personnel renseigné.
3. **Tester** : coller une URL de fichier GitHub (`https://github.com/acme/app/blob/main/src/App.kt#L42`) pour voir le chemin résolu et l'ouvrir.

Android Studio / IntelliJ : ouverture via le lien `idea://open` enregistré par l'IDE. Xcode : voir l'[étape 4](#4-xcode-uniquement--lapp-relais).
