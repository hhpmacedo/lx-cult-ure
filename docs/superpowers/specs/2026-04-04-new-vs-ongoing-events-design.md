# New vs. Ongoing Events in Weekly Curation

## Problem

All curated events are treated identically — there's no distinction between events debuting this week and long-running events (exhibitions, festivals) that started earlier. Readers can't tell what's new from what's still available, and the curation logic doesn't account for this when selecting events.

## Solution

Split each edition into two sections and have Claude classify events during curation.

### Data Model

Add a `status` field to `CuratedEvent`:

```typescript
status: 'new' | 'ongoing'
```

**Files to update:**
- `pipeline/src/types.ts` — add `status` to `CuratedEvent`
- `src/lib/types.ts` — add `status` to `CuratedEvent`
- `src/content.config.ts` — add `z.enum(['new', 'ongoing'])` to the event schema

### Curation Prompt

Update `pipeline/src/ai/prompts.ts`:

- Instruct Claude to classify each event as `new` (start date falls within the stated week) or `ongoing` (started before the week but still running)
- For `ongoing` events: only include those notable enough to warrant re-featuring — major exhibitions, landmark performances, significant festivals. Not routine recurring events or workshops.
- No hard cap on either section — fully editorial discretion
- Add `status` to the expected JSON output format

The week range (`weekStart`, `weekEnd`) is already passed to the prompt. Claude already interprets raw `dateText` strings, so classification requires no new parsing logic.

### Frontend — Edition Page

Update `src/pages/edicao/[slug].astro` (and any shared edition rendering logic):

1. Split `edition.events` into two arrays: `events.filter(e => e.status === 'new')` and `events.filter(e => e.status === 'ongoing')`
2. Render **"Estreias da semana"** section first with new events
3. Render **"Ainda a decorrer"** section after with ongoing events
4. Both sections use the existing `CategorySection` and `EventCard` components
5. If either section is empty, omit its heading (don't show an empty section)

### Frontend — Email Newsletter

Update `src/emails/WeeklyNewsletter.tsx`:

- Mirror the same two-section layout: "Estreias da semana" followed by "Ainda a decorrer"
- Use section headings consistent with the website styling
- Same empty-section rule: omit heading if no events in that status

### What Does NOT Change

- **Scrapers** — no changes, `dateText` passed as-is
- **Pipeline orchestration** — same scrape → curate → review → publish flow
- **Edition JSON structure** — still one file per week with the same `dateRange`, `slug`, etc. Events are in a single `events` array (not split into separate arrays)
- **Featured event logic** — a featured event can have either status
- **Archive pages** — no changes needed
- **RSS feed** — no changes needed

### Backward Compatibility

Existing edition JSON files won't have the `status` field. The Zod schema should use `.default('new')` so older editions render without errors, treating all their events as new.
