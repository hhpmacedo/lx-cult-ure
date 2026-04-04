# Auto-Publish with Feedback-Informed Curation

## Problem

The pipeline requires a human review step before publishing, blocking automated weekly runs. User feedback signals (favorites/dismissals) are collected on the website but only logged to console — they never feed back into curation.

## Solution

Two changes: (1) auto-select the best events by score threshold to skip review, and (2) persist user feedback to Vercel Blob and inject it into the curator prompt.

### 1. Auto-Publish Logic

Add an `--auto` flag to the pipeline that replaces the review step. After curation produces ~60 candidates:

1. Sort by `aiScore` descending
2. Take top 25 events
3. Drop any with `aiScore < 60`
4. Proceed directly to publish

**Files to modify:**
- `pipeline/src/run-pipeline.ts` — add `--auto` flag, auto-select logic
- `.github/workflows/weekly-pipeline.yml` — use `--auto` flag instead of launching review server

The review server remains available for manual use via `npm run pipeline:review`.

### 2. Feedback Persistence (Vercel Blob)

Replace the `console.log` in `/api/feedback` with writes to Vercel Blob.

- Store as `feedback/signals.jsonl` — one JSON line per signal
- Each line: `{"eventId":"evt-003","action":"favorite","editionSlug":"2026-W14","timestamp":"..."}`
- Append-only — the pipeline reads and aggregates at curation time

**Files to modify:**
- `src/pages/api/feedback.ts` — write signals to Vercel Blob
- `.env.example` — add `BLOB_READ_WRITE_TOKEN`
- `package.json` — add `@vercel/blob` dependency

### 3. Feedback-Informed Curation

At curation time, the pipeline:

1. Downloads `feedback/signals.jsonl` from Vercel Blob
2. Aggregates signals: count favorites and dismissals per venue, category, and tag
3. Computes a feedback summary
4. Injects the summary into the curator prompt as additional context

The summary added to `buildCurationPrompt`:

```
SINAIS DOS LEITORES (baseado em edições anteriores):
- Locais populares: {top 5 venues by favorite count}
- Categorias preferidas: {categories ranked by net favorites}
- Padrões a evitar: {venues/tags with high dismissal rates}
```

This is advisory — Claude uses it alongside its own editorial judgment. When no feedback data exists (first runs), the section is omitted.

**Files to modify:**
- `pipeline/src/ai/curator.ts` — fetch signals from Blob, aggregate, pass to prompt builder
- `pipeline/src/ai/prompts.ts` — accept optional feedback summary parameter, inject into prompt
- `pipeline/package.json` — add `@vercel/blob` dependency

### 4. Memory Integration

Wire the aggregated Vercel Blob signals into the existing memory summary (`getMemorySummary()` in `pipeline/src/memory/store.ts`) so feedback enriches the memory context already used by the agent system.

**Files to modify:**
- `pipeline/src/memory/store.ts` — add function to incorporate user signal aggregates

### What Doesn't Change

- Scrapers — no changes
- Frontend — no changes (feedback UI already works)
- Email template — no changes
- Edition schema — no changes
- Review server — still available for manual use
- Existing memory types — we add to them, not replace
