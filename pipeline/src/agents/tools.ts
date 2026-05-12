import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { RawEvent, CriticReview, PipelineConfig } from '../types.js';
import { getScrapers } from '../scrapers/index.js';
import { getAllReviewScrapers } from '../reviews/index.js';
import { matchReviewsToEvents } from '../reviews/matcher.js';
import { recordScraperRun } from '../monitoring/health.js';

/**
 * Zod-typed tool definitions for the 3-agent pipeline.
 *
 * Each tool is defined with betaZodTool which:
 * - Generates JSON Schema from Zod automatically
 * - Provides type-safe `run` functions
 * - Integrates with the SDK's Tool Runner (auto agentic loop)
 *
 * Tools are factory functions that take PipelineConfig and return
 * betaZodTool instances.
 */

export function createScrapeTool(config: PipelineConfig) {
  return betaZodTool({
    name: 'scrape_source',
    description:
      'Scrape events from a specific source website. Available sources: cartaz-cultural, timeout-lisboa, visit-lisboa, eventbrite-lisboa, lisboa-live, fever-lisboa',
    inputSchema: z.object({
      source_id: z.enum([
        'cartaz-cultural',
        'timeout-lisboa',
        'visit-lisboa',
        'eventbrite-lisboa',
        'lisboa-live',
        'fever-lisboa',
      ]),
    }),
    run: async ({ source_id }) => {
      const scrapers = getScrapers([source_id]);
      if (scrapers.length === 0) {
        return JSON.stringify({ error: `Unknown source: ${source_id}` });
      }
      const events = await scrapers[0].scrape();
      return JSON.stringify({ source: source_id, count: events.length, events });
    },
  });
}

