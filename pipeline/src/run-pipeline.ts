import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { getScrapers } from './scrapers/index.js';
import { curateEvents } from './ai/curator.js';
import { startReviewServer } from './review/server.js';
import { publishEdition } from './publish.js';
import type { RawEvent, PipelineConfig } from './types.js';

// Load .env from pipeline directory
const envPath = join(resolve('.'), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] = rest.join('=').trim();
  }
}

/**
 * Get the current week's config.
 * Week starts on Monday, ends on Sunday.
 */
function getWeekConfig(): PipelineConfig {
  const now = new Date();
  const day = now.getDay();
  // Get Monday of current week
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  // Get Sunday
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekNum = getISOWeekNumber(monday);
  const year = monday.getFullYear();

  const pipelineDir = resolve('.');
  const projectRoot = resolve('..'); // Assumes pipeline/ is inside lx-cult-ure/

  return {
    cacheDir: join(pipelineDir, '.cache'),
    contentDir: join(projectRoot, 'src', 'content'),
    weekId: `${year}-W${String(weekNum).padStart(2, '0')}`,
    weekStart: monday.toISOString().split('T')[0],
    weekEnd: sunday.toISOString().split('T')[0],
  };
}

function getISOWeekNumber(date: Date): number {
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

// --- Pipeline Steps ---

async function stepScrape(config: PipelineConfig): Promise<RawEvent[]> {
  console.log('\n═══════════════════════════════════════');
  console.log('  PASSO 1: SCRAPING');
  console.log(`  Semana: ${config.weekId}`);
  console.log('═══════════════════════════════════════\n');

  const scrapers = getScrapers();
  const allEvents: RawEvent[] = [];

  // Run scrapers sequentially (each opens its own browser)
  for (const scraper of scrapers) {
    try {
      const events = await scraper.scrape();
      allEvents.push(...events);
    } catch (error) {
      console.error(`[${scraper.id}] Error:`, error);
    }
  }

  console.log(`\n✓ Total: ${allEvents.length} eventos de ${scrapers.length} fontes`);

  // Save to cache
  mkdirSync(config.cacheDir, { recursive: true });
  const cachePath = join(config.cacheDir, 'raw-events.json');
  writeFileSync(cachePath, JSON.stringify(allEvents, null, 2));
  console.log(`  Guardado em: ${cachePath}`);

  return allEvents;
}

async function stepCurate(config: PipelineConfig) {
  console.log('\n═══════════════════════════════════════');
  console.log('  PASSO 2: CURADORIA AI');
  console.log('═══════════════════════════════════════\n');

  // Load raw events
  const rawPath = join(config.cacheDir, 'raw-events.json');
  if (!existsSync(rawPath)) {
    console.error('Ficheiro de eventos em bruto não encontrado. Execute o passo de scraping primeiro.');
    console.error(`  Esperado: ${rawPath}`);
    process.exit(1);
  }

  const rawEvents: RawEvent[] = JSON.parse(
    readFileSync(rawPath, 'utf-8')
  );
  console.log(`Eventos em bruto: ${rawEvents.length}`);

  const result = await curateEvents(
    rawEvents,
    config.weekStart,
    config.weekEnd
  );

  // Save curated events
  const curatedPath = join(config.cacheDir, 'curated-events.json');
  writeFileSync(curatedPath, JSON.stringify(result, null, 2));
  console.log(`\n✓ ${result.events.length} eventos curados`);
  console.log(`  Guardado em: ${curatedPath}`);
}

async function stepReview(config: PipelineConfig) {
  console.log('\n═══════════════════════════════════════');
  console.log('  PASSO 3: REVISÃO HUMANA');
  console.log('═══════════════════════════════════════\n');

  await startReviewServer(config.cacheDir, async (data) => {
    publishEdition(data, config);
  });
}

async function stepPublish(config: PipelineConfig) {
  console.log('\n═══════════════════════════════════════');
  console.log('  PASSO 4: PUBLICAÇÃO');
  console.log('═══════════════════════════════════════\n');

  const approvedPath = join(config.cacheDir, 'approved-events.json');
  const curatedPath = join(config.cacheDir, 'curated-events.json');

  const sourcePath = existsSync(approvedPath)
    ? approvedPath
    : curatedPath;

  if (!existsSync(sourcePath)) {
    console.error('Nenhum ficheiro de eventos encontrado para publicar.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(sourcePath, 'utf-8'));
  publishEdition(data, config);
}

// --- Main ---

async function main() {
  const step = process.argv[2]; // scrape | curate | review | publish
  const config = getWeekConfig();

  console.log(`\n🎭 LX Cult(ure) — Pipeline de Curadoria`);
  console.log(`   Semana: ${config.weekId} (${config.weekStart} → ${config.weekEnd})`);

  switch (step) {
    case 'scrape':
      await stepScrape(config);
      break;

    case 'curate':
      await stepCurate(config);
      break;

    case 'review':
      await stepReview(config);
      break;

    case 'publish':
      await stepPublish(config);
      break;

    default:
      // Full pipeline
      console.log('\nA executar pipeline completo...\n');
      await stepScrape(config);
      await stepCurate(config);
      await stepReview(config);
      break;
  }
}

main().catch((error) => {
  console.error('Pipeline error:', error);
  process.exit(1);
});
