import { BaseScraper } from './base-scraper.js';
import type { RawEvent } from '../types.js';

/**
 * Scraper for Eventbrite Lisboa — Culture & Fado
 * https://www.eventbrite.com/d/portugal--lisboa/culture/
 * https://www.eventbrite.pt/d/portugal--lisboa/fado/
 *
 * Eventbrite has structured data and good local events.
 */
export class EventbriteLisboaScraper extends BaseScraper {
  id = 'eventbrite-lisboa';
  name = 'Eventbrite Lisboa';
  baseUrl = 'https://www.eventbrite.com';

  private urls = [
    'https://www.eventbrite.com/d/portugal--lisboa/culture/',
    'https://www.eventbrite.pt/d/portugal--lisboa/fado/',
    'https://www.eventbrite.com/d/portugal--lisboa/performing-arts/',
    'https://www.eventbrite.com/d/portugal--lisboa/music/',
  ];

  protected async extractEvents(): Promise<RawEvent[]> {
    const allEvents: RawEvent[] = [];

    for (const url of this.urls) {
      try {
        await this.goto(url);
        await this.scrollToLoad(3);

        // Eventbrite often embeds JSON-LD structured data
        const jsonLdEvents = await this.page!.evaluate(() => {
          const scripts = document.querySelectorAll(
            'script[type="application/ld+json"]'
          );
          const events: Array<{
            title: string;
            description: string;
            url: string;
            imageUrl: string;
            startDate: string;
            endDate: string;
            venue: string;
            address: string;
            price: string;
          }> = [];

          scripts.forEach((script) => {
            try {
              const data = JSON.parse(script.textContent || '');
              const items = Array.isArray(data) ? data : [data];
              for (const item of items) {
                if (
                  item['@type'] === 'Event' ||
                  item['@type'] === 'MusicEvent'
                ) {
                  events.push({
                    title: item.name || '',
                    description: item.description || '',
                    url: item.url || '',
                    imageUrl: item.image || '',
                    startDate: item.startDate || '',
                    endDate: item.endDate || '',
                    venue: item.location?.name || '',
                    address:
                      item.location?.address?.addressLocality || 'Lisboa',
                    price: item.offers?.price
                      ? `${item.offers.price}${item.offers.priceCurrency || '€'}`
                      : '',
                  });
                }
              }
            } catch {
              // Invalid JSON
            }
          });

          return events;
        });

        if (jsonLdEvents.length > 0) {
          for (const item of jsonLdEvents) {
            if (allEvents.some((e) => e.title === item.title)) continue;
            allEvents.push({
              title: item.title,
              rawDescription: item.description,
              url: item.url,
              imageUrl: item.imageUrl || undefined,
              dateText: item.startDate || undefined,
              venue: item.venue || undefined,
              neighborhood: item.address || undefined,
              priceText: item.price || undefined,
            });
          }
        }

        // Fallback: scrape DOM if no JSON-LD
        if (jsonLdEvents.length === 0) {
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
                '[class*="event-card"], article, [data-testid*="event"]'
              )
              .forEach((card) => {
                const title =
                  card
                    .querySelector('h2, h3, [class*="title"]')
                    ?.textContent?.trim() || '';
                if (!title || title.length < 5) return;

                results.push({
                  title,
                  description:
                    card
                      .querySelector('p, [class*="desc"]')
                      ?.textContent?.trim() || '',
                  url:
                    (card.querySelector('a[href]') as HTMLAnchorElement)
                      ?.href || '',
                  imageUrl:
                    (card.querySelector('img') as HTMLImageElement)?.src ||
                    '',
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
            if (allEvents.some((e) => e.title === item.title)) continue;
            allEvents.push({
              title: item.title,
              rawDescription: item.description,
              url: item.url,
              imageUrl: item.imageUrl || undefined,
              dateText: item.dateText || undefined,
              venue: item.venue || undefined,
              priceText: item.price || undefined,
            });
          }
        }
      } catch (error) {
        console.warn(`[${this.id}] Failed to scrape ${url}:`, error);
      }
    }

    return allEvents;
  }
}
