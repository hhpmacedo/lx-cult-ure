# New vs. Ongoing Events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split curated events into "Estreias da semana" (new) and "Ainda a decorrer" (ongoing) sections on the website and email newsletter, with Claude classifying each event during curation.

**Architecture:** Add a `status: 'new' | 'ongoing'` field to the `CuratedEvent` type across both packages (pipeline + frontend). Update the AI curation prompt to instruct Claude to classify events. Update the edition page and email template to render two sections grouped by status.

**Tech Stack:** TypeScript, Astro, React Email, Zod, Anthropic SDK

---

### Task 1: Add `status` field to pipeline types

**Files:**
- Modify: `pipeline/src/types.ts:29-46`

- [ ] **Step 1: Add `status` to the `CuratedEvent` interface**

In `pipeline/src/types.ts`, add `status` after the `featured` field:

```typescript
export interface CuratedEvent {
  id: string;
  title: string;
  category: Category;
  venue: string;
  venueNeighborhood: string;
  dates: string;
  time?: string;
  price?: string;
  blurb: string;
  criticSource?: string;
  criticQuote?: string;
  originalUrl?: string;
  imageUrl?: string;
  tags: string[];
  aiScore: number;
  featured: boolean;
  status: 'new' | 'ongoing';
}
```

- [ ] **Step 2: Update the curator default in `pipeline/src/ai/curator.ts`**

In `curator.ts`, where events are mapped after parsing (around line 99-105), add a default for `status`:

```typescript
const events = result.events.map((e, idx) => ({
  ...e,
  id: e.id || `evt-${String(i * MAX_EVENTS_PER_BATCH + idx + 1).padStart(3, '0')}`,
  featured: e.featured || false,
  tags: e.tags || [],
  aiScore: e.aiScore || 50,
  status: e.status || 'new',
}));
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/src/types.ts pipeline/src/ai/curator.ts
git commit -m "feat: add status field to CuratedEvent in pipeline types"
```

---

### Task 2: Add `status` field to frontend types and Zod schema

**Files:**
- Modify: `src/lib/types.ts:21-38`
- Modify: `src/content.config.ts:16-40`

- [ ] **Step 1: Add `status` to the frontend `CuratedEvent` interface**

In `src/lib/types.ts`, add `status` after `featured`:

```typescript
export interface CuratedEvent {
  id: string;
  title: string;
  category: Category;
  venue: string;
  venueNeighborhood: string;
  dates: string;
  time?: string;
  price?: string;
  blurb: string;
  criticSource?: string;
  criticQuote?: string;
  originalUrl?: string;
  imageUrl?: string;
  tags: string[];
  aiScore: number;
  featured: boolean;
  status: 'new' | 'ongoing';
}
```

- [ ] **Step 2: Add `status` to the Zod schema with a default for backward compatibility**

In `src/content.config.ts`, add `status` to the event object schema after `featured`:

```typescript
featured: z.boolean(),
status: z.enum(['new', 'ongoing']).default('new'),
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts src/content.config.ts
git commit -m "feat: add status field to frontend types and Zod schema"
```

---

### Task 3: Update AI curation prompt

**Files:**
- Modify: `pipeline/src/ai/prompts.ts:28-66`

- [ ] **Step 1: Add `status` to the field list in `buildCurationPrompt`**

In the prompt string returned by `buildCurationPrompt`, add the `status` field to the list of fields Claude should return. Insert after the `"dates"` line:

```typescript
- "status": "new" se o evento começa esta semana, "ongoing" se já estava a decorrer antes desta semana
```

- [ ] **Step 2: Add classification guidance to the REGRAS section**

Add a new rule after rule 5 ("Escreve TUDO em português"):

```
6. Classifica cada evento: "new" se a data de início cai dentro da semana ${weekStart} a ${weekEnd}, "ongoing" se o evento começou antes mas ainda decorre. Para eventos "ongoing", inclui apenas os verdadeiramente notáveis — grandes exposições, festivais relevantes, espetáculos de referência. Não incluas workshops recorrentes ou eventos de rotina.
```

- [ ] **Step 3: Add `status` to the example JSON format**

In the response format section at the end of the prompt, the `"events": [...]` is left as a placeholder. No change needed here since the field list above already defines the expected output.

- [ ] **Step 4: Verify the full prompt reads correctly**

