# Auto-Publish with Feedback-Informed Curation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip the human review step by auto-selecting the top 25 curated events (min score 60), and feed user feedback signals from Vercel Blob into the curation prompt.

**Architecture:** Add `--auto` flag to the pipeline that sorts curated events by score and publishes the top 25 directly. Persist user feedback (favorites/dismissals) to Vercel Blob from the website API. At curation time, the pipeline downloads and aggregates feedback, injecting a summary into the Claude prompt.

**Tech Stack:** TypeScript, Vercel Blob (`@vercel/blob`), Anthropic SDK, Astro API routes

---

### Task 1: Add `--auto` flag to pipeline

**Files:**
- Modify: `pipeline/src/run-pipeline.ts:156-195`

- [ ] **Step 1: Add auto-select function**

Add the following function after `stepPublish` (around line 154) in `pipeline/src/run-pipeline.ts`:

```typescript
async function stepAutoPublish(config: PipelineConfig) {
  console.log('\n═══════════════════════════════════════');
  console.log('  PASSO 3: AUTO-PUBLICAÇÃO');
  console.log('═══════════════════════════════════════\n');

  const curatedPath = join(config.cacheDir, 'curated-events.json');

  if (!existsSync(curatedPath)) {
    console.error('Nenhum ficheiro de eventos curados encontrado.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(curatedPath, 'utf-8'));
  const allEvents = data.events || [];

  // Sort by aiScore descending, take top 25, drop below 60
  const selected = allEvents
    .sort((a: { aiScore: number }, b: { aiScore: number }) => b.aiScore - a.aiScore)
    .slice(0, 25)
    .filter((e: { aiScore: number }) => e.aiScore >= 60);

  console.log(`  Candidatos: ${allEvents.length}`);
  console.log(`  Selecionados: ${selected.length} (top 25, score >= 60)`);

  const result = { introText: data.introText, events: selected };
  publishEdition(result, config);
}
```

- [ ] **Step 2: Wire `--auto` into the main function**

Replace the `default` case in the `main` function's switch statement:

```typescript
    default: {
      // Full pipeline
      const autoMode = process.argv.includes('--auto');
      console.log(`\nA executar pipeline ${autoMode ? 'automático' : 'completo'}...\n`);
      await stepScrape(config);
      await stepCurate(config);
      if (autoMode) {
        await stepAutoPublish(config);
      } else {
        await stepReview(config);
      }
      break;
    }
```

- [ ] **Step 3: Add `pipeline:auto` script to `pipeline/package.json`**

Add to the `scripts` section:

```json
"pipeline:auto": "tsx src/run-pipeline.ts --auto"
```

- [ ] **Step 4: Commit**

```bash
cd /home/hugo/dev/lx-cult-ure && git add pipeline/src/run-pipeline.ts pipeline/package.json
git commit -m "feat: add --auto flag for auto-publish without human review"
```

---

### Task 2: Persist feedback to Vercel Blob

**Files:**
- Modify: `src/pages/api/feedback.ts:1-41`
- Modify: `package.json` (add `@vercel/blob` dependency)
- Modify: `.env.example`

- [ ] **Step 1: Install `@vercel/blob`**

```bash
cd /home/hugo/dev/lx-cult-ure && npm install @vercel/blob
```

- [ ] **Step 2: Add `BLOB_READ_WRITE_TOKEN` to `.env.example`**

Add after the last line in `.env.example`:

```
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 3: Rewrite the feedback API endpoint**

Replace the entire content of `src/pages/api/feedback.ts`:

```typescript
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
```

- [ ] **Step 4: Update the client script to include editionSlug**

In `src/components/EventActionsScript.astro`, update the `emitSignal` function's payload (around line 104-110) to include the edition slug. Add `editionSlug` derived from the URL:

```typescript
  function emitSignal(eventId: string, action: string): void {
    try {
      // Extract edition slug from URL (e.g., /edicao/2026-W14 → 2026-W14)
      const slugMatch = window.location.pathname.match(/\/edicao\/([^/]+)/);
      const editionSlug = slugMatch?.[1] || '';

      const payload = {
        eventId,
        action,
        editionSlug,
        timestamp: new Date().toISOString(),
        favorites: [...getSet(STORAGE_KEYS.favorites)],
        dismissed: [...getSet(STORAGE_KEYS.dismissed)],
      };

      // Fire and forget
      navigator.sendBeacon?.(
        '/api/feedback',
        new Blob([JSON.stringify(payload)], { type: 'application/json' })
      );
    } catch {
      // Silent fail — user experience is more important
    }
  }
