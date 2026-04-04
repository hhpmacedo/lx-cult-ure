import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { RawEvent, PipelineConfig } from '../types.js';
import { getScrapers } from '../scrapers/index.js';

/**
 * Tool definitions and implementations for the 3-agent pipeline.
 * Each agent gets a subset of these tools.
 */

// --- Tool Definitions ---

export const SCRAPE_TOOL: Anthropic.Tool = {
  name: 'scrape_source',
  description:
    'Scrape events from a specific source website. Returns raw event data as JSON. Available sources: cartaz-cultural, timeout-lisboa, visit-lisboa, eventbrite-lisboa, lisboa-live, fever-lisboa',
  input_schema: {
    type: 'object' as const,
    properties: {
      source_id: {
        type: 'string',
        description: 'ID of the source to scrape',
        enum: [
          'cartaz-cultural',
          'timeout-lisboa',
          'visit-lisboa',
          'eventbrite-lisboa',
          'lisboa-live',
          'fever-lisboa',
        ],
      },
    },
    required: ['source_id'],
  },
};

export const SCRAPE_ALL_TOOL: Anthropic.Tool = {
  name: 'scrape_all_sources',
  description:
    'Scrape events from ALL configured source websites. Returns combined raw event data.',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
};

export const READ_FILE_TOOL: Anthropic.Tool = {
  name: 'read_file',
  description: 'Read a file from the pipeline cache directory',
  input_schema: {
    type: 'object' as const,
    properties: {
      filename: {
        type: 'string',
        description: 'Filename to read (e.g., "raw-events.json", "curated-events.json")',
      },
    },
    required: ['filename'],
  },
};

export const WRITE_FILE_TOOL: Anthropic.Tool = {
  name: 'write_file',
  description: 'Write data to a file in the pipeline cache directory',
  input_schema: {
    type: 'object' as const,
    properties: {
      filename: {
        type: 'string',
        description: 'Filename to write',
      },
      content: {
        type: 'string',
        description: 'Content to write (JSON string)',
      },
    },
    required: ['filename', 'content'],
  },
};

export const PUBLISH_EDITION_TOOL: Anthropic.Tool = {
  name: 'publish_edition',
  description:
    'Publish the curated edition to the Astro content collection. Writes the JSON file to src/content/editions/',
  input_schema: {
    type: 'object' as const,
    properties: {
      edition_json: {
        type: 'string',
        description: 'Complete edition JSON (with slug, weekNumber, year, dateRange, introText, publishedAt, events)',
      },
    },
    required: ['edition_json'],
  },
};

export const NOTIFY_HUMAN_TOOL: Anthropic.Tool = {
  name: 'notify_human',
  description:
    'Send a notification to the human curator requesting review. Displays a message in the console.',
  input_schema: {
    type: 'object' as const,
    properties: {
      message: {
        type: 'string',
        description: 'Message to display to the human curator',
      },
      summary: {
        type: 'string',
        description: 'Brief summary of what needs review (event counts, highlights)',
      },
    },
    required: ['message', 'summary'],
  },
};

// --- Tool Implementations ---

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  config: PipelineConfig
): Promise<string> {
  mkdirSync(config.cacheDir, { recursive: true });

  switch (toolName) {
    case 'scrape_source': {
      const sourceId = toolInput.source_id as string;
      const scrapers = getScrapers([sourceId]);
      if (scrapers.length === 0) {
        return JSON.stringify({ error: `Unknown source: ${sourceId}` });
      }
      const events = await scrapers[0].scrape();
      return JSON.stringify({ source: sourceId, count: events.length, events });
    }

    case 'scrape_all_sources': {
      const allScrapers = getScrapers();
      const allEvents: RawEvent[] = [];
      const results: Array<{ source: string; count: number }> = [];

      for (const scraper of allScrapers) {
        try {
          const events = await scraper.scrape();
          allEvents.push(...events);
          results.push({ source: scraper.id, count: events.length });
        } catch (error) {
          results.push({ source: scraper.id, count: 0 });
        }
      }

      // Save to cache
      writeFileSync(
        join(config.cacheDir, 'raw-events.json'),
        JSON.stringify(allEvents, null, 2)
      );

      return JSON.stringify({
        totalEvents: allEvents.length,
        sources: results,
        savedTo: 'raw-events.json',
      });
    }

    case 'read_file': {
      const filename = toolInput.filename as string;
      const filePath = join(config.cacheDir, filename);
      if (!existsSync(filePath)) {
        return JSON.stringify({ error: `File not found: ${filename}` });
      }
      const content = readFileSync(filePath, 'utf-8');
      // Truncate if too large for context
      if (content.length > 50000) {
        return content.slice(0, 50000) + '\n...[truncated]';
      }
      return content;
    }

    case 'write_file': {
      const filename = toolInput.filename as string;
      const content = toolInput.content as string;
      writeFileSync(join(config.cacheDir, filename), content, 'utf-8');
      return JSON.stringify({ ok: true, filename });
    }

    case 'publish_edition': {
      const editionJson = toolInput.edition_json as string;
      const edition = JSON.parse(editionJson);

      const editionsDir = join(config.contentDir, 'editions');
      mkdirSync(editionsDir, { recursive: true });

      const filePath = join(editionsDir, `${edition.slug}.json`);
      writeFileSync(filePath, JSON.stringify(edition, null, 2), 'utf-8');

      return JSON.stringify({
        ok: true,
        path: filePath,
        events: edition.events?.length || 0,
      });
    }

    case 'notify_human': {
      const message = toolInput.message as string;
      const summary = toolInput.summary as string;
      console.log('\n╔══════════════════════════════════════╗');
      console.log('║  📬 NOTIFICAÇÃO DO AGENTE            ║');
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
