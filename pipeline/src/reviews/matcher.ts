import Anthropic from '@anthropic-ai/sdk';
import type { RawEvent, CriticReview } from '../types.js';
import { HAIKU_MODEL } from '../ai/models.js';

export interface EnrichedEvent extends RawEvent {
  matchedReviews: Array<{
    source: string;
    sentiment: string;
    rating?: number;
    quote: string;
    url: string;
    reviewerName?: string;
  }>;
  criticConsensus?: string; // AI-generated summary of critic opinions
  criticScore?: number; // 0-100 based on reviews
}

/**
 * Match critic reviews to scraped events using Claude.
 *
 * The challenge: review titles don't always match event titles exactly.
 * A review titled "O novo espectáculo de Tiago Rodrigues conquista"
 * might correspond to an event titled "By Heart — Tiago Rodrigues".
 *
 * We use Claude to do fuzzy semantic matching.
 */
export async function matchReviewsToEvents(
  events: RawEvent[],
  reviews: CriticReview[]
): Promise<EnrichedEvent[]> {
  if (reviews.length === 0) {
    console.log('[matcher] No reviews to match — returning events as-is');
    return events.map((e) => ({ ...e, matchedReviews: [] }));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[matcher] No ANTHROPIC_API_KEY — skipping AI matching');
    return fallbackMatch(events, reviews);
  }

  const client = new Anthropic({ apiKey });

  console.log(`[matcher] Matching ${reviews.length} reviews to ${events.length} events...`);

  // Simplify data for the prompt
  const simpleEvents = events.map((e, i) => ({
    idx: i,
    title: e.title,
    venue: e.venue || '',
    desc: e.rawDescription?.slice(0, 100) || '',
  }));

  const simpleReviews = reviews.map((r, i) => ({
    idx: i,
    title: r.title,
    artist: r.artist || '',
    venue: r.venue || '',
    source: r.source,
    sentiment: r.sentiment,
    rating: r.rating,
    quote: r.quote?.slice(0, 150) || '',
  }));

  // Batch if needed (keep under ~50k tokens)
  const MAX_EVENTS_PER_BATCH = 60;
  const allMatches = new Map<number, number[]>(); // eventIdx → [reviewIdx, ...]

  for (let i = 0; i < simpleEvents.length; i += MAX_EVENTS_PER_BATCH) {
    const eventBatch = simpleEvents.slice(i, i + MAX_EVENTS_PER_BATCH);

    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `Match these critic reviews to events. A review matches an event if they're about the same show, exhibition, concert, or cultural work. Match by artist name, venue, title similarity, or topic.

EVENTS:
${JSON.stringify(eventBatch)}

REVIEWS:
${JSON.stringify(simpleReviews)}

Return JSON only — an array of matches:
[{"event_idx": 0, "review_idxs": [2, 5]}, ...]

Only include events that have at least one matching review. If no matches found, return [].`,
        },
      ],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    if (!textBlock) continue;

    let jsonStr = textBlock.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    try {
      const matches: Array<{ event_idx: number; review_idxs: number[] }> =
        JSON.parse(jsonStr.trim());

      for (const m of matches) {
        const globalEventIdx = i + m.event_idx;
        const existing = allMatches.get(globalEventIdx) || [];
        allMatches.set(globalEventIdx, [...existing, ...m.review_idxs]);
      }
    } catch {
      console.warn('[matcher] Failed to parse match response');
    }
  }

  // Build enriched events
  const enriched: EnrichedEvent[] = events.map((event, idx) => {
    const reviewIdxs = allMatches.get(idx) || [];
    const matched = reviewIdxs
      .filter((ri) => ri >= 0 && ri < reviews.length)
      .map((ri) => {
        const r = reviews[ri];
        return {
          source: `${r.source}${r.reviewerName ? ` (${r.reviewerName})` : ''}`,
          sentiment: r.sentiment,
          rating: r.rating,
          quote: r.quote,
          url: r.url,
          reviewerName: r.reviewerName,
        };
      });

    // Calculate critic score from matched reviews
    let criticScore: number | undefined;
    if (matched.length > 0) {
      const sentimentScores = matched.map((m) => {
        switch (m.sentiment) {
          case 'positive': return 85;
          case 'mixed': return 55;
          case 'negative': return 25;
          default: return 50;
        }
      });
      // If there's a numeric rating, weight it more
      const ratingScores = matched
        .filter((m) => m.rating !== undefined)
        .map((m) => (m.rating! / 5) * 100);

      const allScores = [...sentimentScores, ...ratingScores];
      criticScore = Math.round(
        allScores.reduce((a, b) => a + b, 0) / allScores.length
      );
    }

    // Build consensus string
    let criticConsensus: string | undefined;
    if (matched.length > 0) {
      const positive = matched.filter((m) => m.sentiment === 'positive').length;
      const total = matched.length;
      if (positive === total) {
        criticConsensus = `Unanimemente positivo (${total} crítica${total > 1 ? 's' : ''})`;
      } else if (positive > total / 2) {
        criticConsensus = `Maioritariamente positivo (${positive}/${total} críticas)`;
      } else {
        criticConsensus = `Recepção mista (${total} crítica${total > 1 ? 's' : ''})`;
      }
    }

    return {
      ...event,
      matchedReviews: matched,
      criticConsensus,
      criticScore,
    };
  });

  const withReviews = enriched.filter((e) => e.matchedReviews.length > 0);
  console.log(
    `[matcher] Matched ${withReviews.length}/${events.length} events with critic reviews`
  );

  return enriched;
}

/**
 * Fallback: simple text matching when AI is unavailable.
 */
function fallbackMatch(
  events: RawEvent[],
  reviews: CriticReview[]
): EnrichedEvent[] {
  return events.map((event) => {
    const titleWords = event.title.toLowerCase().split(/\s+/);
    const matched = reviews
      .filter((r) => {
        const reviewWords = `${r.title} ${r.artist || ''} ${r.venue || ''}`.toLowerCase();
        // Match if 2+ significant words overlap
        const overlap = titleWords.filter(
          (w) => w.length > 3 && reviewWords.includes(w)
        );
        return overlap.length >= 2;
      })
      .map((r) => ({
        source: `${r.source}${r.reviewerName ? ` (${r.reviewerName})` : ''}`,
        sentiment: r.sentiment,
        rating: r.rating,
        quote: r.quote,
        url: r.url,
        reviewerName: r.reviewerName,
      }));

    return { ...event, matchedReviews: matched };
  });
}
