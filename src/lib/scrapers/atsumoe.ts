/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from "./base";
import { ScrapedChapter, ScrapedMetadata, SearchResult } from "@/types";

interface AtsuMoeSearchHit {
  document: {
    id: string;
    title: string;
    englishTitle?: string;
    poster?: string;
  };
}

interface AtsuMoeSearchResponse {
  hits: AtsuMoeSearchHit[];
}

interface AtsuMoeChapter {
  id: string;
  title: string;
  number: number;
  index: number;
  pageCount: number;
  createdAt: string;
}

interface AtsuMoeChaptersResponse {
  chapters: AtsuMoeChapter[];
  pages: number;
  page: number;
}

// The full Typesense-style manga document served at
// /collections/manga/documents/{id} - only the fields getMetadata maps.
interface AtsuMoeMangaDocument {
  title: string;
  englishTitle?: string;
  synopsis?: string;
  status?: string;
  tags?: string[];
  authors?: string[];
  otherNames?: string[];
  releaseDate?: number; // epoch milliseconds
  releaseYear?: number;
  poster?: string;
}

export class AtsuMoeScraper extends BaseScraper {
  private readonly BASE_URL = "https://atsu.moe";
  private readonly ATSU_ID_PATTERN = "[a-zA-Z0-9_-]+";

  getName(): string {
    return "AtsuMoe";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("atsu.moe");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const mangaId = this.extractMangaId(url);
    if (!mangaId) {
      throw new Error("Invalid atsu.moe manga URL");
    }

    const id = mangaId;
    // Existence check only - and the page-0 fetch it caches is exactly what
    // getChapterList asks for first, so this costs nothing extra overall.
    const chaptersUrl = `${this.BASE_URL}/api/manga/chapters?id=${id}&filter=all&sort=desc&page=0`;
    await this.fetchWithRetry(chaptersUrl, {
      headers: { Accept: "application/json" },
    });

    const title = id;
    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const { id } = await this.extractMangaInfo(mangaUrl);
    const allChapters: ScrapedChapter[] = [];
    let currentPage = 0;
    let totalPages = 1;

    while (currentPage < totalPages) {
      const chaptersUrl = `${this.BASE_URL}/api/manga/chapters?id=${id}&filter=all&sort=desc&page=${currentPage}`;

      const data = await this.fetchJsonWithRetry<AtsuMoeChaptersResponse>(chaptersUrl, {
        headers: {
          Accept: "application/json",
        },
      });
      totalPages = data.pages;

      for (const chapter of data.chapters) {
        const chapterUrl = `${this.BASE_URL}/read/${id}/${chapter.id}`;

        allChapters.push({
          id: chapter.id,
          number: chapter.number,
          title: chapter.title,
          url: chapterUrl,
        });
      }

      currentPage++;

      if (currentPage < totalPages) {
        await this.delay(500);
      }
    }

    return allChapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/collections/manga/documents/search?q=${encodeURIComponent(query)}&limit=12&query_by=title%2CenglishTitle%2CotherNames&query_by_weights=3%2C2%2C1&include_fields=id%2Ctitle%2CenglishTitle%2Cposter&num_typos=4%2C3%2C2`;

    const data = await this.fetchJsonWithRetry<AtsuMoeSearchResponse>(searchUrl, {
      headers: {
        Accept: "application/json",
      },
    });
    const results: SearchResult[] = [];

    for (const hit of data.hits) {
      const doc = hit.document;
      const title = doc.englishTitle || doc.title;
      const coverImage = doc.poster
        ? `${this.BASE_URL}${doc.poster}`
        : undefined;

      let latestChapter = 0;
      let lastUpdated = "";
      try {
        const chaptersUrl = `${this.BASE_URL}/api/manga/chapters?id=${doc.id}&filter=all&sort=desc&page=0`;
        const chaptersData =
          await this.fetchJsonWithRetry<AtsuMoeChaptersResponse>(chaptersUrl);
        if (chaptersData.chapters.length > 0) {
          latestChapter = chaptersData.chapters[0].number;
          const createdDate = new Date(chaptersData.chapters[0].createdAt);
          lastUpdated = this.formatRelativeTime(createdDate);
        }
      } catch (error) {
        console.error(`Failed to fetch chapter count for ${doc.id}:`, error);
      }

      results.push({
        id: doc.id,
        title,
        url: `${this.BASE_URL}/manga/${doc.id}`,
        coverImage,
        latestChapter,
        lastUpdated,
      });

      await this.delay(100);
    }

    return results;
  }

  supportsMetadata(): boolean {
    return true;
  }

  async getMetadata(url: string): Promise<ScrapedMetadata> {
    const mangaId = this.extractMangaId(url);
    if (!mangaId) {
      throw new Error("Invalid atsu.moe manga URL");
    }

    const documentUrl = `${this.BASE_URL}/collections/manga/documents/${mangaId}`;
    const doc = await this.fetchJsonWithRetry<AtsuMoeMangaDocument>(documentUrl, {
      headers: {
        Accept: "application/json",
      },
    });
    const title = doc.englishTitle || doc.title;

    return {
      title,
      description: doc.synopsis,
      status: doc.status,
      tags: doc.tags ?? [],
      authors: doc.authors ?? [],
      releaseDate:
        doc.releaseDate === undefined
          ? undefined
          : new Date(doc.releaseDate).toISOString(),
      releaseYear: doc.releaseYear,
      altTitles: this.dedupeAltTitles(doc.otherNames ?? [], title),
      coverImage: doc.poster ? `${this.BASE_URL}${doc.poster}` : undefined,
    };
  }

  // otherNames mixes display names with search-key variants of the same
  // names (lowercased, whitespace/punctuation stripped) - collapse those to
  // one entry per normalized form, keeping the first (display) spelling,
  // and drop the main title itself.
  private dedupeAltTitles(otherNames: string[], title: string): string[] {
    const normalize = (name: string) =>
      name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const seen = new Set([normalize(title)]);
    const altTitles: string[] = [];
    for (const name of otherNames) {
      const key = normalize(name);
      if (key.length === 0 || seen.has(key)) continue;
      seen.add(key);
      altTitles.push(name);
    }
    return altTitles;
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffYears > 0) return `${diffYears}y ago`;
    if (diffMonths > 0) return `${diffMonths}mo ago`;
    if (diffWeeks > 0) return `${diffWeeks}w ago`;
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "just now";
  }

  private extractMangaId(url: string): string | null {
    const mangaMatch = url.match(new RegExp(`/manga/(${this.ATSU_ID_PATTERN})`));
    if (mangaMatch) {
      return mangaMatch[1];
    }

    const readMatch = url.match(
      new RegExp(`/read/(${this.ATSU_ID_PATTERN})/(${this.ATSU_ID_PATTERN})`),
    );
    if (readMatch) {
      return readMatch[1];
    }

    return null;
  }
}
