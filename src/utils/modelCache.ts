/**
 * Model Cache Utility
 *
 * Uses the browser Cache API (available in Workers) to persist large model
 * files across page loads.  A single HEAD request to config.json on the
 * remote server is used to compare ETags — if the remote ETag differs from
 * the one stored locally the entire model cache is cleared and the files are
 * re-downloaded automatically on the next pipeline load.
 *
 * Note: localStorage is NOT available inside Web Workers; the Cache API is
 * used for both the model files and the tiny checksum metadata entry.
 */

/** Name of the Cache Storage bucket for model files */
export const MODEL_CACHE_NAME = "flycut-model-cache";

/**
 * Synthetic URL used as a key inside the cache to store the last-known
 * remote checksum (ETag / Last-Modified).  It is never actually fetched.
 */
const CHECKSUM_CACHE_KEY = "https://flycut.local/model-checksum";

// ---------------------------------------------------------------------------
// Checksum helpers
// ---------------------------------------------------------------------------

/** Read the checksum that was stored after the last successful download. */
export async function getStoredChecksum(): Promise<string | null> {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const res = await cache.match(CHECKSUM_CACHE_KEY);
    return res ? res.text() : null;
  } catch {
    return null;
  }
}

/** Persist a checksum so it can be compared on the next startup. */
export async function setStoredChecksum(checksum: string): Promise<void> {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    await cache.put(CHECKSUM_CACHE_KEY, new Response(checksum));
  } catch (err) {
    console.warn("[ModelCache] Failed to persist checksum:", err);
  }
}

// ---------------------------------------------------------------------------
// Remote checksum
// ---------------------------------------------------------------------------

/**
 * Perform a HEAD request and return the ETag (or Last-Modified as a fallback).
 * Returns null when the server doesn't expose either header or the request fails.
 *
 * @param baseFetch  The original `fetch` (not the overridden one) to avoid
 *                   infinite loops inside a fetch interceptor.
 * @param url        URL of the file to probe — typically config.json.
 */
export async function fetchRemoteChecksum(
  baseFetch: typeof globalThis.fetch,
  url: string
): Promise<string | null> {
  try {
    const res = await baseFetch(url, { method: "HEAD" });
    // OSS single-part ETag == MD5 of the content — good enough as a checksum
    return res.headers.get("ETag") ?? res.headers.get("Last-Modified") ?? null;
  } catch (err) {
    console.warn("[ModelCache] HEAD request failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache validation
// ---------------------------------------------------------------------------

/**
 * Compare the remote checksum against the locally stored one.
 *
 * - If they match   → cache is valid, return `true`.
 * - If they differ  → delete the model cache bucket, store the new checksum,
 *                     return `false`.  The next `fetchWithCache` calls will
 *                     re-download the files from the remote.
 * - If remote is null (server unreachable / no header) → assume valid so we
 *                     don't force a re-download on every offline start.
 */
export async function validateModelCache(
  baseFetch: typeof globalThis.fetch,
  checksumUrl: string
): Promise<{ valid: boolean; checksum: string | null }> {
  const [remote, stored] = await Promise.all([
    fetchRemoteChecksum(baseFetch, checksumUrl),
    getStoredChecksum(),
  ]);

  if (!remote) {
    console.log(
      "[ModelCache] No remote checksum available, assuming cache is valid"
    );
    return { valid: true, checksum: stored };
  }

  if (remote === stored) {
    console.log("[ModelCache] Checksum match — using cached model:", remote);
    return { valid: true, checksum: remote };
  }

  console.log("[ModelCache] Checksum mismatch — clearing model cache", {
    stored,
    remote,
  });

  // Clear old cached files (the checksum entry lives here too, so we re-set it)
  await caches.delete(MODEL_CACHE_NAME);
  await setStoredChecksum(remote);

  return { valid: false, checksum: remote };
}

// ---------------------------------------------------------------------------
// Cache-aware fetch
// ---------------------------------------------------------------------------

/**
 * Serve `url` from the Cache API when available; otherwise fetch from the
 * network, store the response in cache, and return it.
 *
 * Only successful (2xx) responses are cached.  The caller receives the
 * network response directly; the cache write happens in the background.
 *
 * @param baseFetch  The original `fetch` to use for network requests.
 * @param url        The URL to fetch (should be the final OSS URL).
 * @param init       Optional RequestInit passed to the network fetch.
 */
export async function fetchWithCache(
  baseFetch: typeof globalThis.fetch,
  url: string,
  init?: RequestInit
): Promise<Response> {
  let cache: Cache | null = null;

  try {
    cache = await caches.open(MODEL_CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) {
      return cached.clone();
    }
  } catch {
    // Cache API unavailable — fall through to network-only
  }

  const response = await baseFetch(url, init);

  if (cache && response.ok) {
    // Fire-and-forget; don't block the caller on the write
    cache.put(url, response.clone()).catch((err) => {
      console.warn("[ModelCache] Failed to cache response:", url, err);
    });
  }

  return response;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Returns the approximate total size (bytes) of all cached model entries. */
export async function getModelCacheSize(): Promise<number> {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const keys = await cache.keys();
    let total = 0;

    await Promise.all(
      keys
        .filter((r) => r.url !== CHECKSUM_CACHE_KEY)
        .map(async (req) => {
          const res = await cache.match(req);
          if (res) {
            const buf = await res.arrayBuffer();
            total += buf.byteLength;
          }
        })
    );

    return total;
  } catch {
    return 0;
  }
}
