const RELOAD_KEY = 'chunk_reload_at';
const RELOAD_COOLDOWN_MS = 15000;

/**
 * Loads a lazy page chunk. When it fails (a dropped connection, or an old tab asking for a
 * chunk that a newer deploy replaced) the browser will not re-request that chunk on this page,
 * so reload once to fetch a fresh index.html and chunk list. The cooldown stops a reload loop
 * when the network is really down; the caller then shows its error screen.
 */
export const importOrReload = async (importFunc) => {
  try {
    return await importFunc();
  } catch (error) {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      if (navigator.onLine !== false && Date.now() - last > RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        // Stay on the loader while the reload happens instead of flashing the error
        return new Promise(() => {});
      }
    } catch (e) { /* storage unavailable: fall through to the error screen */ }
    throw error;
  }
};
