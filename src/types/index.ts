export interface ScanlationGroup {
  id: string;
  name: string;
  url?: string;
}

export interface ScrapedChapter {
  id: string;
  number: number;
  title?: string;
  url: string;
  isDownloaded?: boolean;
  lastUpdated?: string;
  group?: ScanlationGroup;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  coverImage?: string;
  latestChapter: number;
  lastUpdated: string;
  lastUpdatedTimestamp?: number;
  rating?: number;
  followers?: string;
}

// Series-level metadata scraped from a source's own title record - the
// /api/metadata endpoint's payload. Everything is optional except the list
// fields (empty when the source has none): sources vary widely in what
// their detail data exposes.
export interface ScrapedMetadata {
  title?: string;
  description?: string;
  status?: string;
  tags: string[];
  authors: string[];
  releaseDate?: string; // ISO 8601
  releaseYear?: number;
  altTitles: string[];
  coverImage?: string;
}

export type SourceType = "scanlator" | "aggregator";

export interface SourceInfo {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;
  clientOnly?: boolean;
  type: SourceType;
}

export interface FrontpageManga {
  id: string;
  title: string;
  url: string;
  coverImage?: string;
  latestChapter?: number;
  lastUpdated?: string;
  lastUpdatedTimestamp?: number;
  rating?: number;
  followers?: string;
  type?: string; // manga, manhwa, manhua, etc.
  status?: string;
  synopsis?: string;
}

export type FrontpageSectionType =
  | "trending"
  | "most_followed"
  | "latest_hot"
  | "latest_new"
  | "recently_added"
  | "completed";

export interface FrontpageSection {
  id: string;
  title: string;
  type: FrontpageSectionType;
  items: FrontpageManga[];
  supportsPagination: boolean;
  supportsTimeFilter: boolean;
  availableTimeFilters?: number[]; // days: 1, 7, 30, 90, 180, 365
}

export interface FrontpageData {
  source: string;
  sections: FrontpageSection[];
  fetchedAt: number;
}

export interface FrontpageInfo {
  sourceId: string;
  sourceName: string;
  availableSections: {
    id: string;
    title: string;
    type: FrontpageSectionType;
    supportsTimeFilter: boolean;
    availableTimeFilters?: number[];
  }[];
}
