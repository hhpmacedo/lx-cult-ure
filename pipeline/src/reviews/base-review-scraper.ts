import { chromium, type Browser, type Page } from 'playwright';
import type { CriticReview, ReviewScraper } from '../types.js';

/**
 * Base class for review scrapers.
 * Review scrapers focus on extracting critic opinions, ratings, and quotes
 * rather than event listings.
 */
export abstract class BaseReviewScraper implements ReviewScraper {
  abstract id: string;
  abstract name: string;
  abstract baseUrl: string;

  protected browser: Browser | null = null;
  protected page: Page | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'pt-PT',
    });
    this.page = await context.newPage();
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async scrapeReviews(): Promise<CriticReview[]> {
    try {
      await this.init();
      console.log(`[${this.id}] Scraping reviews from ${this.baseUrl}...`);
      const reviews = await this.extractReviews();
      console.log(`[${this.id}] Found ${reviews.length} reviews`);
      return reviews.map((r) => ({
        ...r,
        source: this.id,
        scrapedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.error(`[${this.id}] Review scrape failed:`, error);
      return [];
    } finally {
      await this.cleanup();
    }
  }

  protected abstract extractReviews(): Promise<CriticReview[]>;

  protected async goto(url: string, retries = 2): Promise<void> {
    for (let i = 0; i <= retries; i++) {
      try {
        await this.page!.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        return;
      } catch (error) {
        if (i === retries) throw error;
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      }
    }
  }

  protected async scrollToLoad(maxScrolls = 3): Promise<void> {
    for (let i = 0; i < maxScrolls; i++) {
      await this.page!.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  /**
   * Helper: infer sentiment from text cues (PT/EN)
   */
  protected inferSentiment(text: string): CriticReview['sentiment'] {
    const lower = text.toLowerCase();
    const positiveWords = [
      'excelente', 'brilhante', 'imperdível', 'magnífico', 'extraordinário',
      'notável', 'essencial', 'recomendado', 'surpreendente', 'obra-prima',
      'ótimo', 'incrível', 'fantástico', 'maravilhoso', 'genial',
      'excellent', 'brilliant', 'masterpiece', 'outstanding', 'must-see',
      '★★★★', '★★★★★', '4/5', '5/5', '9/10', '10/10',
    ];
    const negativeWords = [
      'decepcionante', 'fraco', 'medíocre', 'dispensável', 'evitar',
      'desinteressante', 'aborrecido', 'mau', 'péssimo', 'desilusão',
      'disappointing', 'weak', 'poor', 'avoid', 'boring',
      '★', '1/5', '2/10',
    ];

    const posCount = positiveWords.filter((w) => lower.includes(w)).length;
    const negCount = negativeWords.filter((w) => lower.includes(w)).length;

    if (posCount > negCount + 1) return 'positive';
    if (negCount > posCount + 1) return 'negative';
    if (posCount > 0 && negCount > 0) return 'mixed';
    if (posCount > 0) return 'positive';
    if (negCount > 0) return 'negative';
    return 'neutral';
  }

  /**
   * Helper: extract a star rating if present
   */
  protected extractRating(text: string): number | undefined {
    // ★★★★☆ pattern
    const stars = text.match(/[★]{1,5}/);
    if (stars) return stars[0].length;

    // X/5 pattern
    const outOf5 = text.match(/(\d(?:\.\d)?)\s*\/\s*5/);
    if (outOf5) return parseFloat(outOf5[1]);

    // X/10 pattern (normalize to 5)
    const outOf10 = text.match(/(\d(?:\.\d)?)\s*\/\s*10/);
    if (outOf10) return parseFloat(outOf10[1]) / 2;

    return undefined;
  }
}
