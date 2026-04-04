import { get } from '@vercel/blob';

interface FeedbackSignal {
  eventId: string;
  action: 'favorite' | 'unfavorite' | 'dismiss' | 'undismiss';
  editionSlug: string;
  timestamp: string;
}

/**
 * Build a feedback context string for the curation prompt.
 * Downloads user signals from Vercel Blob and cross-references
 * with past edition data to build venue/category preferences.
 */
export async function buildFeedbackContext(
  cacheDir: string
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;

  let text: string;
  try {
    const result = await get('feedback/signals.jsonl', { token, access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    text = new TextDecoder().decode(Buffer.concat(chunks));
  } catch {
    return null;
  }

  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 5) return null; // not enough data to be useful

  const signals: FeedbackSignal[] = lines.map((line) => JSON.parse(line));

  // Count net favorites per eventId
  const eventNet = new Map<string, number>();
  for (const s of signals) {
    const delta =
      s.action === 'favorite' || s.action === 'undismiss' ? 1 :
      s.action === 'unfavorite' || s.action === 'dismiss' ? -1 : 0;
    eventNet.set(s.eventId, (eventNet.get(s.eventId) || 0) + delta);
  }

  // Load past editions to map eventIds to venues/categories
  const { existsSync, readdirSync, readFileSync } = await import('fs');
  const { join, resolve } = await import('path');
  const editionsDir = join(resolve('..'), 'src', 'content', 'editions');

  const venueNet = new Map<string, number>();
  const categoryNet = new Map<string, number>();

  if (existsSync(editionsDir)) {
    const files = readdirSync(editionsDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const edition = JSON.parse(readFileSync(join(editionsDir, file), 'utf-8'));
      for (const event of edition.events || []) {
        const net = eventNet.get(event.id) || 0;
        if (net !== 0) {
          venueNet.set(event.venue, (venueNet.get(event.venue) || 0) + net);
          categoryNet.set(event.category, (categoryNet.get(event.category) || 0) + net);
        }
      }
    }
  }

  // Build summary lines
  const parts: string[] = [];

  const topVenues = [...venueNet.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([, net]) => net > 0);

  if (topVenues.length > 0) {
    parts.push(
      '- Locais populares: ' + topVenues.map(([v, n]) => `${v} (+${n})`).join(', ')
    );
  }

  const catRanking = [...categoryNet.entries()]
    .sort((a, b) => b[1] - a[1]);

  if (catRanking.length > 0) {
    parts.push(
      '- Categorias preferidas: ' + catRanking.map(([c, n]) => `${c} (${n >= 0 ? '+' : ''}${n})`).join(', ')
    );
  }

  const avoidVenues = [...venueNet.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .filter(([, net]) => net < 0);

  if (avoidVenues.length > 0) {
    parts.push(
      '- Locais menos populares: ' + avoidVenues.map(([v, n]) => `${v} (${n})`).join(', ')
    );
  }

  if (parts.length === 0) return null;

  return `SINAIS DOS LEITORES (baseado em ${signals.length} interações de edições anteriores):\n${parts.join('\n')}`;
}
