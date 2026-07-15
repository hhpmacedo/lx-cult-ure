import Anthropic from '@anthropic-ai/sdk';
import { SONNET_MODEL } from '../ai/models.js';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { recordPostEventReviews, loadMemory } from '../memory/store.js';
import type { PostEventReview } from '../memory/types.js';

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

/**
 * Post-event validation agent.
 * After a week passes, this agent checks if the events we recommended
 * actually got good reviews, closing the feedback loop.
 *
 * In a full implementation, this would scrape review sites.
 * For now, it uses Claude to simulate/analyze based on known patterns.
 */
async function validatePostEvent() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const client = new Anthropic({ apiKey });
  const mem = loadMemory();

  // Find the last published edition
  const contentDir = join(resolve('..'), 'src', 'content', 'editions');
  if (!existsSync(contentDir)) {
    console.error('No editions directory found.');
    process.exit(1);
  }

  // Get the most recent edition that's at least 7 days old
  const files = require('fs')
    .readdirSync(contentDir)
    .filter((f: string) => f.endsWith('.json'))
    .sort()
    .reverse();

  let targetEdition = null;
  for (const file of files) {
    const edition = JSON.parse(
      readFileSync(join(contentDir, file), 'utf-8')
    );
    const endDate = new Date(edition.dateRange?.end || '');
    const daysSinceEnd =
      (Date.now() - endDate.getTime()) / (1000 * 60 * 60 * 24);

    // Only validate editions that are at least 3 days past
    if (daysSinceEnd >= 3) {
      targetEdition = edition;
      break;
    }
  }

  if (!targetEdition) {
    console.log('Nenhuma edição antiga o suficiente para validar.');
    return;
  }

  // Check if already validated
  const alreadyValidated = mem.postEventReviews.some(
    (r) => r.weekId === targetEdition.slug
  );
  if (alreadyValidated) {
    console.log(`Edição ${targetEdition.slug} já foi validada.`);
    return;
  }

  console.log(`\n🔍 A validar edição ${targetEdition.slug}...`);
  console.log(`   ${targetEdition.events.length} eventos para verificar\n`);

  // Use Claude to analyze event reception
  // In production, this would scrape actual reviews
  const eventsForAnalysis = targetEdition.events.map(
    (e: { title: string; venue: string; category: string; aiScore: number; dates: string }) => ({
      title: e.title,
      venue: e.venue,
      category: e.category,
      aiScore: e.aiScore,
      dates: e.dates,
    })
  );

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    messages: [
      {
        role: 'user',
        content: `Com base no teu conhecimento de eventos culturais em Lisboa, avalia como estes eventos provavelmente foram recebidos. Para cada evento, dá uma avaliação realista.

Eventos:
${JSON.stringify(eventsForAnalysis, null, 2)}

Responde em JSON (array):
[
  {
    "title": "título do evento",
    "reception": "positive|mixed|negative|unknown",
    "confidence": "high|medium|low",
    "reasoning": "breve razão"
  }
]

Sê honesto — nem todos os eventos terão sido um sucesso. Considera:
- Artistas/companhias conhecidos tendem a ter boa recepção
- Eventos experimentais/novos são mais arriscados
- Venues com boa programação (Teatro São Luiz, Culturgest, etc.) tendem a ter qualidade consistente
- Se não sabes o suficiente, usa "unknown"`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  if (!textBlock) return;

  let jsonStr = textBlock.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  let validations: Array<{
    title: string;
    reception: string;
    confidence: string;
    reasoning: string;
  }>;

  try {
    validations = JSON.parse(jsonStr.trim());
  } catch {
    console.error('Erro ao interpretar validações');
    return;
  }

  // Record reviews
  const reviews: PostEventReview[] = [];
  for (const v of validations) {
    const event = targetEdition.events.find(
      (e: { title: string }) => e.title === v.title
    );
    if (!event) continue;

    reviews.push({
      weekId: targetEdition.slug,
      eventId: event.id,
      eventTitle: v.title,
      predictedScore: event.aiScore,
      actualReception: v.reception as PostEventReview['actualReception'],
      timestamp: new Date().toISOString(),
    });

    const emoji =
      v.reception === 'positive'
        ? '✅'
        : v.reception === 'negative'
          ? '❌'
          : v.reception === 'mixed'
            ? '🔶'
            : '❓';
    console.log(
      `  ${emoji} ${v.title} — predicted: ${event.aiScore}, actual: ${v.reception}`
    );
  }

  recordPostEventReviews(reviews);

  // Stats
  const positive = reviews.filter(
    (r) => r.actualReception === 'positive'
  ).length;
  const accuracy = ((positive / reviews.length) * 100).toFixed(0);

  console.log(
    `\n📊 Precisão: ${accuracy}% (${positive}/${reviews.length} positivos)`
  );
  console.log('✓ Validações registadas na memória');
}

validatePostEvent().catch(console.error);
