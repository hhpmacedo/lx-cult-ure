import { BaseScraper } from './base-scraper.js';
import type { RawEvent } from '../types.js';

/**
 * Scraper for Time Out Lisboa — Cultura
 * https://www.timeout.pt/lisboa/pt/cultura
 *
 * Time Out is key because they have editorial reviews and curated picks.
 * Also scrapes the "free events this week" page.
 */
export class TimeOutLisboaScraper extends BaseScraper {
  id = 'timeout-lisboa';
  name = 'Time Out Lisboa';
  baseUrl = 'https://www.timeout.pt';

  private urls = [
    'https://www.timeout.pt/lisboa/pt/cultura',
    'https://www.timeout.pt/lisboa/pt/coisas-para-fazer/gratis-em-lisboa-esta-semana',
    'https://www.timeout.pt/lisboa/pt/musica',
    'https://www.timeout.pt/lisboa/pt/teatro-danca',
    'https://www.timeout.pt/lisboa/pt/arte',
  ];

  protected async extractEvents(): Promise<RawEvent[]> {
    const allEvents: RawEvent[] = [];

    for (const url of this.urls) {
      try {
        await this.goto(url);
        await this.scrollToLoad(2);

        const items = await this.page!.evaluate((pageUrl: string) => {
          const results: Array<{
            title: string;
            description: string;
            url: string;
            imageUrl: string;
            dateText: string;
            venue: string;
            category: string;
          }> = [];

          // Time Out uses article cards with various class patterns
          const selectors = [
            'article',
            '[class*="tile"]',
            '[class*="card"]',
            '[class*="listing"]',
            'li[class*="item"]',
          ];

          for (const selector of selectors) {
            const cards = document.querySelectorAll(selector);
            if (cards.length >= 2) {
              cards.forEach((card) => {
                const titleEl = card.querySelector(
                  'h2, h3, h4, [class*="title"], [class*="heading"]'
                );
                const linkEl = card.querySelector(
                  'a[href]'
                ) as HTMLAnchorElement;
                const imgEl = card.querySelector(
                  'img[src], img[data-src]'
                ) as HTMLImageElement;
                const descEl = card.querySelector(
                  'p, [class*="desc"], [class*="summary"], [class*="excerpt"]'
                );
                const venueEl = card.querySelector(
                  '[class*="venue"], [class*="location"]'
                );
                const dateEl = card.querySelector(
                  'time, [class*="date"]'
                );
                const catEl = card.querySelector(
                  '[class*="category"], [class*="label"]'
                );

                const title = titleEl?.textContent?.trim() || '';
                if (!title || title.length < 5) return;

                // Avoid navigation/UI elements
                if (
                  title.toLowerCase().includes('menu') ||
                  title.toLowerCase().includes('pesquisar')
                )
                  return;

                results.push({
                  title,
                  description: descEl?.textContent?.trim() || '',
                  url: linkEl?.href || pageUrl,
                  imageUrl:
                    imgEl?.src ||
                    imgEl?.getAttribute('data-src') ||
                    '',
                  dateText: dateEl?.textContent?.trim() || '',
                  venue: venueEl?.textContent?.trim() || '',
                  category: catEl?.textContent?.trim() || '',
                });
              });
              break;
            }
          }

          return results;
        }, url);

        for (const item of items) {
          // Deduplicate
          if (allEvents.some((e) => e.title === item.title)) continue;
          allEvents.push({
            title: item.title,
            rawDescription: item.description,
            url: item.url,
            imageUrl: item.imageUrl || undefined,
            dateText: item.dateText || undefined,
            venue: item.venue || undefined,
            category: item.category || undefined,
            source: this.id,
            scrapedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn(`[${this.id}] Failed to scrape ${url}:`, error);
      }
    }

    return allEvents;
  }
}
