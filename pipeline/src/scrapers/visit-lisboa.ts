import { BaseScraper } from './base-scraper.js';
import type { RawEvent } from '../types.js';

/**
 * Scraper for Visit Lisboa — Eventos
 * https://www.visitlisboa.com/pt-pt/eventos
 *
 * Official tourism board events page. Despite being tourism-oriented,
 * it has comprehensive cultural event listings that the AI curator
 * will filter for local relevance.
 */
export class VisitLisboaScraper extends BaseScraper {
  id = 'visit-lisboa';
  name = 'Visit Lisboa';
  baseUrl = 'https://www.visitlisboa.com';

  protected async extractEvents(): Promise<RawEvent[]> {
    const events: RawEvent[] = [];

    await this.goto('https://www.visitlisboa.com/pt-pt/eventos');
    await this.scrollToLoad(4);

    const items = await this.page!.evaluate(() => {
      const results: Array<{
        title: string;
        description: string;
        url: string;
        imageUrl: string;
        dateText: string;
        venue: string;
        category: string;
      }> = [];

      // Try multiple selector strategies
      const cards = document.querySelectorAll(
        'article, [class*="event"], [class*="card"], [class*="listing-item"], .row > div[class*="col"]'
      );

      cards.forEach((card) => {
        const titleEl = card.querySelector(
          'h2, h3, h4, [class*="title"], [class*="name"]'
        );
        const linkEl = card.querySelector('a[href]') as HTMLAnchorElement;
        const imgEl = card.querySelector('img') as HTMLImageElement;
        const descEl = card.querySelector(
          'p, [class*="desc"], [class*="summary"]'
        );
        const dateEl = card.querySelector(
          'time, [class*="date"], [class*="data"]'
        );
        const venueEl = card.querySelector(
          '[class*="venue"], [class*="local"], [class*="location"]'
        );
        const catEl = card.querySelector(
          '[class*="category"], [class*="tipo"]'
        );

        const title = titleEl?.textContent?.trim() || '';
        if (!title || title.length < 5) return;

        results.push({
          title,
          description: descEl?.textContent?.trim() || '',
          url: linkEl?.href || '',
          imageUrl: imgEl?.src || '',
          dateText: dateEl?.textContent?.trim() || '',
          venue: venueEl?.textContent?.trim() || '',
          category: catEl?.textContent?.trim() || '',
        });
      });

      return results;
    });

    for (const item of items) {
      events.push({
        title: item.title,
        rawDescription: item.description,
        url: item.url || 'https://www.visitlisboa.com/pt-pt/eventos',
        imageUrl: item.imageUrl || undefined,
        dateText: item.dateText || undefined,
        venue: item.venue || undefined,
        category: item.category || undefined,
        source: this.id,
        scrapedAt: new Date().toISOString(),
      });
    }

    return events;
  }
}
