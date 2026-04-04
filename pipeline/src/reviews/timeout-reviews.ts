import { BaseReviewScraper } from './base-review-scraper.js';
import type { CriticReview } from '../types.js';

/**
 * Review scraper for Time Out Lisboa
 * https://www.timeout.pt/lisboa/pt/cultura
 *
 * Time Out has curated "best of" lists and star-rated reviews.
 * Their editorial picks are highly relevant for local cultural curation.
 */
export class TimeOutReviewScraper extends BaseReviewScraper {
  id = 'timeout-reviews';
  name = 'Time Out Lisboa';
  baseUrl = 'https://www.timeout.pt';

  private urls = [
    'https://www.timeout.pt/lisboa/pt/arte/as-melhores-exposicoes-em-lisboa',
    'https://www.timeout.pt/lisboa/pt/musica/os-melhores-concertos-em-lisboa',
    'https://www.timeout.pt/lisboa/pt/teatro-danca/as-melhores-pecas-de-teatro-em-lisboa',
    'https://www.timeout.pt/lisboa/pt/cultura',
    'https://www.timeout.pt/lisboa/pt/cinema/os-melhores-filmes-em-cartaz',
  ];

  protected async extractReviews(): Promise<CriticReview[]> {
    const allReviews: CriticReview[] = [];

    for (const url of this.urls) {
      try {
        await this.goto(url);
        await this.scrollToLoad(3);

        const items = await this.page!.evaluate(() => {
          const results: Array<{
            title: string;
            description: string;
            url: string;
            venue: string;
            rating: string;
            category: string;
          }> = [];

          document
            .querySelectorAll('article, [class*="tile"], [class*="card"], [class*="listing"]')
            .forEach((el) => {
              const title =
                el
                  .querySelector('h2, h3, h4, [class*="title"], [class*="heading"]')
                  ?.textContent?.trim() || '';
              if (!title || title.length < 5) return;

              // Time Out uses star ratings (★) and recommendation labels
              const fullText = el.textContent || '';
              const ratingEl = el.querySelector(
                '[class*="rating"], [class*="star"], [class*="score"]'
              );
              const ratingText = ratingEl?.textContent?.trim() || '';

              // Check for "Recomendado" or "Escolha Time Out" labels
              const isRecommended =
                /recomendad/i.test(fullText) ||
                /escolha\s+time\s+out/i.test(fullText) ||
                /editor.*pick/i.test(fullText) ||
                /imperd[ií]vel/i.test(fullText);

              const descEl = el.querySelector(
                'p, [class*="desc"], [class*="summary"], [class*="excerpt"]'
              );
              const venueEl = el.querySelector(
                '[class*="venue"], [class*="location"]'
              );

              results.push({
                title,
                description: descEl?.textContent?.trim()?.slice(0, 500) || '',
                url: (el.querySelector('a[href]') as HTMLAnchorElement)?.href || '',
                venue: venueEl?.textContent?.trim() || '',
                rating: ratingText || (isRecommended ? 'Recomendado' : ''),
                category:
                  el
                    .querySelector('[class*="category"], [class*="label"]')
                    ?.textContent?.trim() || '',
              });
            });

          return results;
        });

        for (const item of items) {
          if (allReviews.some((r) => r.title === item.title)) continue;

          const combinedText = `${item.title} ${item.description} ${item.rating}`;
          const isRecommended = /recomendad|escolha|imperd/i.test(combinedText);

          allReviews.push({
            title: item.title,
            venue: item.venue || undefined,
            category: item.category || undefined,
            quote: item.description.slice(0, 300) || item.title,
            fullText: item.description,
            url: item.url,
            rating: this.extractRating(combinedText) || (isRecommended ? 4 : undefined),
            ratingLabel: item.rating || undefined,
            sentiment: isRecommended
              ? 'positive'
              : this.inferSentiment(combinedText),
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
