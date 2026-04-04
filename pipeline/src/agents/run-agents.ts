import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { runScoutAgent } from './scout.js';
import { runCuratorAgent } from './curator.js';
import { runPublisherAgent } from './publisher.js';
import type { PipelineConfig } from '../types.js';

// Load .env
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

function getWeekConfig(): PipelineConfig {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekNum = getISOWeekNumber(monday);
  const year = monday.getFullYear();

  const pipelineDir = resolve('.');
  const projectRoot = resolve('..');

  return {
    cacheDir: join(pipelineDir, '.cache'),
    contentDir: join(projectRoot, 'src', 'content'),
    weekId: `${year}-W${String(weekNum).padStart(2, '0')}`,
    weekStart: monday.toISOString().split('T')[0],
    weekEnd: sunday.toISOString().split('T')[0],
  };
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

async function main() {
  const config = getWeekConfig();
  const step = process.argv[2]; // scout | curator | publisher | (empty = all)

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🎭 LX Cult(ure) — Pipeline Agentic          ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Semana: ${config.weekId} (${config.weekStart} → ${config.weekEnd})`);
  console.log('║  3 Agentes: Scout → Curator → Publisher      ║');
  console.log('╚══════════════════════════════════════════════╝');

  const start = Date.now();

  if (!step || step === 'scout') {
    console.log('\n━━━ AGENTE 1: SCOUT ━━━━━━━━━━━━━━━━━━━━━━━━━');
    const scoutResult = await runScoutAgent(config);
    console.log(`\nScout diz: ${scoutResult.slice(0, 200)}`);
    if (step === 'scout') return;
  }

  if (!step || step === 'curator') {
    console.log('\n━━━ AGENTE 2: CURATOR ━━━━━━━━━━━━━━━━━━━━━━━');
    const curatorResult = await runCuratorAgent(config);
    console.log(`\nCurator diz: ${curatorResult.slice(0, 200)}`);
    if (step === 'curator') return;
  }

  if (!step || step === 'publisher') {
    console.log('\n━━━ AGENTE 3: PUBLISHER ━━━━━━━━━━━━━━━━━━━━━');
    const publisherResult = await runPublisherAgent(config);
    console.log(`\nPublisher diz: ${publisherResult.slice(0, 200)}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Pipeline concluído em ${elapsed}s`);
}

main().catch((error) => {
  console.error('Pipeline error:', error);
  process.exit(1);
});
