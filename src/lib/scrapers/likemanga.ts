/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

export class LikeMangaScraper extends BaseScraper {
  getName(): string {
    return "LikeManga";
  }

  getBaseUrl(): string {
    return "https://mgread.io";
  }

  canHandle(url: string): boolean {
    // The site rebranded from likemanga.in to mgread.io (the old domain
    // redirects) - keep handling both so already-saved URLs still work.
    return url.includes("likemanga.in") || url.includes("mgread.io");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $(".post-title h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/manga\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  // mgread.io renders its chapter list client-side from a WordPress REST
  // endpoint (the old Madara /ajax/chapters/ POST just returns the page
  // shell) - the series page carries the numeric manga id in a
  // data-manga-id attribute, and /wp-json/initmanga/v1/chapters serves the
  // paginated list (per_page caps at 50).
  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];

    const html = await this.fetchWithRetry(mangaUrl);
    const idMatch = html.match(/data-manga-id=["']?(\d+)/);
    if (!idMatch) {
      console.error("[LikeManga] No data-manga-id found on series page");
      return chapters;
    }
    const mangaId = idMatch[1];
    const seriesBase = mangaUrl.replace(/\/$/, "");

    interface MgreadChaptersResponse {
      items: { number: number; slug: string; title?: string }[];
      total_pages: number;
      current_page: number;
    }

    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const data = await this.fetchJsonWithRetry<MgreadChaptersResponse>(
        `https://mgread.io/wp-json/initmanga/v1/chapters?manga_id=${mangaId}&per_page=50&paged=${page}`,
      );
      totalPages = data.total_pages;

      for (const item of data.items) {
        chapters.push({
          id: item.slug,
          number: item.number,
          title: item.title || `Chapter ${item.number}`,
          url: `${seriesBase}/${item.slug}/`,
        });
      }

      page++;
      if (page <= totalPages) {
        await this.delay(300);
      }
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string, chapterText?: string): number {
    if (chapterText) {
      const concatenatedMatch = chapterText.match(/Chapter\s+(\d+)\s*[\+\-]\s*(\d+)/i);
      if (concatenatedMatch) {
        return -1;
      }

      const textMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      if (textMatch) {
        return parseFloat(textMatch[1]);
      }
    }

    const patterns = [
      /\/chapter[/-](\d+)(?:[.-](\d+))?/i,
      /chapter[/-](\d+)(?:[.-](\d+))?$/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        const mainNumber = parseInt(match[1], 10);
        const decimalPart = match[2] ? match[2] : null;

        if (decimalPart) {
          const divisor = Math.pow(10, decimalPart.length);
          return mainNumber + parseInt(decimalPart, 10) / divisor;
        }
        return mainNumber;
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `https://mgread.io/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // mgread.io serves a UIkit theme: one <article> per result, the series
    // link in an h2 heading (with the query wrapped in <mark> tags, which
    // .text() flattens away), the thumbnail in a sibling column.
    $("article").each((_, element) => {
      const $item = $(element);

      const titleLink = $item.find("h2 a[href*='/manga/']").first();
      const url = titleLink.attr("href");
      const title = titleLink.text().replace(/\s+/g, " ").trim();

      if (!url || !title) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find("img").first();
      const coverImage = coverImg.attr("src") || coverImg.attr("data-src");

      results.push({
        id,
        title,
        url,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `https://mgread.io${coverImage}`
            : undefined,
        latestChapter: 0,
        lastUpdated: "",
      });
    });

    return results;
  }
}
