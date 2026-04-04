import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CuratedEvent, Edition, PipelineConfig } from './types.js';

interface PublishInput {
  introText: string;
  events: CuratedEvent[];
}

/**
 * Writes the approved edition to the Astro content collection.
 * Creates a JSON file in src/content/editions/{weekId}.json
 */
export function publishEdition(
  input: PublishInput,
  config: PipelineConfig
): string {
  const edition: Edition = {
    slug: config.weekId,
    weekNumber: getWeekNumber(config.weekStart),
    year: new Date(config.weekStart).getFullYear(),
    dateRange: {
      start: config.weekStart,
      end: config.weekEnd,
    },
    introText: input.introText,
    publishedAt: new Date().toISOString(),
    events: input.events.map((e, i) => ({
      ...e,
      id: e.id || `evt-${String(i + 1).padStart(3, '0')}`,
    })),
  };

  // Ensure the editions directory exists
  const editionsDir = join(config.contentDir, 'editions');
  if (!existsSync(editionsDir)) {
    mkdirSync(editionsDir, { recursive: true });
  }

  const filePath = join(editionsDir, `${config.weekId}.json`);
  writeFileSync(filePath, JSON.stringify(edition, null, 2), 'utf-8');

  console.log(`\n✓ Edição publicada: ${filePath}`);
  console.log(`  ${edition.events.length} eventos`);
  console.log(
    `  ${edition.events.filter((e) => e.featured).length} destaques`
  );

  return filePath;
}

/**
 * Get ISO week number from a date string
 */
function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}
