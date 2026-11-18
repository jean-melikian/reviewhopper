# ReviewHopper

Extension Chrome (Manifest V3) qui ouvre le fichier et la ligne d'un diff GitHub (PR, commit, commentaires de review) dans l'éditeur local.

## Installation

1. Ouvrir `chrome://extensions` et activer le **Mode développeur**.
2. **Charger l'extension non empaquetée** puis choisir le dossier de l'extension.
3. La page de réglages s'ouvre : choisir l'éditeur et indiquer où se trouvent les clones locaux.

## Utilisation

- Onglet **Files changed** d'une PR ou page de commit : survoler une ligne puis cliquer sur le bouton **↗**, ou Alt+clic (⌥+clic sur Mac) sur la ligne.
- Alt+clic sur le nom d'un fichier : ouvre le fichier à la ligne 1.
- Onglet **Conversation** : même chose sur l'extrait de code d'un commentaire de review ; Alt+clic sur le nom du fichier ouvre la ligne commentée. Le bouton de copie à côté du nom du fichier copie le chemin du fichier (à coller dans la recherche de fichiers de l'éditeur, ex. Cmd+Shift+O dans Xcode ou Android Studio).

La ligne ouverte est celle de la **nouvelle version** du fichier (branche de la PR). Pour une ligne supprimée, l'extension ouvre la ligne la plus proche et le signale.

## Réglages

Enregistrés automatiquement.

1. **Éditeur** : Android Studio, IntelliJ / JetBrains, Xcode, VS Code, Insiders, Cursor, Windsurf, VSCodium, Zed ou modèle d'URL personnalisé.
2. **Emplacement des dépôts** : un dossier par dépôt (`owner/repo` → chemin absolu) et/ou un dossier par défaut (`/Users/moi/dev/{repo}`). `~` est accepté une fois le dossier personnel renseigné.
3. **Tester** : coller une URL de fichier GitHub (`…/blob/main/src/App.kt#L42`) pour voir le chemin résolu et l'ouvrir.

Android Studio / IntelliJ : ouverture via le lien `idea://open` enregistré par l'IDE. Chrome demande une confirmation au premier clic.

Xcode : il n'a pas de lien pour ouvrir un fichier à une ligne. Installer une fois l'app relais (macOS, Xcode installé) depuis le dossier de l'extension :

```bash
bash helpers/xcode/install.sh
```

Elle crée `~/Applications/ReviewHopper Xcode.app`, qui reçoit les liens `reviewhopper-xcode://` et lance `xed --line`. Désinstaller : `bash helpers/xcode/install.sh --uninstall`.
