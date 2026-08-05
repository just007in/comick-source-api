/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";
import { mapWithConcurrencyLimit, SEARCH_DETAIL_FETCH_CONCURRENCY } from "@/lib/utils/concurrency";

export class SpiderScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://spiderscans.xyz";

  getName(): string {
    return "Spider Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("spiderscans.xyz");
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

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      // The site dropped its Madara theme (and its /ajax/chapters/
      // endpoint) - chapters are now plain .chapter-item anchors on the
      // series page itself.
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $("a.chapter-item").each((_: number, element: any) => {
        const $link = $(element);
        const href = $link.attr("href");

        if (!href || href === "#") {
          return;
        }

        const dataChapter = $link.attr("data-chapter");
        const chapterNumber = dataChapter
          ? parseFloat(dataChapter)
          : this.extractChapterNumber(href);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const chapterText = $link.find(".chapter-num").text().trim();
          const dateText = $link.find(".chapter-date").text().trim();

          const fullUrl = href.startsWith("http")
            ? href
            : `${this.BASE_URL}${href}`;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: chapterText || `Chapter ${chapterNumber}`,
            url: fullUrl,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[Spider Scans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /chapter[/-](\d+(?:\.\d+)?)/i,
      /-(\d+(?:\.\d+)?)\/?$/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return -1;
  }

  private extractChapterNumberFromText(text: string): number {
    const match = text.match(/chapter\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      return parseFloat(match[1]);
    }
    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);

    const matchedSeries: Array<{
      id: string;
      title: string;
      url: string;
      coverImage?: string;
      rating?: number;
    }> = [];

    // The site swapped its Madara search template for a custom posts loop:
    // each result is a bare (class-less, inline-styled) <article> whose
    // heading links to the series page. No cover or rating in the results.
    $("article h2 a[href*='/manga/']").each((_, element) => {
      const link = $(element);
      const url = link.attr("href");
      const title = link.text().trim();

      if (!url || !title) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      matchedSeries.push({ id, title, url });
    });

    const limitedSeries = matchedSeries.slice(0, 5);

    const results = await mapWithConcurrencyLimit(
      limitedSeries,
      SEARCH_DETAIL_FETCH_CONCURRENCY,
      async (series): Promise<SearchResult> => {
        try {
          const seriesHtml = await this.fetchWithRetry(series.url);

          let latestChapter = 0;
          let lastUpdatedText = "";

          const ajaxUrl = series.url.endsWith("/")
            ? `${series.url}ajax/chapters/?t=1`
            : `${series.url}/ajax/chapters/?t=1`;

          let chaptersHtml: string;
          try {
            chaptersHtml = await this.fetchWithRetry(ajaxUrl, {
              method: "POST",
              headers: {
                Accept: "*/*",
                "X-Requested-With": "XMLHttpRequest",
                Referer: series.url,
              },
            });
          } catch {
            chaptersHtml = seriesHtml;
          }

          const $chapters = cheerio.load(chaptersHtml);

          $chapters("li.wp-manga-chapter").each((_, el) => {
            if (latestChapter > 0) return false;

            const $ch = $chapters(el);
            const $link = $ch.find("a").first();
            const href = $link.attr("href");

            const hasLock = $link.find(".fa-lock").length > 0;
            const isPremium = $ch.hasClass("premium-block");

            if (href && href !== "#" && !hasLock && !isPremium) {
              const chapterText = $link.text().trim();
              const chapterNum = this.extractChapterNumber(href) || 
                                this.extractChapterNumberFromText(chapterText);
            
              if (chapterNum > latestChapter) {
                latestChapter = chapterNum;
                lastUpdatedText = $ch
                  .find(".chapter-release-date")
                  .text()
                  .trim()
                  .replace(/[<>]/g, "");
              }
            }
          });

          let lastUpdatedTimestamp: number | undefined;
          if (lastUpdatedText) {
            try {
              const parsedDate = new Date(lastUpdatedText);
              if (!isNaN(parsedDate.getTime())) {
                lastUpdatedTimestamp = parsedDate.getTime();
              }
            } catch {
              // Ignore date parse errors
            }
          }

          return {
            id: series.id,
            title: series.title,
            url: series.url,
            coverImage: series.coverImage,
            latestChapter,
            lastUpdated: lastUpdatedText,
            lastUpdatedTimestamp,
            rating: series.rating,
          };
        } catch (error) {
          console.error(
            `[Spider Scans] Failed to fetch chapter list for ${series.title}:`,
            error
          );
          return {
            id: series.id,
            title: series.title,
            url: series.url,
            coverImage: series.coverImage,
            latestChapter: 0,
            lastUpdated: "",
            rating: series.rating,
          };
        }
      },
    );

    return results;
  }
}
