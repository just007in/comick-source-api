import { ScrapedChapter, ScrapedMetadata, SearchResult, SourceType } from "@/types";
import { withDiskCache } from "@/lib/utils/disk-cache";

interface ScraperConfig {
  retryAttempts: number;
  downloadDelay: number;
  userAgent: string;
}

export interface FetchOptions {
  method?: "GET" | "POST";
  // Merged over the default browser-like headers, overriding on conflict -
  // e.g. `Accept: "application/json"` for a JSON API, or a Referer a site
  // requires.
  headers?: Record<string, string>;
  body?: string;
  retries?: number;
  // Set false for a request whose URL/body can never repeat (e.g. a
  // per-call auth token baked into the URL) - a cache entry for it would
  // never be read again, so skip writing one. Retries still apply.
  cache?: boolean;
}

export abstract class BaseScraper {
  protected config: ScraperConfig;

  constructor(config?: Partial<ScraperConfig>) {
    this.config = {
      retryAttempts: 3,
      downloadDelay: 1000,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      ...config,
    };
  }

  abstract getName(): string;
  abstract getBaseUrl(): string;
  abstract canHandle(url: string): boolean;
  abstract extractMangaInfo(
    url: string,
  ): Promise<{ title: string; id: string }>;
  abstract getChapterList(mangaUrl: string): Promise<ScrapedChapter[]>;
  abstract search(query: string): Promise<SearchResult[]>;

  // Cached on disk for 12 hours. The cache key is the URL plus, for a
  // POST, the request body - Madara-style sites serve every series'
  // chapter list from the same admin-ajax.php URL with the series in the
  // form body, so the body is part of what's being fetched. Headers and
  // `retries` deliberately aren't part of the key: they affect how a cache
  // *miss* is satisfied, not which resource comes back (see withDiskCache).
  protected async fetchWithRetry(
    url: string,
    options: FetchOptions = {},
  ): Promise<string> {
    if (options.cache === false) {
      return this.fetchWithoutCache(url, options);
    }
    const cacheKey =
      options.method === "POST" ? `${url}#${options.body ?? ""}` : url;
    return withDiskCache(cacheKey, () => this.fetchWithoutCache(url, options));
  }

  private async fetchWithoutCache(
    url: string,
    options: FetchOptions,
  ): Promise<string> {
    const retries = options.retries ?? this.config.retryAttempts;
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, {
          method: options.method ?? "GET",
          headers: {
            "User-Agent": this.config.userAgent,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            DNT: "1",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            ...options.headers,
          },
          body: options.body,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
      } catch (error) {
        if (i === retries) {
          throw error;
        }
        await this.delay(this.config.downloadDelay * (i + 1));
      }
    }
    throw new Error("Failed to fetch after retries");
  }

  // fetchWithRetry for JSON endpoints - same caching/retry behavior, with
  // an Accept header a JSON API expects and the parse done here so callers
  // don't repeat it.
  protected async fetchJsonWithRetry<T>(
    url: string,
    options: FetchOptions = {},
  ): Promise<T> {
    const text = await this.fetchWithRetry(url, {
      ...options,
      headers: { Accept: "application/json", ...options.headers },
    });
    return JSON.parse(text) as T;
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const match = chapterUrl.match(/chapter[/-](\d+(?:\.\d+)?)/i);
    return match ? parseFloat(match[1]) : 0;
  }

  protected sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, "_").trim();
  }

  getDescription(): string {
    return `${this.getName()} - ${this.getBaseUrl()}`;
  }

  // Optional capability: series-level metadata (tags, status, synopsis,
  // release date, ...) scraped from the source's own title record, served
  // by /api/metadata. A scraper that overrides getMetadata must also
  // override supportsMetadata to return true - the route checks the flag
  // first so unsupported sources get a clean 400 instead of a scrape
  // attempt that can only throw.
  supportsMetadata(): boolean {
    return false;
  }

  getMetadata(url: string): Promise<ScrapedMetadata> {
    throw new Error(`${this.getName()} does not support metadata (for ${url})`);
  }

  isClientOnly(): boolean {
    return false;
  }

  getType(): SourceType {
    return "aggregator";
  }
}
