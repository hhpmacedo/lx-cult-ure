import { BaseScraper } from './base-scraper.js';
import type { RawEvent } from '../types.js';

/**
 * Scraper for Lisboa Live — What's On
 * https://www.lisboa-live.com/en/whats-on.html
 */
export class LisboaLiveScraper extends BaseScraper {
  id = 'lisboa-live';
  name = 'Lisboa Live';
  baseUrl = 'https://www.lisboa-live.com';

  protected async extractEvents(): Promise<RawEvent[]> {
    const events: RawEvent[] = [];

    await this.goto('https://www.lisboa-live.com/en/whats-on.html');
    await this.scrollToLoad(3);

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

      document
        .querySelectorAll(
          'article, [class*="event"], [class*="card"], [class*="item"]'
        )
        .forEach((card) => {
          const title =
            card
              .querySelector('h2, h3, h4, [class*="title"]')
              ?.textContent?.trim() || '';
          if (!title || title.length < 5) return;

          results.push({
            title,
            description:
              card
                .querySelector('p, [class*="desc"], [class*="text"]')
                ?.textContent?.trim() || '',
            url:
              (card.querySelector('a[href]') as HTMLAnchorElement)?.href ||
              '',
            imageUrl:
              (card.querySelector('img') as HTMLImageElement)?.src || '',
            dateText:
              card
                .querySelector('time, [class*="date"], [class*="when"]')
                ?.textContent?.trim() || '',
            venue:
              card
                .querySelector(
                  '[class*="venue"], [class*="where"], [class*="location"]'
                )
                ?.textContent?.trim() || '',
            category:
              card
                .querySelector('[class*="category"], [class*="type"]')
                ?.textContent?.trim() || '',
          });
        });

      return results;
    });

    for (const item of items) {
      events.push({
        title: item.title,
        rawDescription: item.description,
        url: item.url || 'https://www.lisboa-live.com/en/whats-on.html',
        imageUrl: item.imageUrl || undefined,
        dateText: item.dateText || undefined,
        venue: item.venue || undefined,
        category: item.category || undefined,
      });
    }

    return events;
  }
}
