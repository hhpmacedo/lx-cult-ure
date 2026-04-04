import { BaseScraper } from './base-scraper.js';
import type { RawEvent } from '../types.js';

/**
 * Scraper for Fever Lisboa
 * https://feverup.com/pt/lisboa
 *
 * Fever is a global events platform. Some events are tourist-oriented
 * but it has good local culture coverage. The AI curator will filter.
 */
export class FeverLisboaScraper extends BaseScraper {
  id = 'fever-lisboa';
  name = 'Fever Lisboa';
  baseUrl = 'https://feverup.com';

  protected async extractEvents(): Promise<RawEvent[]> {
    const events: RawEvent[] = [];

    // Fever is a React SPA — needs time to render
    await this.goto('https://feverup.com/pt/lisboa');
    await new Promise((r) => setTimeout(r, 3000));
    await this.scrollToLoad(4);

    // Try JSON-LD first (many event platforms embed it)
    const jsonLdEvents = await this.page!.evaluate(() => {
      const events: Array<{
        title: string;
        description: string;
        url: string;
        imageUrl: string;
        startDate: string;
        venue: string;
        price: string;
      }> = [];

      document
        .querySelectorAll('script[type="application/ld+json"]')
        .forEach((script) => {
          try {
            const data = JSON.parse(script.textContent || '');
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item['@type'] === 'Event') {
                events.push({
                  title: item.name || '',
                  description: item.description || '',
                  url: item.url || '',
                  imageUrl: item.image || '',
                  startDate: item.startDate || '',
                  venue: item.location?.name || '',
                  price: item.offers?.price
                    ? `${item.offers.price}€`
                    : '',
                });
              }
            }
          } catch {
            // ignore
          }
        });

      return events;
    });

    if (jsonLdEvents.length > 0) {
      for (const item of jsonLdEvents) {
        events.push({
          title: item.title,
          rawDescription: item.description,
          url: item.url,
          imageUrl: item.imageUrl || undefined,
          dateText: item.startDate || undefined,
          venue: item.venue || undefined,
          priceText: item.price || undefined,
          source: this.id,
          scrapedAt: new Date().toISOString(),
        });
      }
      return events;
    }

    // Fallback: DOM scraping
    const domEvents = await this.page!.evaluate(() => {
      const results: Array<{
        title: string;
        description: string;
        url: string;
        imageUrl: string;
        dateText: string;
        venue: string;
        price: string;
      }> = [];

      document
        .querySelectorAll(
          '[class*="card"], [class*="event"], article, [class*="plan"]'
        )
        .forEach((card) => {
          const title =
            card
              .querySelector(
                'h2, h3, h4, [class*="title"], [class*="name"]'
              )
              ?.textContent?.trim() || '';
          if (!title || title.length < 5) return;

          results.push({
            title,
            description:
              card
                .querySelector('p, [class*="desc"]')
                ?.textContent?.trim() || '',
            url:
              (card.querySelector('a[href]') as HTMLAnchorElement)?.href ||
              '',
            imageUrl:
              (card.querySelector('img') as HTMLImageElement)?.src || '',
            dateText:
              card
                .querySelector('time, [class*="date"]')
                ?.textContent?.trim() || '',
            venue:
              card
                .querySelector('[class*="venue"], [class*="location"]')
                ?.textContent?.trim() || '',
            price:
              card
                .querySelector('[class*="price"]')
                ?.textContent?.trim() || '',
          });
        });

      return results;
    });

    for (const item of domEvents) {
      events.push({
        title: item.title,
        rawDescription: item.description,
        url: item.url || 'https://feverup.com/pt/lisboa',
        imageUrl: item.imageUrl || undefined,
        dateText: item.dateText || undefined,
        venue: item.venue || undefined,
        priceText: item.price || undefined,
        source: this.id,
        scrapedAt: new Date().toISOString(),
      });
    }

    return events;
  }
}
