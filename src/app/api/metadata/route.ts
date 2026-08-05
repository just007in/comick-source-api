import { NextRequest, NextResponse } from "next/server";
import { getAllScrapers, getScraper, getScraperByName } from "@/lib/scrapers";
import { BaseScraper } from "@/lib/scrapers/base";
import { ScrapedMetadata } from "@/types";

// Node runtime (not edge) - same reasoning as /api/chapters: the scraper
// layer's disk-based fetch cache needs node:fs.
export const runtime = "nodejs";

// Same budget as /api/chapters' per-scraper timeout - a site that never
// responds should fail this request in bounded time, not hang until the
// platform's own function deadline.
const SCRAPER_TIMEOUT_MS = 20000;

// Metadata support is per-scraper (see BaseScraper.supportsMetadata) -
// currently only AtsuMoe, whose Typesense-style title documents carry
// tags/status/synopsis/authors/release date as structured JSON. Candidate
// sources for future support, in rough order of ease:
// - Comix: the frontpage layer already parses synopsis/status/type.
// - FlameComics, Bato, MangaPark, WeebCentral: structured/JSON-backed
//   detail data.
// - The Madara/WordPress-theme sites (MangaRead, Manhuaus, TopManhua,
//   Madarascans, Manhuaplus, Eva Scans, ...): standard
//   "Genres / Status / Summary" detail-page blocks.
async function getMetadataWithTimeout(
  scraper: BaseScraper,
  url: string,
  timeoutMs: number,
): Promise<ScrapedMetadata> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      scraper.getMetadata(url),
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

    if (!scraper.supportsMetadata()) {
      const supported = getAllScrapers()
        .filter((s) => s.supportsMetadata())
        .map((s) => s.getName())
        .join(", ");
      return NextResponse.json(
        {
          error: `${scraper.getName()} does not support metadata. Supported sources: ${supported}`,
        },
        { status: 400 },
      );
    }

    const metadata = await getMetadataWithTimeout(scraper, url, SCRAPER_TIMEOUT_MS);

    return NextResponse.json({
      metadata,
      source: scraper.getName(),
    });
  } catch (error: unknown) {
    console.error("Metadata error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch metadata",
      },
      { status: 500 },
    );
  }
}
