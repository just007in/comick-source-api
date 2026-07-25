import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".cache", "fetch");
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  value: string;
  cachedAt: number;
}

function cacheFilePath(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

async function readCache(key: string): Promise<string | null> {
  try {
    const raw = await readFile(cacheFilePath(key), "utf8");
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      return null;
    }
    return entry.value;
  } catch {
    // No cache file yet, or it's unreadable/corrupt - treat as a miss rather
    // than failing the caller, since disk caching is purely an optimization.
    return null;
  }
}

async function writeCache(key: string, value: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { value, cachedAt: Date.now() };
  await writeFile(cacheFilePath(key), JSON.stringify(entry));
}

/**
 * Runs `fetchFn` and caches its resolved string result to disk for 12
 * hours, keyed by `key` - a later call with the same key returns the
 * cached value directly instead of re-running `fetchFn`, until it expires.
 * Only a successful result is ever cached; a thrown error always falls
 * through to `fetchFn` again next time, so a temporarily-broken site is
 * retried on the very next call rather than being remembered as broken for
 * the rest of the TTL. A cache *write* failure (e.g. a disk issue) is
 * logged and swallowed rather than failing the caller, since the fetch
 * itself already succeeded by that point.
 */
export async function withDiskCache(
  key: string,
  fetchFn: () => Promise<string>,
): Promise<string> {
  const cached = await readCache(key);
  if (cached !== null) {
    return cached;
  }

  const value = await fetchFn();
  try {
    await writeCache(key, value);
  } catch (error) {
    console.error(`[disk-cache] Failed to write cache for ${key}:`, error);
  }
  return value;
}
