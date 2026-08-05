import { BaseScraper } from "./base";
import { AtsuMoeScraper } from "./atsumoe";
import { LikeMangaScraper } from "./likemanga";
import { MangaReadScraper } from "./mangaread";
import { MgekoScraper } from "./mgeko";
import { NovelCoolScraper } from "./novelcool";
import { AsuraScanScraper } from "./asurascan";
import { WeebCentralScraper } from "./weebcentral";
import { FlameComicsScraper } from "./flamecomics";
import { MangaloomScraper } from "./mangaloom";
import { MangayyScraper } from "./mangayy";
import { LagoonScansScraper } from "./lagoonscans";
import { RizzFablesScraper } from "./rizzfables";
import { DemonicscansScraper } from "./demonicscans";
import { EvaScansScraper } from "./evascans";
import { RavenScansScraper } from "./ravenscans";
import { RdscansScraper } from "./rdscans";
import { RitharscansScraper } from "./ritharscans";
import { RokariComicsScraper } from "./rokaricomics";
import { MangataroScraper } from "./mangataro";
import { KaliScanScraper } from "./kaliscan";
import { ProjectSukiScraper } from "./projectsuki";
import { ThunderscansScraper } from "./thunderscans";
import { VortexScansScraper } from "./vortexscans";
import { LuaComicScraper } from "./luacomic";
import { VioletscansScraper } from "./violetscans";
import { WitchscansScraper } from "./witchscans";
import { ElfToonScraper } from "./elftoon";
import { WritersScansScraper } from "./writerscans";
import { MadaraScansScraper } from "./madarascans";
import { ManhuaPlusScraper } from "./manhuaplus";
import { SilentQuillScraper } from "./silentquill";
import { TempleToonsScraper } from "./templetoons";
import { AsmotoonScraper } from "./asmotoon";
import { SpiderScansScraper } from "./spiderscans";
import { GDScansScraper } from "./gdscans";
import { GreedScansScraper } from "./greedscans";
import { MagusToonScraper } from "./magustoon";
import { YakshacomicsScraper } from "./yakshacomics";
import { MangasushiScraper } from "./mangasushi";
import { KsgroupscansScraper } from "./ksgroupscans";
import { KuramangaScraper } from "./kuramanga";
import { LHTranslationScraper } from "./lhtranslation";
import { KenscansScraper } from "./kenscans";
import { MangaKatanaScraper } from "./mangakatana";
import { MistScansScraper } from "./mistscans";
import { AthreaScansScraper } from "./athreascans";
import { HadesScansScraper } from "./hadesscans";
import { ScytheScansScraper } from "./scythescans";
import { WebtoonScraper } from "./webtoon";
import { SourceInfo } from "@/types";

const scrapers: BaseScraper[] = [
  new AtsuMoeScraper(),
  new LikeMangaScraper(),
  new MangaReadScraper(),
  new MgekoScraper(),
  new NovelCoolScraper(),
  new AsuraScanScraper(),
  new WeebCentralScraper(),
  new FlameComicsScraper(),
  new MangaloomScraper(),
  new MangayyScraper(),
  new LagoonScansScraper(),
  new RizzFablesScraper(),
  new DemonicscansScraper(),
  new RavenScansScraper(),
  new RdscansScraper(),
  new RitharscansScraper(),
  new RokariComicsScraper(),
  new MangataroScraper(),
  new KaliScanScraper(),
  new ProjectSukiScraper(),
  new ThunderscansScraper(),
  new VortexScansScraper(),
  new LuaComicScraper(),
  new VioletscansScraper(),
  new WitchscansScraper(),
  new ElfToonScraper(),
  new WritersScansScraper(),
  new MadaraScansScraper(),
  new ManhuaPlusScraper(),
  new SilentQuillScraper(),
  new TempleToonsScraper(),
  new AsmotoonScraper(),
  new SpiderScansScraper(),
  new GDScansScraper(),
  new GreedScansScraper(),
  new MagusToonScraper(),
  new YakshacomicsScraper(),
  new MangasushiScraper(),
  new KsgroupscansScraper(),
  new KuramangaScraper(),
  new LHTranslationScraper(),
  new KenscansScraper(),
  new MangaKatanaScraper(),
  new MistScansScraper(),
  new AthreaScansScraper(),
  new EvaScansScraper(),
  new HadesScansScraper(),
  new ScytheScansScraper(),
  new WebtoonScraper(),
];

export function getScraper(url: string): BaseScraper | null {
  return scrapers.find((scraper) => scraper.canHandle(url)) || null;
}

export function getScraperByName(name: string): BaseScraper | null {
  return (
    scrapers.find(
      (scraper) => scraper.getName().toLowerCase() === name.toLowerCase(),
    ) || null
  );
}

export function getAllScrapers(): BaseScraper[] {
  return scrapers;
}

export function getClientOnlyScrapers(): BaseScraper[] {
  return scrapers.filter((scraper) => scraper.isClientOnly());
}

export function getAllSourceInfo(): SourceInfo[] {
  return scrapers.map((scraper) => ({
    id: scraper.getName().toLowerCase().replace(/\s+/g, "-"),
    name: scraper.getName(),
    baseUrl: scraper.getBaseUrl(),
    description: scraper.getDescription(),
    clientOnly: scraper.isClientOnly(),
    type: scraper.getType(),
  }));
}

export {
  BaseScraper,
  AtsuMoeScraper,
  LikeMangaScraper,
  MangaReadScraper,
  MgekoScraper,
  NovelCoolScraper,
  AsuraScanScraper,
  WeebCentralScraper,
  FlameComicsScraper,
  MangaloomScraper,
  MangayyScraper,
  LagoonScansScraper,
  RizzFablesScraper,
  DemonicscansScraper,
  RavenScansScraper,
  RdscansScraper,
  RitharscansScraper,
  RokariComicsScraper,
  MangataroScraper,
  KaliScanScraper,
  ProjectSukiScraper,
  ThunderscansScraper,
  VortexScansScraper,
  LuaComicScraper,
  VioletscansScraper,
  WitchscansScraper,
  ElfToonScraper,
  WritersScansScraper,
  MadaraScansScraper,
  ManhuaPlusScraper,
  SilentQuillScraper,
  TempleToonsScraper,
  AsmotoonScraper,
  SpiderScansScraper,
  GDScansScraper,
  GreedScansScraper,
  MagusToonScraper,
  YakshacomicsScraper,
  MangasushiScraper,
  KsgroupscansScraper,
  KuramangaScraper,
  LHTranslationScraper,
  KenscansScraper,
  MangaKatanaScraper,
  MistScansScraper,
  AthreaScansScraper,
  EvaScansScraper,
  HadesScansScraper,
  ScytheScansScraper,
  WebtoonScraper,
};
