import type { Scraper } from '../types.js';
import { CartazCulturalScraper } from './cartaz-cultural.js';
import { TimeOutLisboaScraper } from './timeout-lisboa.js';
import { VisitLisboaScraper } from './visit-lisboa.js';
import { EventbriteLisboaScraper } from './eventbrite-lisboa.js';
import { LisboaLiveScraper } from './lisboa-live.js';
import { FeverLisboaScraper } from './fever-lisboa.js';

/**
 * Registry of all available scrapers.
 * To add a new source: create a scraper class and add it here.
 */
export function getAllScrapers(): Scraper[] {
  return [
    new CartazCulturalScraper(),
    new TimeOutLisboaScraper(),
    new VisitLisboaScraper(),
    new EventbriteLisboaScraper(),
    new LisboaLiveScraper(),
    new FeverLisboaScraper(),
  ];
}

/**
 * Get scrapers by ID. Useful for running specific scrapers.
 */
export function getScrapers(ids?: string[]): Scraper[] {
  const all = getAllScrapers();
  if (!ids || ids.length === 0) return all;
  return all.filter((s) => ids.includes(s.id));
}
