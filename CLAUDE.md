# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LX Cult(ure) is a weekly cultural events newsletter for Lisbon. It combines an Astro static site (frontend) with an AI-powered scraping/curation pipeline, delivered via email through Resend.

## Commands

### Website

```bash
npm install                  # Install site dependencies
npm run dev                  # Dev server
npm run build                # Production build
npm run preview              # Preview production build
```

### Pipeline (run from `pipeline/`)

```bash
npm install                  # Install pipeline dependencies
npm run pipeline             # Full pipeline: scrape → curate → review → publish
npm run pipeline:scrape      # Scrape events from all sources
npm run pipeline:curate      # AI curation with Claude
npm run pipeline:publish     # Write edition JSON to src/content/editions/
npm run agents               # Alternative multi-agent pipeline
npm test                     # Run tests (vitest)
npx tsc --noEmit             # Type check
```

### Newsletter

```bash
npm run newsletter:preview   # Preview without sending
npm run newsletter:send      # Send production newsletter
```

## Architecture

**Two-package structure**: the site root is an Astro project; `pipeline/` is a separate npm package with its own dependencies and tsconfig.

### Data Flow

```
Scrapers (7 sources) → raw-events.json (cache)
  → Claude Curator (batched, Portuguese persona)
  → [Optional human review server]
  → publishEdition() → src/content/editions/{weekId}.json
  → Astro static build → Vercel
  → send-newsletter.ts → Resend
```

### Key Architectural Decisions

- **Content collections**: Weekly editions are JSON files in `src/content/editions/` validated by Zod schema in `src/content.config.ts`. Astro's content loader pattern drives all edition pages.
- **Scraper interface**: Each source implements the `Scraper` base class in `pipeline/src/scrapers/`. Playwright for browser-rendered pages, Cheerio for static HTML.
- **AI curation**: Uses Claude Sonnet via `@anthropic-ai/sdk`. Batch processing (80 events/batch) with a Portuguese-language curator persona defined in `pipeline/src/ai/prompts.ts`.
- **Dual pipeline modes**: Sequential pipeline (`run-pipeline.ts`) and multi-agent system (`agents/run-agents.ts` with scout/curator/publisher agents).
- **Feedback loop**: `/api/feedback` collects user favorites/dismissals that feed back into future curation.
- **Email**: React Email components (`src/emails/WeeklyNewsletter.tsx`) rendered to HTML/text via `@react-email/render`.

### Event Categories

Four fixed categories: `artes-performativas`, `artes-visuais`, `literatura`, `musica-noite`.

### Path Aliases

`@/*` maps to `src/*` (configured in root tsconfig).

## Conventions

- UI and content are in **Portuguese**; code and comments are in **English**.
- Edition files are named by ISO week: `src/content/editions/{weekId}.json`.
- The weekly pipeline runs automatically via GitHub Actions every Friday at 6am UTC.
- Environment variables: `RESEND_API_KEY`, `RESEND_SEGMENT_ID`, `ANTHROPIC_API_KEY`, `NEWSLETTER_SEND_SECRET`.
