import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { PipelineConfig } from '../types.js';

/**
 * Tool definitions as raw JSON schemas for Managed Agents custom tools.
 *
 * These are passed to agents.create() as { type: "custom", name, description, input_schema }.
 * The actual execution happens locally in the orchestrator when the session
 * emits agent.custom_tool_use events.
 */

export interface CustomToolDef {
  type: 'custom';
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// --- Tool Schemas (sent to Anthropic as agent config) ---

export const SCRAPE_SOURCE_DEF: CustomToolDef = {
  type: 'custom',
  name: 'scrape_source',
  description:
    'Scrape events from a specific source website. Available sources: cartaz-cultural, timeout-lisboa, visit-lisboa, eventbrite-lisboa, lisboa-live, fever-lisboa',
  input_schema: {
    type: 'object',
    properties: {
      source_id: {
        type: 'string',
        enum: [
          'cartaz-cultural', 'timeout-lisboa', 'visit-lisboa',
          'eventbrite-lisboa', 'lisboa-live', 'fever-lisboa',
        ],
        description: 'ID of the source to scrape',
      },
    },
    required: ['source_id'],
  },
};

export const SCRAPE_ALL_DEF: CustomToolDef = {
  type: 'custom',
  name: 'scrape_all_sources',
  description: 'Scrape events from ALL configured source websites. Returns combined raw event data.',
  input_schema: { type: 'object', properties: {} },
};

export const SCRAPE_REVIEWS_DEF: CustomToolDef = {
  type: 'custom',
  name: 'scrape_reviews',
  description:
    'Scrape critic reviews from Portuguese cultural publications (Ípsilon/Público, Time Out, Blitz, ArteCapital).',
  input_schema: { type: 'object', properties: {} },
};

export const MATCH_REVIEWS_DEF: CustomToolDef = {
  type: 'custom',
  name: 'match_reviews_to_events',
  description:
    'Match scraped critic reviews to scraped events using AI. Must run after both scrape_all_sources and scrape_reviews.',
  input_schema: { type: 'object', properties: {} },
};

export const READ_FILE_DEF: CustomToolDef = {
  type: 'custom',
  name: 'read_file',
  description: 'Read a file from the pipeline cache directory',
  input_schema: {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'Filename to read (e.g., "raw-events.json", "curated-events.json")',
      },
    },
    required: ['filename'],
  },
};

export const WRITE_FILE_DEF: CustomToolDef = {
  type: 'custom',
  name: 'write_file',
  description: 'Write data to a file in the pipeline cache directory',
  input_schema: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Filename to write' },
      content: { type: 'string', description: 'Content to write (JSON string)' },
    },
    required: ['filename', 'content'],
  },
};

export const PUBLISH_EDITION_DEF: CustomToolDef = {
  type: 'custom',
  name: 'publish_edition',
  description: 'Publish the curated edition to the Astro content collection.',
  input_schema: {
    type: 'object',
    properties: {
      edition_json: {
        type: 'string',
        description: 'Complete edition JSON (slug, weekNumber, year, dateRange, introText, publishedAt, events)',
      },
    },
    required: ['edition_json'],
  },
};

export const NOTIFY_HUMAN_DEF: CustomToolDef = {
  type: 'custom',
  name: 'notify_human',
  description: 'Send a notification to the human curator requesting review.',
  input_schema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Message to display to the human curator' },
      summary: { type: 'string', description: 'Brief summary of what needs review' },
    },
    required: ['message', 'summary'],
  },
};

// --- Local Tool Executor (runs on your machine, not in Anthropic's cloud) ---

import type { RawEvent, CriticReview } from '../types.js';
import { getScrapers } from '../scrapers/index.js';
import { getAllReviewScrapers } from '../reviews/index.js';
import { matchReviewsToEvents } from '../reviews/matcher.js';
import { recordScraperRun } from '../monitoring/health.js';

