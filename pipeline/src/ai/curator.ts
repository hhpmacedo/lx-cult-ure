import Anthropic from '@anthropic-ai/sdk';
import type { RawEvent, CuratedEvent } from '../types.js';
import { CURATOR_SYSTEM_PROMPT, buildCurationPrompt } from './prompts.js';
import { OPUS_MODEL } from './models.js';
import { join, resolve } from 'path';
import { buildFeedbackContext } from '../feedback/aggregate.js';

interface CurationResult {
  introText: string;
  events: CuratedEvent[];
}

/**
 * AI-powered event curator using Claude API.
 * Takes raw scraped events and produces a curated, ranked selection.
 */
export async function curateEvents(
  rawEvents: RawEvent[],
  weekStart: string,
  weekEnd: string
): Promise<CurationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Export it or add to pipeline/.env'
    );
  }

  const client = new Anthropic({ apiKey });

  // Batch events if there are too many (to stay within context limits)
  const MAX_EVENTS_PER_BATCH = 80;
  const batches: RawEvent[][] = [];
  for (let i = 0; i < rawEvents.length; i += MAX_EVENTS_PER_BATCH) {
    batches.push(rawEvents.slice(i, i + MAX_EVENTS_PER_BATCH));
  }

  console.log(
    `[curator] Processing ${rawEvents.length} events in ${batches.length} batch(es)...`
  );

  // Fetch user feedback signals
  const cacheDir = join(resolve('.'), '.cache');
  const feedbackContext = await buildFeedbackContext(cacheDir);
  if (feedbackContext) {
    console.log('[curator] Feedback context loaded');
  }

  const allCuratedEvents: CuratedEvent[] = [];
  let introText = '';

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `[curator] Batch ${i + 1}/${batches.length}: ${batch.length} events`
    );

    // Simplify raw events to reduce tokens
    const simplified = batch.map((e) => ({
      title: e.title,
      desc: e.rawDescription?.slice(0, 300) || '',
      venue: e.venue || '',
      neighborhood: e.neighborhood || '',
      date: e.dateText || '',
      time: e.timeText || '',
      price: e.priceText || '',
      category: e.category || '',
      url: e.url,
      source: e.source,
      image: e.imageUrl || '',
    }));

    const userPrompt = buildCurationPrompt(
      JSON.stringify(simplified, null, 2),
      weekStart,
      weekEnd,
      feedbackContext
    );

    const response = await client.messages.create({
      model: OPUS_MODEL,
      max_tokens: 8000,
      system: CURATOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extract text response
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error(`[curator] No text response in batch ${i + 1}`);
      continue;
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = textBlock.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    try {
      const result = JSON.parse(jsonStr.trim()) as CurationResult;

      if (result.introText && !introText) {
        introText = result.introText;
      }

      if (result.events && Array.isArray(result.events)) {
        // Add IDs if missing
        const events = result.events.map((e, idx) => ({
          ...e,
          id: e.id || `evt-${String(i * MAX_EVENTS_PER_BATCH + idx + 1).padStart(3, '0')}`,
          featured: e.featured || false,
          tags: e.tags || [],
          aiScore: e.aiScore || 50,
          status: e.status || 'new',
        }));
        allCuratedEvents.push(...events);
      }
    } catch (parseError) {
      console.error(
        `[curator] Failed to parse JSON from batch ${i + 1}:`,
        parseError
      );
      console.error('[curator] Raw response:', jsonStr.slice(0, 500));
    }
  }

  // Final deduplication by title similarity
  const deduplicated = deduplicateEvents(allCuratedEvents);

  // Ensure exactly 4 featured events (1 per category if possible)
  const finalEvents = ensureFeatured(deduplicated);

  // Sort by score descending
  finalEvents.sort((a, b) => b.aiScore - a.aiScore);

  console.log(
    `[curator] Final result: ${finalEvents.length} curated events`
  );

  return {
    introText:
      introText ||
      'Esta semana em Lisboa, a cultura não pára. Dos palcos às galerias, há muito para descobrir.',
    events: finalEvents,
  };
}

/**
 * Remove duplicate events based on title similarity
 */
function deduplicateEvents(events: CuratedEvent[]): CuratedEvent[] {
  const seen = new Map<string, CuratedEvent>();

  for (const event of events) {
    const key = normalizeTitle(event.title);
    const existing = seen.get(key);

    if (!existing || event.aiScore > existing.aiScore) {
      seen.set(key, event);
    }
  }

  return Array.from(seen.values());
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõúüç\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ensure we have featured events across categories
 */
function ensureFeatured(events: CuratedEvent[]): CuratedEvent[] {
  const categories = [
    'artes-performativas',
    'artes-visuais',
    'literatura',
    'musica-noite',
  ] as const;

  // Reset all featured
  events.forEach((e) => (e.featured = false));

  // Pick top event per category
  for (const cat of categories) {
    const catEvents = events
      .filter((e) => e.category === cat)
      .sort((a, b) => b.aiScore - a.aiScore);

    if (catEvents.length > 0) {
      catEvents[0].featured = true;
    }
  }

  return events;
}
