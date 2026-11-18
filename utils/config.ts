import { browser } from 'wxt/browser';
import { DEFAULTS, type Config } from './ide';

// Réglages dans storage.sync, complétés par les valeurs par défaut.
export const loadConfig = async (): Promise<Config> =>
  ({ ...DEFAULTS, ...(await browser.storage.sync.get(null)) }) as Config;

export const saveConfig = (cfg: Config) => browser.storage.sync.set({ ...cfg });
