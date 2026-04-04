export interface RawEvent {
  title: string;
  rawDescription: string;
  venue?: string;
  neighborhood?: string;
  dateText?: string;
  timeText?: string;
  priceText?: string;
  category?: string;
  imageUrl?: string;
  url: string;
  source: string;
  scrapedAt: string;
}

export interface Scraper {
  id: string;
  name: string;
  baseUrl: string;
  scrape(): Promise<RawEvent[]>;
}

export type Category =
  | 'artes-performativas'
  | 'artes-visuais'
  | 'literatura'
  | 'musica-noite';

export interface CuratedEvent {
  id: string;
  title: string;
  category: Category;
  venue: string;
  venueNeighborhood: string;
  dates: string;
  time?: string;
  price?: string;
  blurb: string;
  criticSource?: string;
  criticQuote?: string;
  originalUrl?: string;
  imageUrl?: string;
  tags: string[];
  aiScore: number;
  featured: boolean;
}

export interface Edition {
  slug: string;
  weekNumber: number;
  year: number;
  dateRange: {
    start: string;
    end: string;
  };
  introText: string;
  publishedAt: string;
  events: CuratedEvent[];
}

export interface PipelineConfig {
  cacheDir: string;
  contentDir: string;
  weekId: string;
  weekStart: string;
  weekEnd: string;
}
