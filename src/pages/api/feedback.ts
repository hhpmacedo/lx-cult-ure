import type { APIRoute } from 'astro';

/**
 * Receives user feedback signals (favorites, dismissals) from the client.
 *
 * These signals feed back into the curation pipeline to improve future editions.
 * Data is stored as JSONL (one JSON object per line) for easy processing.
 *
 * Signals received:
 * - favorite/unfavorite: user marked an event as interesting
 * - dismiss/undismiss: user marked an event as not interesting
 */

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    const signal = {
      eventId: body.eventId,
      action: body.action,
      timestamp: body.timestamp || new Date().toISOString(),
      favoritesCount: body.favorites?.length || 0,
      dismissedCount: body.dismissed?.length || 0,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    };

    // In production, write to a persistent store.
    // For now, log to console where it can be captured by the pipeline.
    console.log(`[feedback] ${JSON.stringify(signal)}`);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
