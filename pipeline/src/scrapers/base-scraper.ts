import type { RawEvent, Scraper } from '../types.js';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * Base class for web scrapers using Playwright.
 * Each source website extends this and implements extractEvents().
 */
export abstract class BaseScraper implements Scraper {
  abstract id: string;
  abstract name: string;
  abstract baseUrl: string;

  protected browser: Browser | null = null;
  protected page: Page | null = null;

  async init(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'pt-PT',
    });
    this.page = await context.newPage();
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async scrape(): Promise<RawEvent[]> {
    try {
      await this.init();
      console.log(`[${this.id}] Scraping ${this.baseUrl}...`);
      const events = await this.extractEvents();
      console.log(`[${this.id}] Found ${events.length} events`);
      return events.map((e) => ({
        ...e,
        source: this.id,
        scrapedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.error(`[${this.id}] Scrape failed:`, error);
      return [];
    } finally {
      await this.cleanup();
    }
  }

  protected abstract extractEvents(): Promise<RawEvent[]>;

  /**
   * Navigate to URL with retry logic
   */
  protected async goto(url: string, retries = 2): Promise<void> {
    for (let i = 0; i <= retries; i++) {
      try {
        await this.page!.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        return;
      } catch (error) {
        if (i === retries) throw error;
        console.log(`[${this.id}] Retry ${i + 1} for ${url}`);
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      }
    }
  }

  /**
   * Wait for and scroll to load lazy content
   */
  protected async scrollToLoad(maxScrolls = 3): Promise<void> {
    for (let i = 0; i < maxScrolls; i++) {
      await this.page!.evaluate(() =>
        window.scrollBy(0, window.innerHeight)
      );
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/**
 * Base class for RSS feed sources.
 * Fetches and parses RSS/Atom XML.
 */
export abstract class RssScraper implements Scraper {
  abstract id: string;
  abstract name: string;
  abstract baseUrl: string;
  abstract feedUrl: string;

  async scrape(): Promise<RawEvent[]> {
    try {
      console.log(`[${this.id}] Fetching RSS from ${this.feedUrl}...`);
      const res = await fetch(this.feedUrl, {
        headers: {
          'User-Agent': 'LXCulture-Bot/1.0 (newsletter curation)',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const xml = await res.text();
      const events = this.parseRss(xml);
      console.log(`[${this.id}] Found ${events.length} events from RSS`);
      return events.map((e) => ({
        ...e,
        source: this.id,
        scrapedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.error(`[${this.id}] RSS fetch failed:`, error);
      return [];
    }
  }

  protected abstract parseRss(xml: string): RawEvent[];

  /**
   * Simple XML tag extraction helper
   */
  protected extractTag(xml: string, tag: string): string {
    const match = xml.match(
      new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
    );
    if (match) return match[1].trim();
    const match2 = xml.match(
      new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)
    );
    return match2 ? match2[1].trim() : '';
  }

  /**
   * Split RSS XML into individual items
   */
  protected getItems(xml: string): string[] {
    const items: string[] = [];
    const regex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = regex.exec(xml)) !== null) {
      items.push(m[1]);
    }
    // Also check for Atom entries
    if (items.length === 0) {
      const atomRegex = /<entry>([\s\S]*?)<\/entry>/g;
      while ((m = atomRegex.exec(xml)) !== null) {
        items.push(m[1]);
      }
    }
    return items;
  }
}
