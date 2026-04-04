import { BaseScraper } from './base-scraper.js';
import type { RawEvent } from '../types.js';

/**
 * Scraper for Cartaz Cultural de Lisboa
 * https://cartazculturallisboa.pt
 *
 * Main source for local cultural events in Lisbon.
 * Uses Playwright because the site blocks direct HTTP requests.
 */
export class CartazCulturalScraper extends BaseScraper {
  id = 'cartaz-cultural';
  name = 'Cartaz Cultural de Lisboa';
  baseUrl = 'https://cartazculturallisboa.pt';

  protected async extractEvents(): Promise<RawEvent[]> {
    const events: RawEvent[] = [];

    // Scrape main listings page
    await this.goto(this.baseUrl);
    await this.scrollToLoad(3);

    // Try to find event cards — adapt selectors based on site structure
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

      // Common patterns for event listing sites
      const selectors = [
        'article',
        '.event-card',
        '.post',
        '.listing-item',
        '[class*="event"]',
        '[class*="card"]',
      ];

      for (const selector of selectors) {
        const cards = document.querySelectorAll(selector);
        if (cards.length >= 3) {
          cards.forEach((card) => {
            const titleEl =
              card.querySelector('h2, h3, h4, [class*="title"]');
            const linkEl = card.querySelector('a[href]') as HTMLAnchorElement;
            const imgEl = card.querySelector('img') as HTMLImageElement;
            const dateEl = card.querySelector(
              'time, [class*="date"], [class*="data"]'
            );
            const venueEl = card.querySelector(
              '[class*="venue"], [class*="local"], [class*="location"]'
            );
            const catEl = card.querySelector(
              '[class*="categor"], [class*="tag"]'
            );
            const descEl = card.querySelector(
              'p, [class*="desc"], [class*="excerpt"]'
            );

            const title = titleEl?.textContent?.trim() || '';
            if (!title || title.length < 3) return;

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
          break;
        }
      }

      return results;
    });

    for (const item of items) {
      if (!item.title) continue;
      events.push({
        title: item.title,
        rawDescription: item.description,
        url: item.url || this.baseUrl,
        imageUrl: item.imageUrl || undefined,
        dateText: item.dateText || undefined,
        venue: item.venue || undefined,
        category: item.category || undefined,
      });
    }

    // Also try to scrape category pages for more complete coverage
    const categoryPages = [
      '/concertos/',
      '/teatro/',
      '/exposicoes/',
      '/cinema/',
      '/festas/',
    ];

    for (const path of categoryPages.slice(0, 3)) {
      try {
        await this.goto(`${this.baseUrl}${path}`);
        await this.scrollToLoad(2);

        const catItems = await this.page!.evaluate(() => {
          const results: Array<{
            title: string;
            description: string;
            url: string;
            dateText: string;
            venue: string;
          }> = [];

          document
            .querySelectorAll('article, .event-card, [class*="card"]')
            .forEach((card) => {
              const title =
                card
                  .querySelector('h2, h3, h4, [class*="title"]')
                  ?.textContent?.trim() || '';
              const link = (card.querySelector('a[href]') as HTMLAnchorElement)
                ?.href;
              if (!title || title.length < 3) return;
              results.push({
                title,
                description:
                  card
                    .querySelector('p, [class*="desc"]')
                    ?.textContent?.trim() || '',
                url: link || '',
                dateText:
                  card
                    .querySelector('time, [class*="date"]')
                    ?.textContent?.trim() || '',
                venue:
                  card
                    .querySelector('[class*="venue"], [class*="local"]')
                    ?.textContent?.trim() || '',
              });
            });

          return results;
        });

        for (const item of catItems) {
          // Deduplicate by title
          if (events.some((e) => e.title === item.title)) continue;
          events.push({
            title: item.title,
            rawDescription: item.description,
            url: item.url || `${this.baseUrl}${path}`,
            dateText: item.dateText || undefined,
            venue: item.venue || undefined,
          });
        }
      } catch {
        // Category page might not exist
      }
    }

    return events;
  }
}
