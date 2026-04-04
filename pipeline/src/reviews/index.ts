import type { ReviewScraper } from '../types.js';
import { IpsilonReviewScraper } from './ipsilon.js';
import { TimeOutReviewScraper } from './timeout-reviews.js';
import { BlitzReviewScraper } from './blitz.js';
import { ArteCapitalReviewScraper } from './artecapital.js';

export function getAllReviewScrapers(): ReviewScraper[] {
  return [
    new IpsilonReviewScraper(),
    new TimeOutReviewScraper(),
    new BlitzReviewScraper(),
    new ArteCapitalReviewScraper(),
  ];
}
