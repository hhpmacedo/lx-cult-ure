import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import type { PipelineConfig } from '../types.js';
import { executeToolLocally, type CustomToolDef } from './tools.js';

/**
 * Managed Agents session runner.
 *
 * Creates (or reuses) a persistent Agent on Anthropic's infrastructure,
 * starts a Session, sends the task, and handles custom tool calls locally.
 *
 * Flow:
 *   1. Ensure agent exists (create once, reuse by ID)
 *   2. Create a session
 *   3. Open SSE stream (before sending message)
 *   4. Send user.message
 *   5. When agent.custom_tool_use arrives → execute locally → send user.custom_tool_result
 *   6. Loop until session.status_idle with stop_reason.type !== "requires_action"
 */

const IDS_FILE = join(resolve('.'), '.cache', 'managed-agent-ids.json');

interface StoredIds {
  environmentId?: string;
  agents: Record<string, { id: string; version: number }>;
}

function loadIds(): StoredIds {
  if (existsSync(IDS_FILE)) {
    try { return JSON.parse(readFileSync(IDS_FILE, 'utf-8')); } catch { /* ignore */ }
  }
  return { agents: {} };
}

function saveIds(ids: StoredIds): void {
  mkdirSync(join(resolve('.'), '.cache'), { recursive: true });
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
}

async function ensureEnvironment(client: Anthropic): Promise<string> {
  const ids = loadIds();
  if (ids.environmentId) return ids.environmentId;

  console.log('  [setup] Creating environment...');
  const env = await client.beta.environments.create({
    name: 'lx-culture-pipeline',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
  });

  ids.environmentId = env.id;
  saveIds(ids);
  console.log(`  [setup] Environment created: ${env.id}`);
  return env.id;
}

async function ensureAgent(
  client: Anthropic,
  name: string,
  system: string,
  tools: CustomToolDef[]
): Promise<string> {
  const ids = loadIds();

  if (ids.agents[name]) {
    return ids.agents[name].id;
  }

  console.log(`  [setup] Creating agent "${name}"...`);
  const agent = await client.beta.agents.create({
    name,
    model: 'claude-sonnet-4-6',
    system,
    tools,
  });

  ids.agents[name] = { id: agent.id, version: agent.version };
  saveIds(ids);
  console.log(`  [setup] Agent created: ${agent.id} (v${agent.version})`);
  return agent.id;
}

interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools: CustomToolDef[];
}

export async function runAgent(
  agentConfig: AgentConfig,
  userPrompt: string,
  pipelineConfig: PipelineConfig
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  console.log(`\n  [${agentConfig.name}] A iniciar...`);

  // 1. Ensure agent + environment exist
  const [agentId, environmentId] = await Promise.all([
    ensureAgent(client, agentConfig.name, agentConfig.systemPrompt, agentConfig.tools),
    ensureEnvironment(client),
  ]);

  // 2. Create session
  const session = await client.beta.sessions.create({
    agent: agentId,
    environment_id: environmentId,
  });
  console.log(`  [${agentConfig.name}] Session: ${session.id}`);

  // 3. Open stream BEFORE sending message (stream-first pattern)
  const stream = await client.beta.sessions.events.stream(session.id);

  // 4. Send the task
  await client.beta.sessions.events.send(session.id, {
    events: [{
      type: 'user.message',
      content: [{ type: 'text', text: userPrompt }],
    }],
  });

  // 5. Process events — handle custom tool calls locally
  const eventsById = new Map<string, { type: string; name?: string; input?: Record<string, unknown> }>();
  let finalText = '';

  for await (const event of stream) {
    eventsById.set(event.id, event as any);

    switch (event.type) {
      case 'agent.message': {
        const content = (event as any).content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              finalText = block.text;
              const preview = block.text.trim().slice(0, 100);
              if (preview.length > 3) {
                console.log(`  [${agentConfig.name}] ${preview}`);
              }
            }
          }
        }
        break;
      }

      case 'agent.custom_tool_use': {
        const toolEvent = event as any;
        console.log(`    [${agentConfig.name}] ${toolEvent.name}(...)`);
        break;
      }

      case 'session.status_idle': {
        const stopReason = (event as any).stop_reason;

        if (stopReason?.type === 'requires_action') {
          // Execute pending custom tools locally and send results back
          const eventIds: string[] = stopReason.event_ids || [];

          for (const eventId of eventIds) {
            const toolEvent = eventsById.get(eventId);
            if (toolEvent?.type === 'agent.custom_tool_use' && toolEvent.name) {
              console.log(`    [${agentConfig.name}] Executing ${toolEvent.name} locally...`);

              const result = await executeToolLocally(
                toolEvent.name,
                (toolEvent.input || {}) as Record<string, unknown>,
                pipelineConfig
              );

              await client.beta.sessions.events.send(session.id, {
                events: [{
                  type: 'user.custom_tool_result',
                  custom_tool_use_id: eventId,
                  content: [{ type: 'text', text: result }],
                }],
              });
            }
          }
        } else {
          // end_turn or retries_exhausted — we're done
          console.log(`  [${agentConfig.name}] Concluído`);
          break;
        }
        continue;
      }

      case 'session.status_terminated': {
        console.log(`  [${agentConfig.name}] Session terminated`);
        break;
      }

      case 'session.error': {
        const err = (event as any).error;
        console.error(`  [${agentConfig.name}] Error: ${err?.message || 'unknown'}`);
        break;
      }
    }

    // Break out of for-await on terminal events
    if (event.type === 'session.status_terminated') break;
    if (event.type === 'session.status_idle') {
      const stopReason = (event as any).stop_reason;
      if (stopReason?.type !== 'requires_action') break;
    }
  }

  return finalText;
}
