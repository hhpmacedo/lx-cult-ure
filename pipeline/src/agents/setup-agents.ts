import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * One-time setup script for Managed Agents.
 *
 * Creates 3 Agent objects + 1 Environment on Anthropic's infrastructure.
 * Stores their IDs in .cache/managed-agent-ids.json for reuse across runs.
 *
 * Usage:
 *   npm run agents:setup          # Create agents (idempotent)
 *   npm run agents:setup -- --force  # Archive old agents and recreate
 */

import {
  SCRAPE_ALL_DEF, SCRAPE_SOURCE_DEF, SCRAPE_REVIEWS_DEF,
  MATCH_REVIEWS_DEF, READ_FILE_DEF, WRITE_FILE_DEF,
  PUBLISH_EDITION_DEF, NOTIFY_HUMAN_DEF,
} from './tools.js';
import { SONNET_MODEL } from '../ai/models.js';

const IDS_FILE = join(resolve('.'), '.cache', 'managed-agent-ids.json');

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

const AGENTS = [
  {
    key: 'Scout',
    name: 'LX Cult(ure) Scout',
    model: SONNET_MODEL,
    system: `Tu és o Scout Agent da LX Cult(ure). Recolhe eventos culturais e críticas de publicações portuguesas. Usa as ferramentas na ordem: scrape_all_sources → scrape_reviews → match_reviews_to_events.`,
    tools: [SCRAPE_ALL_DEF, SCRAPE_SOURCE_DEF, SCRAPE_REVIEWS_DEF, MATCH_REVIEWS_DEF, WRITE_FILE_DEF, READ_FILE_DEF],
  },
  {
    key: 'Curator',
    name: 'LX Cult(ure) Curator',
    model: SONNET_MODEL,
    system: `Tu és o Curator Agent da LX Cult(ure) — um crítico cultural experiente. Transforma eventos em bruto numa edição semanal curada com 15-25 eventos, blurbs em português, e 4 destaques.`,
    tools: [READ_FILE_DEF, WRITE_FILE_DEF],
  },
  {
    key: 'Publisher',
    name: 'LX Cult(ure) Publisher',
    model: SONNET_MODEL,
    system: `Tu és o Publisher Agent da LX Cult(ure). Prepara a edição para publicação, verifica qualidade, notifica o curador, e publica.`,
    tools: [READ_FILE_DEF, WRITE_FILE_DEF, PUBLISH_EDITION_DEF, NOTIFY_HUMAN_DEF],
  },
];

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const force = process.argv.includes('--force');

  // Load existing IDs
  let ids: Record<string, any> = {};
  if (existsSync(IDS_FILE) && !force) {
    ids = JSON.parse(readFileSync(IDS_FILE, 'utf-8'));
    console.log('Existing agent IDs found. Use --force to recreate.');
  }

  // Create environment
  if (!ids.environmentId || force) {
    console.log('Creating environment...');
    const env = await client.beta.environments.create({
      name: `lx-culture-pipeline-${Date.now()}`,
      config: {
        type: 'cloud',
        networking: { type: 'unrestricted' },
      },
    });
    ids.environmentId = env.id;
    console.log(`  Environment: ${env.id}`);
  } else {
    console.log(`  Environment: ${ids.environmentId} (existing)`);
  }

  // Create agents
  if (!ids.agents) ids.agents = {};

  for (const agentDef of AGENTS) {
    if (ids.agents[agentDef.key] && !force) {
      console.log(`  ${agentDef.key}: ${ids.agents[agentDef.key].id} (existing)`);
      continue;
    }

    console.log(`Creating agent "${agentDef.key}"...`);
    const agent = await client.beta.agents.create({
      name: agentDef.name,
      model: agentDef.model,
      system: agentDef.system,
      tools: agentDef.tools,
    });

    ids.agents[agentDef.key] = { id: agent.id, version: agent.version };
    console.log(`  ${agentDef.key}: ${agent.id} (v${agent.version})`);
  }

  // Save IDs
  mkdirSync(join(resolve('.'), '.cache'), { recursive: true });
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
  console.log(`\nAgent IDs saved to ${IDS_FILE}`);
  console.log('Run "npm run agents" to start the pipeline.');
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