Read `pipeline/src/ai/prompts.ts` and verify the prompt is coherent and the new rule integrates naturally with the existing rules.

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/ai/prompts.ts
git commit -m "feat: instruct curator to classify events as new or ongoing"
```

---

### Task 4: Update the edition page to render two sections

**Files:**
- Modify: `src/pages/edicao/[slug].astro:1-49`

- [ ] **Step 1: Split events by status and render two section groups**

Replace the frontmatter logic and template in `[slug].astro`. The new logic splits events into `newEvents` and `ongoingEvents`, then renders each group with its own heading and category sections:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import EditionHeader from '../../components/EditionHeader.astro';
import CategorySection from '../../components/CategorySection.astro';
import SubscribeForm from '../../components/SubscribeForm.astro';
import type { Category } from '../../lib/types';
import EventActionsScript from '../../components/EventActionsScript.astro';

export async function getStaticPaths() {
  const editions = await getCollection('editions');
  return editions.map((entry) => ({
    params: { slug: entry.data.slug },
    props: { edition: entry.data },
  }));
}

const { edition } = Astro.props;

const categories: Category[] = [
  'artes-performativas',
  'artes-visuais',
  'literatura',
  'musica-noite',
];

const newEvents = edition.events.filter((e: { status?: string }) => e.status !== 'ongoing');
const ongoingEvents = edition.events.filter((e: { status?: string }) => e.status === 'ongoing');

const newByCategory = categories
  .map((cat) => ({
    category: cat,
    events: newEvents.filter((e: { category: Category }) => e.category === cat),
  }))
  .filter((group: { events: unknown[] }) => group.events.length > 0);

const ongoingByCategory = categories
  .map((cat) => ({
    category: cat,
    events: ongoingEvents.filter((e: { category: Category }) => e.category === cat),
  }))
  .filter((group: { events: unknown[] }) => group.events.length > 0);
---

<BaseLayout title={`LX Cult(ure) — Semana ${edition.weekNumber}, ${edition.year}`} ogImage={`/og/${edition.slug}.png`}>
  <EditionHeader
    weekNumber={edition.weekNumber}
    year={edition.year}
    dateRange={edition.dateRange}
    introText={edition.introText}
  />

  {newByCategory.length > 0 && (
    <div class="section-group">
      <div class="container">
        <h2 class="section-heading">Estreias da semana</h2>
      </div>
      {newByCategory.map(({ category, events }: { category: Category; events: any[] }) => (
        <CategorySection category={category} events={events} />
      ))}
    </div>
  )}

  {ongoingByCategory.length > 0 && (
    <div class="section-group">
      <div class="container">
        <h2 class="section-heading section-heading--ongoing">Ainda a decorrer</h2>
      </div>
      {ongoingByCategory.map(({ category, events }: { category: Category; events: any[] }) => (
        <CategorySection category={category} events={events} />
      ))}
    </div>
  )}

  <SubscribeForm />
  <EventActionsScript />
</BaseLayout>

<style>
  .section-heading {
    font-size: clamp(1.3rem, 3vw, 1.8rem);
    font-family: var(--font-display);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-bottom: var(--space-md);
    border-bottom: 3px solid var(--cor-texto);
    margin-bottom: var(--space-lg);
  }

  .section-heading--ongoing {
    border-bottom-color: var(--cor-borda);
    color: #666;
  }

  .section-group {
    margin-bottom: var(--space-xl);
  }
</style>
```

- [ ] **Step 2: Verify the site builds**

```bash
cd /home/hugo/dev/lx-cult-ure && npm run build
```

