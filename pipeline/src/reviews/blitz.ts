import { BaseReviewScraper } from './base-review-scraper.js';
import type { CriticReview } from '../types.js';

/**
 * Review scraper for Blitz (music/concert reviews)
 * https://blitz.pt
 *
 * Blitz is Portugal's main music publication.
 * Covers: concert reviews, album reviews, festival coverage.
 */
export class BlitzReviewScraper extends BaseReviewScraper {
  id = 'blitz';
  name = 'Blitz';
  baseUrl = 'https://blitz.pt';

  private urls = [
    'https://blitz.pt/principal/update',
    'https://blitz.pt/reviews',
    'https://blitz.pt/concertos',
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
            date: string;
            rating: string;
          }> = [];

          document
            .querySelectorAll('article, [class*="card"], [class*="item"], [class*="post"]')
            .forEach((el) => {
              const title =
                el
                  .querySelector('h2, h3, h4, [class*="title"], [class*="headline"]')
                  ?.textContent?.trim() || '';
              if (!title || title.length < 5) return;

              const excerptEl = el.querySelector(
                'p, [class*="excerpt"], [class*="lead"], [class*="desc"]'
              );
              const ratingEl = el.querySelector(
                '[class*="rating"], [class*="score"], [class*="star"]'
              );

              results.push({
                title,
                excerpt: excerptEl?.textContent?.trim()?.slice(0, 500) || '',
                url: (el.querySelector('a[href]') as HTMLAnchorElement)?.href || '',
                author:
                  el
                    .querySelector('[class*="author"], [class*="byline"]')
                    ?.textContent?.trim() || '',
                date:
                  el
                    .querySelector('time, [class*="date"]')
                    ?.textContent?.trim() || '',
                rating: ratingEl?.textContent?.trim() || '',
              });
            });

          return results;
        });

        for (const item of items) {
          if (allReviews.some((r) => r.title === item.title)) continue;

          const combinedText = `${item.title} ${item.excerpt} ${item.rating}`;

          allReviews.push({
            title: item.title,
            category: 'music',
            quote: item.excerpt.slice(0, 300) || item.title,
            fullText: item.excerpt,
            reviewerName: item.author || undefined,
            url: item.url,
            publishedDate: item.date || undefined,
            rating: this.extractRating(combinedText),
            ratingLabel: item.rating || undefined,
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