export async function executeToolLocally(
  toolName: string,
  toolInput: Record<string, unknown>,
  config: PipelineConfig
): Promise<string> {
  mkdirSync(config.cacheDir, { recursive: true });

  switch (toolName) {
    case 'scrape_source': {
      const sourceId = toolInput.source_id as string;
      const scrapers = getScrapers([sourceId]);
      if (scrapers.length === 0) return JSON.stringify({ error: `Unknown source: ${sourceId}` });
      const events = await scrapers[0].scrape();
      return JSON.stringify({ source: sourceId, count: events.length, events });
    }

    case 'scrape_all_sources': {
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
            sourceId: scraper.id, timestamp: new Date().toISOString(),
            success: true, eventCount: events.length, durationMs: Date.now() - startTime,
          });
        } catch (error) {
          results.push({ source: scraper.id, count: 0 });
          recordScraperRun({
            sourceId: scraper.id, timestamp: new Date().toISOString(),
            success: false, eventCount: 0, durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      writeFileSync(join(config.cacheDir, 'raw-events.json'), JSON.stringify(allEvents, null, 2));
      return JSON.stringify({ totalEvents: allEvents.length, sources: results, savedTo: 'raw-events.json' });
    }

    case 'scrape_reviews': {
      const reviewScrapers = getAllReviewScrapers();
      const allReviews: CriticReview[] = [];
      const results: Array<{ source: string; count: number }> = [];
      for (const scraper of reviewScrapers) {
        try {
          const reviews = await scraper.scrapeReviews();
          allReviews.push(...reviews);
          results.push({ source: scraper.id, count: reviews.length });
        } catch { results.push({ source: scraper.id, count: 0 }); }
      }
      writeFileSync(join(config.cacheDir, 'reviews.json'), JSON.stringify(allReviews, null, 2));
      return JSON.stringify({
        totalReviews: allReviews.length, sources: results,
        bySentiment: {
          positive: allReviews.filter((r) => r.sentiment === 'positive').length,
          mixed: allReviews.filter((r) => r.sentiment === 'mixed').length,
          negative: allReviews.filter((r) => r.sentiment === 'negative').length,
          neutral: allReviews.filter((r) => r.sentiment === 'neutral').length,
        },
        savedTo: 'reviews.json',
      });
    }

    case 'match_reviews_to_events': {
      const rawPath = join(config.cacheDir, 'raw-events.json');
      const reviewsPath = join(config.cacheDir, 'reviews.json');
      if (!existsSync(rawPath)) return JSON.stringify({ error: 'raw-events.json not found.' });
      if (!existsSync(reviewsPath)) return JSON.stringify({ error: 'reviews.json not found.' });
      const events: RawEvent[] = JSON.parse(readFileSync(rawPath, 'utf-8'));
      const reviews: CriticReview[] = JSON.parse(readFileSync(reviewsPath, 'utf-8'));
      const enriched = await matchReviewsToEvents(events, reviews);
      writeFileSync(join(config.cacheDir, 'enriched-events.json'), JSON.stringify(enriched, null, 2));
      const withReviews = enriched.filter((e) => e.matchedReviews.length > 0);
      return JSON.stringify({
        totalEvents: enriched.length, eventsWithReviews: withReviews.length,
        totalReviewMatches: enriched.reduce((a, e) => a + e.matchedReviews.length, 0),
        savedTo: 'enriched-events.json',
      });
    }

    case 'read_file': {
      const filename = toolInput.filename as string;
      const filePath = join(config.cacheDir, filename);
      if (!existsSync(filePath)) return JSON.stringify({ error: `File not found: ${filename}` });
      const content = readFileSync(filePath, 'utf-8');
      return content.length > 50000 ? content.slice(0, 50000) + '\n...[truncated]' : content;
    }

    case 'write_file': {
      const filename = toolInput.filename as string;
      const content = toolInput.content as string;
      writeFileSync(join(config.cacheDir, filename), content, 'utf-8');
      return JSON.stringify({ ok: true, filename });
    }

    case 'publish_edition': {
      const edition = JSON.parse(toolInput.edition_json as string);
      const editionsDir = join(config.contentDir, 'editions');
      mkdirSync(editionsDir, { recursive: true });
      const filePath = join(editionsDir, `${edition.slug}.json`);
      writeFileSync(filePath, JSON.stringify(edition, null, 2), 'utf-8');
      return JSON.stringify({ ok: true, path: filePath, events: edition.events?.length || 0 });
    }

    case 'notify_human': {
      const message = toolInput.message as string;
      const summary = toolInput.summary as string;
      console.log('\n╔══════════════════════════════════════╗');
      console.log('║  NOTIFICAÇÃO DO AGENTE               ║');
      console.log('╠══════════════════════════════════════╣');
      console.log(`║  ${message}`);
      console.log(`║  Resumo: ${summary}`);
      console.log('╚══════════════════════════════════════╝\n');
      return JSON.stringify({ ok: true, delivered: true });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