export function createScrapeAllTool(config: PipelineConfig) {
  return betaZodTool({
    name: 'scrape_all_sources',
    description: 'Scrape events from ALL configured source websites. Returns combined raw event data.',
    inputSchema: z.object({}),
    run: async () => {
      mkdirSync(config.cacheDir, { recursive: true });
      const allScrapers = getScrapers();
      const allEvents: RawEvent[] = [];
      const results: Array<{ source: string; count: number }> = [];

      for (const scraper of allScrapers) {
        const startTime = Date.now();
        try {
          const events = await scraper.scrape();
          allEvents.push(...events);
          results.push({ source: scraper.id, count: events.length });
          recordScraperRun({
            sourceId: scraper.id,
            timestamp: new Date().toISOString(),
            success: true,
            eventCount: events.length,
            durationMs: Date.now() - startTime,
          });
        } catch (error) {
          results.push({ source: scraper.id, count: 0 });
          recordScraperRun({
            sourceId: scraper.id,
            timestamp: new Date().toISOString(),
            success: false,
            eventCount: 0,
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      writeFileSync(
        join(config.cacheDir, 'raw-events.json'),
        JSON.stringify(allEvents, null, 2)
      );

      return JSON.stringify({
        totalEvents: allEvents.length,
        sources: results,
        savedTo: 'raw-events.json',
      });
    },
  });
}

export function createScrapeReviewsTool(config: PipelineConfig) {
  return betaZodTool({
    name: 'scrape_reviews',
    description:
      'Scrape critic reviews from Portuguese cultural publications (Ípsilon/Público, Time Out, Blitz, ArteCapital).',
    inputSchema: z.object({}),
    run: async () => {
      mkdirSync(config.cacheDir, { recursive: true });
      const reviewScrapers = getAllReviewScrapers();
      const allReviews: CriticReview[] = [];
      const results: Array<{ source: string; count: number }> = [];

      for (const scraper of reviewScrapers) {
        try {
          const reviews = await scraper.scrapeReviews();
          allReviews.push(...reviews);
          results.push({ source: scraper.id, count: reviews.length });
        } catch {
          results.push({ source: scraper.id, count: 0 });
        }
      }

      writeFileSync(
        join(config.cacheDir, 'reviews.json'),
        JSON.stringify(allReviews, null, 2)
      );

      return JSON.stringify({
        totalReviews: allReviews.length,
        sources: results,
        bySentiment: {
          positive: allReviews.filter((r) => r.sentiment === 'positive').length,
          mixed: allReviews.filter((r) => r.sentiment === 'mixed').length,
          negative: allReviews.filter((r) => r.sentiment === 'negative').length,
          neutral: allReviews.filter((r) => r.sentiment === 'neutral').length,
        },
        savedTo: 'reviews.json',
      });
    },
  });
}

export function createMatchReviewsTool(config: PipelineConfig) {
  return betaZodTool({
    name: 'match_reviews_to_events',
    description:
      'Match scraped critic reviews to scraped events using AI. Must run after both scrape_all_sources and scrape_reviews.',
    inputSchema: z.object({}),
    run: async () => {
      const rawPath = join(config.cacheDir, 'raw-events.json');
      const reviewsPath = join(config.cacheDir, 'reviews.json');

      if (!existsSync(rawPath)) {
        return JSON.stringify({ error: 'raw-events.json not found. Run scrape_all_sources first.' });
      }
      if (!existsSync(reviewsPath)) {
        return JSON.stringify({ error: 'reviews.json not found. Run scrape_reviews first.' });
      }

      const events: RawEvent[] = JSON.parse(readFileSync(rawPath, 'utf-8'));
      const reviews: CriticReview[] = JSON.parse(readFileSync(reviewsPath, 'utf-8'));
      const enriched = await matchReviewsToEvents(events, reviews);

      writeFileSync(
        join(config.cacheDir, 'enriched-events.json'),
        JSON.stringify(enriched, null, 2)
      );

      const withReviews = enriched.filter((e) => e.matchedReviews.length > 0);
      return JSON.stringify({
        totalEvents: enriched.length,
        eventsWithReviews: withReviews.length,
        totalReviewMatches: enriched.reduce((a, e) => a + e.matchedReviews.length, 0),
        savedTo: 'enriched-events.json',
      });
    },
  });
}

export function createReadFileTool(config: PipelineConfig) {
  return betaZodTool({
    name: 'read_file',
    description: 'Read a file from the pipeline cache directory',
    inputSchema: z.object({
      filename: z.string().describe('Filename to read (e.g., "raw-events.json", "curated-events.json")'),
    }),
    run: async ({ filename }) => {
      const filePath = join(config.cacheDir, filename);
      if (!existsSync(filePath)) {
        return JSON.stringify({ error: `File not found: ${filename}` });
      }
      const content = readFileSync(filePath, 'utf-8');
      if (content.length > 50000) {
        return content.slice(0, 50000) + '\n...[truncated]';
      }
      return content;
    },
  });
}

export function createWriteFileTool(config: PipelineConfig) {
  return betaZodTool({
    name: 'write_file',
    description: 'Write data to a file in the pipeline cache directory',
    inputSchema: z.object({
      filename: z.string().describe('Filename to write'),
      content: z.string().describe('Content to write (JSON string)'),
    }),
    run: async ({ filename, content }) => {
      mkdirSync(config.cacheDir, { recursive: true });
      writeFileSync(join(config.cacheDir, filename), content, 'utf-8');
      return JSON.stringify({ ok: true, filename });
    },
  });
}

export function createPublishEditionTool(config: PipelineConfig) {
  return betaZodTool({
    name: 'publish_edition',
    description: 'Publish the curated edition to the Astro content collection.',
    inputSchema: z.object({
      edition_json: z
        .string()
        .describe('Complete edition JSON (slug, weekNumber, year, dateRange, introText, publishedAt, events)'),
    }),
    run: async ({ edition_json }) => {
      const edition = JSON.parse(edition_json);
      const editionsDir = join(config.contentDir, 'editions');
      mkdirSync(editionsDir, { recursive: true });

      const filePath = join(editionsDir, `${edition.slug}.json`);
      writeFileSync(filePath, JSON.stringify(edition, null, 2), 'utf-8');

      return JSON.stringify({
        ok: true,
        path: filePath,
        events: edition.events?.length || 0,
      });
    },
  });
}

export function createNotifyHumanTool() {
  return betaZodTool({
    name: 'notify_human',
    description: 'Send a notification to the human curator requesting review.',
    inputSchema: z.object({
      message: z.string().describe('Message to display to the human curator'),
      summary: z.string().describe('Brief summary of what needs review'),
    }),
    run: async ({ message, summary }) => {
      console.log('\n╔══════════════════════════════════════╗');
      console.log('║  NOTIFICAÇÃO DO AGENTE               ║');
      console.log('╠══════════════════════════════════════╣');
      console.log(`║  ${message}`);
      console.log(`║  Resumo: ${summary}`);
      console.log('╚══════════════════════════════════════╝\n');
      return JSON.stringify({ ok: true, delivered: true });
    },
  });
}
