#!/bin/bash
# ReviewHopper : app relais pour ouvrir un fichier à une ligne dans Xcode.
# Xcode n'a pas de lien profond fichier+ligne : cette petite app enregistre le schéma
# reviewhopper-xcode://open?file=<chemin absolu encodé>&line=<n> et lance `xed --line`.
#
# Installer :    bash helpers/xcode/install.sh
# Désinstaller : bash helpers/xcode/install.sh --uninstall
# Variables (utilisées par la formule Homebrew) : REVIEWHOPPER_APP (emplacement de l'app),
# REVIEWHOPPER_NO_REGISTER=1 (construire sans enregistrer le schéma).
set -euo pipefail

APP="${REVIEWHOPPER_APP:-$HOME/Applications/ReviewHopper Xcode.app}"
# Garde-fou avant les rm -rf : uniquement un bundle .app.
[[ "$APP" == *.app && "$APP" != /*.app/* ]] || { echo "REVIEWHOPPER_APP doit se terminer par .app : $APP" >&2; exit 1; }
SCHEME="reviewhopper-xcode"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

if [[ "${1:-}" == "--uninstall" ]]; then
  [[ -d "$APP" ]] && "$LSREGISTER" -u "$APP" 2>/dev/null || true
  rm -rf "$APP"
  echo "Désinstallé : $APP"
  exit 0
fi

command -v xed >/dev/null || { echo "xed introuvable : installer Xcode puis lancer xcode-select -s /Applications/Xcode.app" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Applet AppleScript : reçoit l'URL et la passe au script shell embarqué.
cat > "$TMP/main.applescript" <<'AS'
on open location theURL
	set helper to POSIX path of (path to me) & "Contents/Resources/open.sh"
	do shell script "/bin/bash " & quoted form of helper & " " & quoted form of theURL
end open location

on run
	display dialog "ReviewHopper Xcode est installé. Il s'utilise depuis l'extension ReviewHopper (éditeur : Xcode)." buttons {"OK"} default button 1 with title "ReviewHopper Xcode"
end run
AS

rm -rf "$APP"
mkdir -p "$(dirname "$APP")"
osacompile -o "$APP" "$TMP/main.applescript"

# Décodage de l'URL et ouverture. N'importe quel site ou app peut appeler ce schéma : on n'accepte
# qu'un chemin absolu vers un fichier existant, non téléchargé (pas de quarantaine), et une ligne numérique.
cat > "$APP/Contents/Resources/open.sh" <<'SH'
#!/bin/bash
set -u
url=$1
[[ "$url" == reviewhopper-xcode://open\?* ]] || exit 1
query=${url#*\?}
file=""; line=1
IFS='&' read -ra pairs <<< "$query"
for kv in "${pairs[@]}"; do
  case "$kv" in
    file=*) file=${kv#file=} ;;
    line=*) line=${kv#line=} ;;
  esac
done
notify() {
  osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "ReviewHopper Xcode"' -e 'end run' "$1" >/dev/null 2>&1
}
# Seuls des %XX valides sont décodés (printf %b interpréterait aussi un \ présent en clair).
[[ "$file" != *\\* && ! "$file" =~ %([^0-9A-Fa-f]|.[^0-9A-Fa-f]|.?$) ]] || { notify "Lien invalide"; exit 1; }
decode() { local s=${1//+/ }; printf '%b' "${s//%/\\x}"; }
file=$(decode "$file")
[[ "$line" =~ ^[0-9]+$ ]] || line=1
[[ "$file" == /* && -f "$file" ]] || { notify "Fichier introuvable : $file"; exit 1; }
# Fichier téléchargé (ex. un Package.swift déposé par un site) : Xcode pourrait l'évaluer.
if xattr -p com.apple.quarantine "$file" >/dev/null 2>&1; then
  notify "Fichier téléchargé refusé : $file"; exit 1
fi
exec /usr/bin/xed --line "$line" "$file"
SH
chmod +x "$APP/Contents/Resources/open.sh"

PLIST="$APP/Contents/Info.plist"
PB=/usr/libexec/PlistBuddy
$PB -c "Set :CFBundleIdentifier com.reviewhopper.xcode" "$PLIST" 2>/dev/null || $PB -c "Add :CFBundleIdentifier string com.reviewhopper.xcode" "$PLIST"
$PB -c "Add :LSUIElement bool true" "$PLIST"
$PB -c "Add :CFBundleURLTypes array" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string ReviewHopper Xcode" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string $SCHEME" "$PLIST"

# Signature ad hoc (Info.plist modifié) puis enregistrement du schéma auprès de macOS.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
[[ "${REVIEWHOPPER_NO_REGISTER:-}" == 1 ]] && { echo "Construit : $APP"; exit 0; }
"$LSREGISTER" -f "$APP"

echo "Installé : $APP"
echo "Schéma enregistré : $SCHEME://open?file=<chemin>&line=<n>"
