export type Category =
  | 'artes-performativas'
  | 'artes-visuais'
  | 'literatura'
  | 'musica-noite';

export const CATEGORY_LABELS: Record<Category, string> = {
  'artes-performativas': 'Artes Performativas & Cinema',
  'artes-visuais': 'Artes Visuais & Exposições',
  'literatura': 'Literatura & Conversas',
  'musica-noite': 'Música ao Vivo & Noite',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  'artes-performativas': 'var(--cor-magenta)',
  'artes-visuais': 'var(--cor-primaria)',
  'literatura': 'var(--cor-amarelo)',
  'musica-noite': 'var(--cor-violeta)',
};

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
