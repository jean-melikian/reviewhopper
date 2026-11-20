import { defineConfig } from 'wxt';

declare const process: { env: Record<string, string | undefined> }; // config exécutée par Node

// Clé publique qui fixe l'ID Chrome de l'extension non empaquetée (gohgmgkpeooiholmejldmdkfjdbbnhkj),
// quel que soit le dossier chargé : release, build de PR et build local partagent les mêmes réglages.
// Sans elle, l'ID dépend du chemin du dossier. Le Chrome Web Store refuse ce champ : REVIEWHOPPER_STORE=1
// le retire. Aucune clé privée n'est nécessaire (elle ne sert qu'à signer un .crx).
const CHROME_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlORzitTow0uDsHymCWFzyTJuQWHF/2167a6Rq3aJI042g52v8VU4O2JCAwdkeux78E0YigQZky7oK5A70tc2XK82DahJjm7PeNUz5IJh7sNUUazSR/Fkm+TpHbYc53AFfWurHW5ARenKEGC278e3p84Nq7rl0huI4Gl05u51WYvpr0IGFPduyolxjPRWgyfbKhiBxPRiqUd3qtfo1ms8eN3bVgmf2pLU2tXkQHHP7eeg6uH2XATLubGIwk1cT9aPlB3pHc0djBuqTcgiLwFTtc9J5Swe0ri6vfx5WycpkKpO0mfWCQH3B3POyBYKfuJzplnz+ybebK9Tz68+21bVRQIDAQAB';

// Un seul code, un build par navigateur : `npm run build` (Chrome, Edge, Brave, Arc, Dia, Vivaldi…)
// et `npm run build:firefox` (Firefox, Zen).
export default defineConfig({
  // MV3 partout, Firefox compris (WXT vise MV2 par défaut pour Firefox).
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'ReviewHopper',
    permissions: ['storage'],
    host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'],
    action: {
      default_title: 'ReviewHopper : réglages',
      default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' },
    },
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    ...(browser !== 'firefox' && !process.env.REVIEWHOPPER_STORE && { key: CHROME_KEY }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'reviewhopper@jean-melikian.github.io',
          strict_min_version: '140.0',
          // Exigé par addons.mozilla.org pour les nouvelles extensions.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
