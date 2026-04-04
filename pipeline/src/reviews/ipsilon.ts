import { BaseReviewScraper } from './base-review-scraper.js';
import type { CriticReview } from '../types.js';

/**
 * Review scraper for Ípsilon (Público newspaper's culture section)
 * https://www.publico.pt/culturaipsilon
 *
 * Ípsilon is Portugal's most respected cultural review section.
 * Covers: music, theatre, cinema, visual arts, books, dance.
 * Reviews include star ratings and detailed criticism.
 */
export class IpsilonReviewScraper extends BaseReviewScraper {
  id = 'ipsilon';
  name = 'Ípsilon / Público';
  baseUrl = 'https://www.publico.pt/culturaipsilon';

  private urls = [
    'https://www.publico.pt/culturaipsilon',
    'https://www.publico.pt/culturaipsilon/critica',
    'https://www.publico.pt/culturaipsilon/musica',
    'https://www.publico.pt/culturaipsilon/teatro',
    'https://www.publico.pt/culturaipsilon/artes',
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
            category: string;
            rating: string;
          }> = [];

          // Público uses article elements with headline and summary
          document
            .querySelectorAll('article, [class*="card"], [class*="story"], [class*="item"]')
            .forEach((el) => {
              const titleEl = el.querySelector(
                'h2, h3, h4, [class*="headline"], [class*="title"]'
              );
              const title = titleEl?.textContent?.trim() || '';
              if (!title || title.length < 10) return;

              // Reviews often have "Crítica:" or star ratings
              const fullText = el.textContent || '';
              const isReview =
                /cr[ií]tica/i.test(fullText) ||
                /★/.test(fullText) ||
                /\d\/5/.test(fullText) ||
                /recensão/i.test(fullText);

              // Even non-explicit reviews from Ípsilon have editorial value
              const excerptEl = el.querySelector(
                'p, [class*="lead"], [class*="excerpt"], [class*="summary"], [class*="description"]'
              );

              results.push({
                title,
                excerpt: excerptEl?.textContent?.trim()?.slice(0, 500) || '',
                url: (el.querySelector('a[href]') as HTMLAnchorElement)?.href || '',
                author:
                  el
                    .querySelector('[class*="author"], [class*="byline"], [rel="author"]')
                    ?.textContent?.trim() || '',
                date:
                  el
                    .querySelector('time, [class*="date"], [class*="data"]')
                    ?.textContent?.trim() || '',
                category:
                  el
                    .querySelector('[class*="section"], [class*="category"], [class*="tag"]')
                    ?.textContent?.trim() || '',
                rating: isReview ? (fullText.match(/[★]{1,5}/)?.[0] || '') : '',
              });
            });

          return results;
        });

        for (const item of items) {
          if (allReviews.some((r) => r.title === item.title)) continue;

          const combinedText = `${item.title} ${item.excerpt} ${item.rating}`;

          allReviews.push({
            title: item.title,
            quote: item.excerpt.slice(0, 300) || item.title,
            fullText: item.excerpt,
            reviewerName: item.author || undefined,
            url: item.url,
            publishedDate: item.date || undefined,
            category: item.category || undefined,
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
