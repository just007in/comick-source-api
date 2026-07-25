/**
 * Runs `task` once per item in `items`, allowing at most `maxConcurrent`
 * invocations in flight at once, and returns one result per item in the
 * same order as `items`.
 *
 * `task` is responsible for handling its own failures (e.g. returning a
 * fallback value) - a plain throw propagates out of this function, same as
 * `Promise.all` would.
 *
 * Used to replace fully-sequential `for...await` loops (each detail-page
 * fetch waiting on the previous one to finish) with something faster than
 * that but gentler on the target site than firing every request at once -
 * see the search()-time per-result chapter-count lookups across the
 * scrapers.
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  maxConcurrent: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex++;
      results[index] = await task(items[index]);
    }
  }

  const workerCount = Math.min(maxConcurrent, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * How many of a search's top candidate series to fetch detail pages for
 * (chapter count / last-updated) at once. Bounded rather than unlimited
 * Promise.all - a burst of `SEARCH_DETAIL_FETCH_CONCURRENCY` simultaneous
 * connections to one target site is far less likely to trip Cloudflare/WAF
 * "too many concurrent connections from one client" heuristics than firing
 * all `.slice(0, 5)` candidates at once, while still being much faster than
 * the fully-sequential loop this replaces.
 */
export const SEARCH_DETAIL_FETCH_CONCURRENCY = 3;
