import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline';
import {
  recordEditionFeedback,
  updateSourceScores,
} from '../memory/store.js';
import { runMetaAgent } from '../agents/meta/meta-agent.js';
import type { EditionFeedback } from '../memory/types.js';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * Interactive CLI for collecting edition feedback.
 * Run after reviewing/publishing an edition.
 */
async function collectFeedback() {
  const cacheDir = join(resolve('.'), '.cache');

  // Find the latest edition data
  const approvedPath = join(cacheDir, 'approved-events.json');
  const curatedPath = join(cacheDir, 'curated-events.json');
  const dataPath = existsSync(approvedPath) ? approvedPath : curatedPath;

  if (!existsSync(dataPath)) {
    console.error('Nenhuma edição encontrada. Execute o pipeline primeiro.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const events = data.events || [];

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  📝 LX Cult(ure) — Feedback          ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Eventos na edição: ${events.length}`);
  console.log('╚══════════════════════════════════════╝\n');

  // Get overall rating
  const ratingStr = await ask('Rating da edição (1-5): ');
  const rating = Math.max(1, Math.min(5, parseInt(ratingStr) || 3));

  // Get optional notes
  const notes = await ask('Notas (opcional, Enter para saltar): ');

  // Ask about removed events
  console.log('\nEventos que removeste durante a revisão:');
  console.log('(lista os números, separados por vírgula, ou Enter para nenhum)\n');

  events.forEach((e: { title: string; venue?: string; aiScore: number }, i: number) => {
    console.log(`  ${i + 1}. ${e.title} — ${e.venue || '?'} (score: ${e.aiScore})`);
  });

  const removedStr = await ask('\nEventos removidos (ex: 3,7,11): ');
  const removedIndices = removedStr
    .split(',')
    .map((s) => parseInt(s.trim()) - 1)
    .filter((i) => i >= 0 && i < events.length);

  // Get removal reasons
  const removalReasons: Record<string, string> = {};
  for (const idx of removedIndices) {
    const event = events[idx];
    const reason = await ask(
      `  Razão para remover "${event.title}"? (Enter para saltar): `
    );
    if (reason.trim()) {
      removalReasons[event.id || `evt-${idx}`] = reason.trim();
    }
  }

  const keptEvents = events.filter(
    (_: unknown, i: number) => !removedIndices.includes(i)
  );
  const removedEvents = events.filter((_: unknown, i: number) =>
    removedIndices.includes(i)
  );

  // Calculate category coverage
  const categoryCoverage: Record<string, number> = {};
  for (const e of keptEvents) {
    categoryCoverage[e.category] = (categoryCoverage[e.category] || 0) + 1;
  }

  // Determine weekId
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const weekNum = getISOWeekNumber(monday);
  const weekId = `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  // Record feedback
  const feedback: EditionFeedback = {
    weekId,
    rating,
    notes: notes.trim() || undefined,
    eventsKept: keptEvents.map((e: { id?: string }, i: number) => e.id || `evt-${i}`),
    eventsRemoved: removedEvents.map((e: { id?: string }, i: number) => e.id || `evt-${i}`),
    removalReasons,
    categoryCoverage,
    timestamp: new Date().toISOString(),
  };

  recordEditionFeedback(feedback);

  // Update source scores
  const sourceStats = calculateSourceStats(events, keptEvents, removedEvents);
  updateSourceScores(weekId, sourceStats);

  console.log('\n✓ Feedback registado!');
  console.log(`  Rating: ${rating}/5`);
  console.log(`  Mantidos: ${keptEvents.length}, Removidos: ${removedEvents.length}`);

  // Run Meta Agent for self-improvement
  const runMeta = await ask('\nExecutar Meta Agent para melhorias automáticas? (s/N): ');
  if (runMeta.toLowerCase() === 's') {
    // Load .env for API key
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

    const result = await runMetaAgent();
    console.log(`\n📊 Resultado: ${result.summary}`);
    if (result.promptChanged) {
      console.log(`  ✏️  Prompt atualizado para v${result.newPromptVersion}`);
    }
    if (result.sourceChanges.length > 0) {
      console.log(`  📡 Fontes: ${result.sourceChanges.join(', ')}`);
    }
    if (result.patternChanges.length > 0) {
      console.log(`  🔍 Padrões: ${result.patternChanges.join(', ')}`);
    }
  }

  rl.close();
}

function calculateSourceStats(
  allEvents: Array<{ source?: string; aiScore?: number; id?: string }>,
  keptEvents: Array<{ source?: string; id?: string }>,
  removedEvents: Array<{ source?: string; id?: string }>
) {
  const sources = new Map<
    string,
    { scraped: number; survivedCuration: number; survivedReview: number; totalScore: number }
  >();

  for (const e of allEvents) {
    const src = e.source || 'unknown';
    if (!sources.has(src)) {
      sources.set(src, {
        scraped: 0,
        survivedCuration: 0,
        survivedReview: 0,
        totalScore: 0,
      });
    }
    const s = sources.get(src)!;
    s.scraped++;
    s.survivedCuration++; // all events in curated list survived curation
    s.totalScore += e.aiScore || 50;
  }

  for (const e of keptEvents) {
    const src = e.source || 'unknown';
    if (sources.has(src)) {
      sources.get(src)!.survivedReview++;
    }
  }

  return Array.from(sources.entries()).map(([sourceId, stats]) => ({
    sourceId,
    name: sourceId,
    scraped: stats.scraped,
    survivedCuration: stats.survivedCuration,
    survivedReview: stats.survivedReview,
    avgScore: stats.scraped > 0 ? stats.totalScore / stats.scraped : 50,
  }));
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

collectFeedback().catch(console.error);
