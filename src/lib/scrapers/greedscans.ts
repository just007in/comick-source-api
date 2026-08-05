/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class GreedScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://greedscans.org";

  getName(): string {
    return "Greed Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("greedscans.com") || url.includes("greedscans.org");
  }

  getType(): SourceType {
    return "scanlator";
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $(".entry-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/manga\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      // The new "greed" theme lists chapters as .greed-series-chapter
      // anchors (replacing the MangaStream-style #chapterlist).
      $("a.greed-series-chapter").each((_: number, element: any) => {
        const $link = $(element);
        const href = $link.attr("data-chapter-url") || $link.attr("href");

        if (!href || href.includes("#")) {
          return;
        }

        const fullUrl = href.startsWith("http")
          ? href
          : `${this.BASE_URL}${href}`;
        const chapterNumber = this.extractChapterNumber(fullUrl);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);
          chapters.push({
            id: $link.attr("data-chapter-id") || `${chapterNumber}`,
            number: chapterNumber,
            title: `Chapter ${chapterNumber}`,
            url: fullUrl,
          });
        }
      });
    } catch (error) {
      console.error("[GreedScans] Chapter fetch error:", error);
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /\/chapter[/-](\d+)(?:[.-](\d+))?/i,
      /chapter[/-](\d+)(?:[.-](\d+))?$/i,
      /-chapter-(\d+)(?:[.-](\d+))?/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        const mainNumber = parseInt(match[1], 10);
        const decimalPart = match[2] ? parseInt(match[2], 10) : 0;

        if (decimalPart > 0) {
          return mainNumber + decimalPart / 10;
        }
        return mainNumber;
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // The site replaced its MangaStream-style .bsx grid with a custom
    // "greed-archive" card grid.
    $(".greed-archive-card").each((_, element) => {
      const $item = $(element);

      const titleLink = $item.find(".greed-archive-name").first();
      const url = titleLink.attr("href");
      const title = titleLink.text().trim();

      if (!url) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find(".greed-archive-cover__img").first();
      const coverImage = coverImg.attr("src");

      const latestChapterText = $item
        .find(".greed-archive-chapters a")
        .first()
        .text()
        .trim();
      const chapterMatch = latestChapterText.match(/(?:Chapter|Ch\.?)\s*([\d.]+)/i);
      const latestChapter = chapterMatch ? parseFloat(chapterMatch[1]) : 0;

      const ratingText = $item
        .find(".greed-archive-rating")
        .text()
        .replace(/[^\d.]/g, "")
        .trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      results.push({
        id,
        title,
        url,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `${this.BASE_URL}${coverImage}`
            : undefined,
        latestChapter,
        lastUpdated: "",
        rating,
      });
    });

    return results;
  }
}
