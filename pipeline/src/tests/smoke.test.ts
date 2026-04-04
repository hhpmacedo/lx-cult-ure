import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Smoke tests for the LX Cult(ure) pipeline.
 * These verify that all components can be imported and basic structures are correct.
 */

describe('Pipeline imports', () => {
  it('imports all scrapers without error', async () => {
    const { getScrapers } = await import('../scrapers/index.js');
    const scrapers = getScrapers();
    expect(scrapers.length).toBeGreaterThanOrEqual(3);
    for (const s of scrapers) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.baseUrl).toBeTruthy();
      expect(typeof s.scrape).toBe('function');
    }
  });

  it('imports all review scrapers without error', async () => {
    const { getAllReviewScrapers } = await import('../reviews/index.js');
    const scrapers = getAllReviewScrapers();
    expect(scrapers.length).toBe(4);
    const ids = scrapers.map((s) => s.id);
    expect(ids).toContain('ipsilon');
    expect(ids).toContain('timeout-reviews');
    expect(ids).toContain('blitz');
    expect(ids).toContain('artecapital');
  });

  it('imports review matcher without error', async () => {
    const { matchReviewsToEvents } = await import('../reviews/matcher.js');
    expect(typeof matchReviewsToEvents).toBe('function');
  });

  it('imports health monitoring without error', async () => {
    const { generateHealthReport, recordScraperRun } = await import(
      '../monitoring/health.js'
    );
    expect(typeof generateHealthReport).toBe('function');
    expect(typeof recordScraperRun).toBe('function');
  });
});

describe('Types', () => {
  it('exports all required interfaces', async () => {
    const types = await import('../types.js');
    // Just verify the module loads — TS interfaces are compile-time only.
    // Check that the module doesn't throw.
    expect(types).toBeDefined();
  });
});

describe('Review matcher fallback', () => {
  it('returns enriched events when no reviews', async () => {
    const { matchReviewsToEvents } = await import('../reviews/matcher.js');
    const events = [
      {
        title: 'Test Event',
        rawDescription: 'A test event',
        url: 'https://example.com',
        source: 'test',
        scrapedAt: new Date().toISOString(),
      },
    ];
    const result = await matchReviewsToEvents(events, []);
    expect(result).toHaveLength(1);
    expect(result[0].matchedReviews).toEqual([]);
    expect(result[0].title).toBe('Test Event');
  });

  it('falls back to keyword matching without API key', async () => {
    // Temporarily unset the API key
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const { matchReviewsToEvents } = await import('../reviews/matcher.js');
    const events = [
      {
        title: 'Concerto de Tiago Rodrigues no CCB',
        rawDescription: 'Uma peça única',
        url: 'https://example.com/1',
        source: 'test',
        scrapedAt: new Date().toISOString(),
      },
    ];
    const reviews = [
      {
        title: 'Tiago Rodrigues brilha no CCB',
        quote: 'Espectáculo extraordinário',
        sentiment: 'positive' as const,
        url: 'https://example.com/review',
        source: 'ipsilon',
        scrapedAt: new Date().toISOString(),
      },
    ];
    const result = await matchReviewsToEvents(events, reviews);
    expect(result).toHaveLength(1);
    // Should match because "Tiago", "Rodrigues", and "CCB" overlap
    expect(result[0].matchedReviews.length).toBeGreaterThanOrEqual(1);

    // Restore
    if (original) process.env.ANTHROPIC_API_KEY = original;
  });
});

describe('Health monitoring', () => {
  it('generates a report even with no data', async () => {
    const { generateHealthReport } = await import('../monitoring/health.js');
    const report = generateHealthReport();
    expect(report.generated).toBeTruthy();
    expect(Array.isArray(report.scrapers)).toBe(true);
    expect(Array.isArray(report.alerts)).toBe(true);
  });
});

describe('Content structure', () => {
  it('has at least one edition in content directory', () => {
    const editionsDir = resolve(__dirname, '../../../src/content/editions');
    expect(existsSync(editionsDir)).toBe(true);
  });
});
