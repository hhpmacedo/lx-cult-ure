import type { APIRoute } from 'astro';
import { put, get } from '@vercel/blob';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    const signal = {
      eventId: body.eventId,
      action: body.action,
      editionSlug: body.editionSlug || '',
      timestamp: body.timestamp || new Date().toISOString(),
    };

    const line = JSON.stringify(signal) + '\n';

    // Read existing signals, append new one
    let existing = '';
    try {
      const blob = await get('feedback/signals.jsonl');
      if (blob) {
        existing = await blob.text();
      }
    } catch {
      // File doesn't exist yet — that's fine
    }

    await put('feedback/signals.jsonl', existing + line, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/x-ndjson',
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[feedback] Error:', error);
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