Expected: Build succeeds. The existing edition (2026-W14) should render with all events under "Estreias da semana" since they have no `status` field and the Zod default is `'new'`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/edicao/[slug].astro
git commit -m "feat: split edition page into new and ongoing event sections"
```

---

### Task 5: Update the email newsletter template

**Files:**
- Modify: `src/emails/WeeklyNewsletter.tsx:26-42` (types) and `src/emails/WeeklyNewsletter.tsx:104-201` (render logic)

- [ ] **Step 1: Add `status` to the email's mirrored `CuratedEvent` interface**

In `src/emails/WeeklyNewsletter.tsx`, add `status` to the local `CuratedEvent` interface (around line 30-42):

```typescript
interface CuratedEvent {
  id: string;
  title: string;
  category: Category;
  venue: string;
  venueNeighborhood: string;
  dates: string;
  time?: string;
  price?: string;
  blurb: string;
  criticSource?: string;
  criticQuote?: string;
  originalUrl?: string;
  tags: string[];
  aiScore: number;
  featured: boolean;
  status?: 'new' | 'ongoing';
}
```

Note: `status` is optional here so the template gracefully handles older editions without the field.

- [ ] **Step 2: Update the render logic to split events into two sections**

Replace the `{/* Events by category */}` block (around lines 157-201) with two section groups. In the `WeeklyNewsletter` component, replace the events rendering with:

```tsx
          {/* Estreias da semana */}
          {(() => {
            const newEvents = edition.events.filter((e) => e.status !== 'ongoing');
            const hasNew = categoryOrder.some(
              (cat) => newEvents.filter((e) => e.category === cat).length > 0
            );
            if (!hasNew) return null;

            return (
              <>
                <Section style={{ padding: '0 32px 8px' }}>
                  <Heading as="h2" style={styles.sectionHeading}>
                    ESTREIAS DA SEMANA
                  </Heading>
                </Section>
                {categoryOrder.map((cat) => {
                  const events = newEvents
                    .filter((e) => e.category === cat)
                    .sort((a, b) => {
                      if (a.featured && !b.featured) return -1;
                      if (!a.featured && b.featured) return 1;
                      return b.aiScore - a.aiScore;
                    });
                  if (events.length === 0) return null;
                  return (
                    <Section key={cat} style={{ marginBottom: '32px' }}>
                      <Row style={{ marginBottom: '16px' }}>
                        <Column style={{ width: '20px' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: categoryColors[cat] }} />
                        </Column>
                        <Column style={{ paddingLeft: '12px' }}>
                          <Heading as="h2" style={styles.categoryTitle}>{categoryLabels[cat]}</Heading>
                        </Column>
                      </Row>
                      {events.map((event) => (
                        <EventCard key={event.id} event={event} catColor={categoryColors[cat]} siteUrl={siteUrl} />
                      ))}
                    </Section>
                  );
                })}
              </>
            );
          })()}

          {/* Ainda a decorrer */}
          {(() => {
            const ongoingEvents = edition.events.filter((e) => e.status === 'ongoing');
            const hasOngoing = categoryOrder.some(
              (cat) => ongoingEvents.filter((e) => e.category === cat).length > 0
            );
            if (!hasOngoing) return null;

            return (
              <>
                <Section style={{ padding: '0 32px 8px' }}>
                  <Hr style={{ borderTop: `1px solid #ddd`, margin: '0 0 24px' }} />
                  <Heading as="h2" style={{ ...styles.sectionHeading, color: colors.cinza }}>
                    AINDA A DECORRER
                  </Heading>
                </Section>
                {categoryOrder.map((cat) => {
                  const events = ongoingEvents
                    .filter((e) => e.category === cat)
                    .sort((a, b) => b.aiScore - a.aiScore);
                  if (events.length === 0) return null;
                  return (
                    <Section key={`ongoing-${cat}`} style={{ marginBottom: '32px' }}>
                      <Row style={{ marginBottom: '16px' }}>
                        <Column style={{ width: '20px' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: categoryColors[cat] }} />
                        </Column>
                        <Column style={{ paddingLeft: '12px' }}>
                          <Heading as="h2" style={styles.categoryTitle}>{categoryLabels[cat]}</Heading>
                        </Column>
                      </Row>
                      {events.map((event) => (
                        <EventCard key={event.id} event={event} catColor={categoryColors[cat]} siteUrl={siteUrl} />
                      ))}
                    </Section>
                  );
                })}
              </>
            );
          })()}
```

- [ ] **Step 3: Add the `sectionHeading` style**

Add to the `styles` object at the bottom of the file:

```typescript
  sectionHeading: {
    fontSize: '13px',
    fontWeight: 900,
    letterSpacing: '2px',
    color: colors.texto,
    margin: '0 0 16px',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,
```

- [ ] **Step 4: Commit**

```bash
git add src/emails/WeeklyNewsletter.tsx
git commit -m "feat: split email newsletter into new and ongoing sections"
```

---

### Task 6: Add `status` to sample edition and verify

**Files:**
- Modify: `src/content/editions/2026-W14.json`

- [ ] **Step 1: Add `status` to existing events in the sample edition**

Add `"status": "new"` to most events, and `"status": "ongoing"` to the Paula Rego exhibition (evt-001, which runs "30 Mar – 15 Jun" — a multi-month exhibition that would be ongoing in subsequent weeks). For the first edition, all events can be `"new"` since this is their first appearance. But to test the two-section layout, mark evt-001 as `"ongoing"`.

Add `"status": "ongoing"` to the evt-001 object and `"status": "new"` to all other event objects in the JSON file.

- [ ] **Step 2: Build the site and verify**

```bash
cd /home/hugo/dev/lx-cult-ure && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Run dev server and visually verify**

```bash
cd /home/hugo/dev/lx-cult-ure && npm run dev
```

Visit `http://localhost:4321/edicao/2026-W14` and verify:
- "Estreias da semana" section shows all events except Paula Rego
- "Ainda a decorrer" section shows the Paula Rego exhibition
- Both sections have category groupings with the correct headings

- [ ] **Step 4: Preview the email**

```bash
cd /home/hugo/dev/lx-cult-ure && npm run newsletter:preview
```

Verify the email output shows two distinct sections.

- [ ] **Step 5: Commit**

```bash
git add src/content/editions/2026-W14.json
git commit -m "feat: add status field to sample edition data"
```