```

- [ ] **Step 5: Commit**

```bash
cd /home/hugo/dev/lx-cult-ure && git add src/pages/api/feedback.ts src/components/EventActionsScript.astro package.json package-lock.json .env.example
git commit -m "feat: persist feedback signals to Vercel Blob"
```

---

### Task 3: Create feedback aggregator for the pipeline

**Files:**
- Create: `pipeline/src/feedback/aggregate.ts`
- Modify: `pipeline/package.json` (add `@vercel/blob` dependency)

- [ ] **Step 1: Install `@vercel/blob` in the pipeline**

```bash
cd /home/hugo/dev/lx-cult-ure/pipeline && npm install @vercel/blob
```

- [ ] **Step 2: Create the aggregator module**

Create `pipeline/src/feedback/aggregate.ts`:

```typescript
import { get } from '@vercel/blob';

interface FeedbackSignal {
  eventId: string;
  action: 'favorite' | 'unfavorite' | 'dismiss' | 'undismiss';
  editionSlug: string;
  timestamp: string;
}

export interface FeedbackSummary {
  venueScores: Array<{ venue: string; net: number }>;
  categoryScores: Array<{ category: string; net: number }>;
  dismissedPatterns: string[];
  totalSignals: number;
}

/**
 * Download and aggregate user feedback signals from Vercel Blob.
 * Returns a summary suitable for injection into the curation prompt.
 */
export async function aggregateFeedback(): Promise<FeedbackSummary | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.log('[feedback] BLOB_READ_WRITE_TOKEN not set, skipping feedback');
    return null;
  }

  let text: string;
  try {
    const blob = await get('feedback/signals.jsonl', { token });
    if (!blob) return null;
    text = await blob.text();
  } catch {
    console.log('[feedback] No feedback data found');
    return null;
  }

  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;

  const signals: FeedbackSignal[] = lines.map((line) => JSON.parse(line));

  // Net score per eventId: favorite = +1, unfavorite = -1, dismiss = -1, undismiss = +1
  const eventNet = new Map<string, number>();
  for (const s of signals) {
    const delta =
      s.action === 'favorite' || s.action === 'undismiss' ? 1 :
      s.action === 'unfavorite' || s.action === 'dismiss' ? -1 : 0;
    eventNet.set(s.eventId, (eventNet.get(s.eventId) || 0) + delta);
  }

  // We don't have venue/category info in the signals themselves,
  // so we return the raw event scores. The curator will cross-reference
  // with the curated events cache to build venue/category summaries.
  // For now, return event-level net scores.
  return {
    venueScores: [], // populated by curator from cached edition data
    categoryScores: [],
    dismissedPatterns: [],
    totalSignals: signals.length,
  };
}

/**
 * Build a feedback context string for the curation prompt.
 * Cross-references feedback signals with past edition data.
 */
