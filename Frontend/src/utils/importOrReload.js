import { reloadForNewVersion } from './chunkReload';

/**
 * Loads a lazy page chunk. When it fails (a dropped connection, or an old tab asking for a
 * chunk that a newer deploy replaced) the browser will not re-request that chunk on this page,
 * so reload once to fetch a fresh index.html and chunk list. The cooldown stops a reload loop
 * when the network is really down; the caller then shows its error screen.
 */
export const importOrReload = async (importFunc) => {
  try {
    const module = await importFunc();
    // Safety check: ensure dynamic import resolved properly with a module object
    if (!module || (typeof module === 'object' && module.default === undefined && Object.keys(module).length === 0)) {
      throw new Error("Module export invalid: reading 'default'");
    }
    return module;
  } catch (error) {
    try {
      if (navigator.onLine !== false) {
        const reloaded = reloadForNewVersion();
        if (reloaded) {
          // Stay on the loader while the reload happens instead of flashing the error
          return new Promise(() => {});
        }
      }
    } catch (e) { /* storage unavailable: fall through to the error screen */ }
    throw error;
  }
};
