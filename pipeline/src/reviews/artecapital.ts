import { BaseReviewScraper } from './base-review-scraper.js';
import type { CriticReview } from '../types.js';

/**
 * Review scraper for ArteCapital / Contemporânea
 * https://www.artecapital.net
 *
 * ArteCapital covers visual arts, exhibitions, and contemporary art in Portugal.
 * Important for gallery and museum exhibition reviews.
 */
export class ArteCapitalReviewScraper extends BaseReviewScraper {
  id = 'artecapital';
  name = 'ArteCapital / Contemporânea';
  baseUrl = 'https://www.artecapital.net';

  private urls = [
    'https://www.artecapital.net/criticas',
    'https://www.artecapital.net/exposicoes',
    'https://www.artecapital.net',
  ];

  protected async extractReviews(): Promise<CriticReview[]> {
    const allReviews: CriticReview[] = [];

    for (const url of this.urls) {
      try {
        await this.goto(url);
        await this.scrollToLoad(2);

        const items = await this.page!.evaluate(() => {
          const results: Array<{
            title: string;
            excerpt: string;
            url: string;
            author: string;
            venue: string;
            date: string;
          }> = [];

          document
            .querySelectorAll('article, [class*="card"], [class*="item"], [class*="post"], .row > div')
            .forEach((el) => {
              const title =
                el
                  .querySelector('h2, h3, h4, [class*="title"]')
                  ?.textContent?.trim() || '';
              if (!title || title.length < 5) return;

              const excerptEl = el.querySelector(
                'p, [class*="excerpt"], [class*="desc"], [class*="text"]'
              );
              const venueEl = el.querySelector(
                '[class*="venue"], [class*="local"], [class*="galeria"], [class*="museu"]'
              );

              results.push({
                title,
                excerpt: excerptEl?.textContent?.trim()?.slice(0, 500) || '',
                url: (el.querySelector('a[href]') as HTMLAnchorElement)?.href || '',
                author:
                  el
                    .querySelector('[class*="author"], [class*="byline"]')
                    ?.textContent?.trim() || '',
                venue: venueEl?.textContent?.trim() || '',
                date:
                  el
                    .querySelector('time, [class*="date"]')
                    ?.textContent?.trim() || '',
              });
            });

          return results;
        });

        for (const item of items) {
          if (allReviews.some((r) => r.title === item.title)) continue;

          const combinedText = `${item.title} ${item.excerpt}`;

          allReviews.push({
            title: item.title,
            venue: item.venue || undefined,
            category: 'visual-arts',
            quote: item.excerpt.slice(0, 300) || item.title,
            fullText: item.excerpt,
            reviewerName: item.author || undefined,
            url: item.url,
            publishedDate: item.date || undefined,
            sentiment: this.inferSentiment(combinedText),
            source: this.id,
            scrapedAt: '',
          });
        }
      } catch (error) {
        console.warn(`[${this.id}] Failed to scrape ${url}:`, error);
      }
    }

    return allReviews;
  }
}
