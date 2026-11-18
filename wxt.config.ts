import { defineConfig } from 'wxt';

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
