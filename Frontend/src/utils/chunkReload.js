// A new deploy renames the app's code files. A tab opened before the deploy then asks for files that no longer exist
// ("Failed to fetch dynamically imported module"). The fix is simply to load the new version: reload once, never in a loop.
const KEY = 'agroyilt_chunk_reload_at';

export const isChunkLoadError = (err) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk .* failed/i
    .test(String(err?.message || err || ''));

/** Reloads the page unless it already did so in the last 15 seconds (so a real outage cannot cause a reload loop). */
export const reloadForNewVersion = () => {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 15000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* storage blocked: reload once anyway */ }
  window.location.reload();
  return true;
};
