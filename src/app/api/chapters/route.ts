import { NextRequest, NextResponse } from "next/server";
import { getScraper, getScraperByName } from "@/lib/scrapers";
import { BaseScraper } from "@/lib/scrapers/base";
import { ScrapedChapter } from "@/types";

// Node runtime (not edge) - this deployment is a dedicated, self-hosted
// server rather than Vercel's distributed edge network, and the scraper
// layer's disk-based fetch cache (see BaseScraper.fetchWithRetry) needs
// node:fs, which the edge runtime doesn't provide.
export const runtime = "nodejs";

// Same budget as /api/search's per-scraper timeout - without this, a site
// that never responds (rather than erroring outright) hangs
// scraper.getChapterList() indefinitely, bounded only by the platform's own
// function execution deadline instead of something we control.
const SCRAPER_TIMEOUT_MS = 20000;

async function getChapterListWithTimeout(
  scraper: BaseScraper,
  url: string,
  timeoutMs: number,
): Promise<ScrapedChapter[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      scraper.getChapterList(url),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`Timeout after ${timeoutMs}ms`));
        });
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url, source } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let scraper;

    // Try to get scraper by source name first
    if (source) {
      scraper = getScraperByName(source);
    }

    // Fallback to URL detection
    if (!scraper) {
      scraper = getScraper(url);
    }

    if (!scraper) {
      return NextResponse.json(
        {
          error:
            "No scraper found for this URL. Please provide a valid manga URL or source name.",
        },
        { status: 400 },
      );
    }

    const chapters = await getChapterListWithTimeout(scraper, url, SCRAPER_TIMEOUT_MS);

    return NextResponse.json({
      chapters,
      source: scraper.getName(),
      totalChapters: chapters.length,
    });
  } catch (error: unknown) {
    console.error("Chapters error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch chapters",
      },
      { status: 500 },
    );
  }
}