export async function buildFeedbackContext(
  cacheDir: string
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;

  let text: string;
  try {
    const blob = await get('feedback/signals.jsonl', { token });
    if (!blob) return null;
    text = await blob.text();
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
```

- [ ] **Step 3: Commit**

```bash
cd /home/hugo/dev/lx-cult-ure && git add pipeline/src/feedback/aggregate.ts pipeline/package.json pipeline/package-lock.json
git commit -m "feat: add feedback aggregator to download and process user signals"
```

---

### Task 4: Inject feedback into curation prompt

**Files:**
- Modify: `pipeline/src/ai/prompts.ts:28-66`
- Modify: `pipeline/src/ai/curator.ts:10-16` and `pipeline/src/ai/curator.ts:62-67`

- [ ] **Step 1: Update `buildCurationPrompt` to accept feedback context**

In `pipeline/src/ai/prompts.ts`, change the `buildCurationPrompt` function signature to accept an optional `feedbackContext` parameter, and inject it before the raw events:

```typescript
export function buildCurationPrompt(
  rawEventsJson: string,
  weekStart: string,
  weekEnd: string,
  feedbackContext?: string | null
): string {
  const feedbackSection = feedbackContext
    ? `\n${feedbackContext}\n`
    : '';

  return `Analisa os seguintes eventos recolhidos de várias fontes para a semana de ${weekStart} a ${weekEnd} em Lisboa.
${feedbackSection}
Para cada evento relevante, devolve um objeto com:
...rest of prompt unchanged...`;
}
```

Only the function signature and the `feedbackSection` injection change. The rest of the prompt string stays exactly as-is.

- [ ] **Step 2: Update `curateEvents` to fetch and pass feedback**

In `pipeline/src/ai/curator.ts`, add the import and fetch feedback before batching:

Add import at the top:

```typescript
import { buildFeedbackContext } from '../feedback/aggregate.js';
```

Then in the `curateEvents` function, after the `console.log` about processing events (around line 37) and before the batch loop, add:

```typescript
  // Fetch user feedback signals
  const cacheDir = join(resolve('.'), '.cache');
  const feedbackContext = await buildFeedbackContext(cacheDir);
  if (feedbackContext) {
    console.log('[curator] Feedback context loaded');
  }
```

Add the needed imports at the top of the file:

```typescript
import { join, resolve } from 'path';
```

Then update the `buildCurationPrompt` call (around line 63-67) to pass the feedback context:

```typescript
    const userPrompt = buildCurationPrompt(
      JSON.stringify(simplified, null, 2),
      weekStart,
      weekEnd,
      feedbackContext
    );
```

- [ ] **Step 3: Commit**

```bash
cd /home/hugo/dev/lx-cult-ure && git add pipeline/src/ai/prompts.ts pipeline/src/ai/curator.ts
git commit -m "feat: inject user feedback signals into curation prompt"
```

---

### Task 5: Update GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/weekly-pipeline.yml:33-36`

- [ ] **Step 1: Switch from agents to auto pipeline and add Blob token**

Replace the "Run pipeline agents" step and add the `BLOB_READ_WRITE_TOKEN` secret:

```yaml
      - name: Run auto pipeline
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
        run: cd pipeline && npm run pipeline:auto
```

Also add `BLOB_READ_WRITE_TOKEN` to the newsletter step:

```yaml
      - name: Send newsletter
        env:
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          RESEND_SEGMENT_ID: ${{ secrets.RESEND_SEGMENT_ID }}
        run: npm run newsletter:send
```

- [ ] **Step 2: Commit**

```bash
cd /home/hugo/dev/lx-cult-ure && git add .github/workflows/weekly-pipeline.yml
git commit -m "feat: use auto pipeline in weekly GitHub Actions workflow"
```

---

### Task 6: Update env examples and verify

**Files:**
- Modify: `pipeline/.env.example`

- [ ] **Step 1: Add `BLOB_READ_WRITE_TOKEN` to pipeline `.env.example`**

Add to the end of `pipeline/.env.example`:

```
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 2: Build the site to verify no breakage**

```bash
cd /home/hugo/dev/lx-cult-ure && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Test the auto pipeline with cached data**

Since we already have cached curated events from the earlier run:

```bash
cd /home/hugo/dev/lx-cult-ure/pipeline && npx tsx src/run-pipeline.ts publish
```

Expected: Publishes a new edition from the cached curated events.

- [ ] **Step 4: Build site again with the new edition**

```bash
cd /home/hugo/dev/lx-cult-ure && npm run build
```

Expected: Build succeeds with the new edition rendered.

- [ ] **Step 5: Commit**

```bash
cd /home/hugo/dev/lx-cult-ure && git add pipeline/.env.example
git commit -m "feat: add BLOB_READ_WRITE_TOKEN to pipeline env example"
```
