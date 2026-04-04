import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import type {
  Memory,
  EditionFeedback,
  SourceScore,
  PromptVersion,
  CurationPattern,
  PostEventReview,
} from './types.js';

const MEMORY_DIR = join(resolve('.'), 'memory');
const MEMORY_FILE = join(MEMORY_DIR, 'memory.json');

function getDefaultMemory(): Memory {
  return {
    editionFeedback: [],
    sourceScores: [],
    promptHistory: [],
    curationPatterns: {
      preferredVenues: [],
      preferredNeighborhoods: [],
      preferredCategories: {
        'artes-performativas': 1.0,
        'artes-visuais': 1.0,
        'literatura': 1.0,
        'musica-noite': 1.0,
      },
      preferredTags: [],
      rejectedPatterns: [],
      touristIndicators: [
        'tuk-tuk',
        'hop-on hop-off',
        'fado dinner',
        'wine tasting tour',
        'pub crawl',
        'segway tour',
      ],
      avgEventsPerEdition: 15,
      avgFeaturedPerCategory: 1,
      preferredBlurbLength: { min: 80, max: 200 },
      lastUpdated: new Date().toISOString(),
    },
    postEventReviews: [],
    meta: {
      totalEditions: 0,
      averageRating: 0,
      lastImprovement: new Date().toISOString(),
      improvementCount: 0,
    },
  };
}

/**
 * Load memory from disk. Creates default if not found.
 */
export function loadMemory(): Memory {
  mkdirSync(MEMORY_DIR, { recursive: true });
  if (!existsSync(MEMORY_FILE)) {
    const mem = getDefaultMemory();
    saveMemory(mem);
    return mem;
  }
  return JSON.parse(readFileSync(MEMORY_FILE, 'utf-8'));
}

/**
 * Save memory to disk.
 */
export function saveMemory(memory: Memory): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
  writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf-8');
}

/**
 * Record feedback for an edition.
 */
export function recordEditionFeedback(feedback: EditionFeedback): void {
  const mem = loadMemory();
  mem.editionFeedback.push(feedback);
  mem.meta.totalEditions++;

  // Update rolling average rating
  const ratings = mem.editionFeedback.map((f) => f.rating);
  mem.meta.averageRating =
    ratings.reduce((a, b) => a + b, 0) / ratings.length;

  // Update curation patterns from feedback
  updatePatternsFromFeedback(mem, feedback);

  saveMemory(mem);
}

/**
 * Update source scores after an edition.
 */
export function updateSourceScores(
  weekId: string,
  sourceStats: Array<{
    sourceId: string;
    name: string;
    scraped: number;
    survivedCuration: number;
    survivedReview: number;
    avgScore: number;
  }>
): void {
  const mem = loadMemory();

  for (const stat of sourceStats) {
    let source = mem.sourceScores.find((s) => s.sourceId === stat.sourceId);

    if (!source) {
      source = {
        sourceId: stat.sourceId,
        name: stat.name,
        totalEventsScraped: 0,
        eventsSurvivedCuration: 0,
        eventsSurvivedReview: 0,
        averageAiScore: 0,
        weeklyScores: [],
        qualityScore: 50,
        lastUpdated: new Date().toISOString(),
      };
      mem.sourceScores.push(source);
    }

    source.totalEventsScraped += stat.scraped;
    source.eventsSurvivedCuration += stat.survivedCuration;
    source.eventsSurvivedReview += stat.survivedReview;

    source.weeklyScores.push({
      weekId,
      scraped: stat.scraped,
      survivedCuration: stat.survivedCuration,
      survivedReview: stat.survivedReview,
    });

    // Keep last 12 weeks
    if (source.weeklyScores.length > 12) {
      source.weeklyScores = source.weeklyScores.slice(-12);
    }

    // Calculate rolling quality score (0-100)
    const recent = source.weeklyScores.slice(-4);
    if (recent.length > 0) {
      const totalScraped = recent.reduce((a, w) => a + w.scraped, 0);
      const totalSurvived = recent.reduce((a, w) => a + w.survivedReview, 0);
      const survivalRate = totalScraped > 0 ? totalSurvived / totalScraped : 0;
      // Blend: 60% survival rate + 40% volume (having more events is better)
      const volumeScore = Math.min(totalScraped / 20, 1); // normalize to ~20 events
      source.qualityScore = Math.round(survivalRate * 60 + volumeScore * 40);
    }

    source.averageAiScore = stat.avgScore;
    source.lastUpdated = new Date().toISOString();
  }

  saveMemory(mem);
}

/**
 * Record a prompt version.
 */
export function recordPromptVersion(version: PromptVersion): void {
  const mem = loadMemory();
  mem.promptHistory.push(version);
  mem.meta.improvementCount++;
  mem.meta.lastImprovement = new Date().toISOString();
  saveMemory(mem);
}

/**
 * Record post-event reviews.
 */
export function recordPostEventReviews(reviews: PostEventReview[]): void {
  const mem = loadMemory();
  mem.postEventReviews.push(...reviews);
  // Keep last 200 reviews
  if (mem.postEventReviews.length > 200) {
    mem.postEventReviews = mem.postEventReviews.slice(-200);
  }
  saveMemory(mem);
}

/**
 * Get a summary of memory for agent context.
 */
export function getMemorySummary(): string {
  const mem = loadMemory();

  const lines: string[] = [
    `=== MEMÓRIA DO SISTEMA ===`,
    `Edições publicadas: ${mem.meta.totalEditions}`,
    `Rating médio: ${mem.meta.averageRating.toFixed(1)}/5`,
    `Melhorias feitas: ${mem.meta.improvementCount}`,
    '',
  ];

  // Source rankings
  if (mem.sourceScores.length > 0) {
    lines.push('FONTES (por qualidade):');
    const sorted = [...mem.sourceScores].sort(
      (a, b) => b.qualityScore - a.qualityScore
    );
    for (const s of sorted) {
      lines.push(
        `  ${s.qualityScore}/100 — ${s.name} (${s.totalEventsScraped} recolhidos, ${s.eventsSurvivedReview} publicados)`
      );
    }
    lines.push('');
  }

  // Curation patterns
  const pat = mem.curationPatterns;
  if (pat.preferredVenues.length > 0) {
    lines.push('ESPAÇOS PREFERIDOS:');
    for (const v of pat.preferredVenues.slice(0, 5)) {
      lines.push(`  ${v.name} (score: ${v.score})`);
    }
    lines.push('');
  }

  if (pat.rejectedPatterns.length > 0) {
    lines.push('PADRÕES REJEITADOS:');
    for (const p of pat.rejectedPatterns.slice(0, 10)) {
      lines.push(`  - ${p}`);
    }
    lines.push('');
  }

  if (pat.touristIndicators.length > 0) {
    lines.push('INDICADORES TURÍSTICOS:');
    lines.push(`  ${pat.touristIndicators.join(', ')}`);
    lines.push('');
  }

  // Recent feedback
  const recentFeedback = mem.editionFeedback.slice(-3);
  if (recentFeedback.length > 0) {
    lines.push('FEEDBACK RECENTE:');
    for (const f of recentFeedback) {
      lines.push(
        `  ${f.weekId}: ${f.rating}/5 — ${f.eventsKept.length} mantidos, ${f.eventsRemoved.length} removidos`
      );
      if (f.notes) lines.push(`    Notas: ${f.notes}`);
    }
    lines.push('');
  }

  // Post-event accuracy
  const recentReviews = mem.postEventReviews.slice(-20);
  if (recentReviews.length > 0) {
    const positive = recentReviews.filter(
      (r) => r.actualReception === 'positive'
    ).length;
    const accuracy = ((positive / recentReviews.length) * 100).toFixed(0);
    lines.push(
      `PRECISÃO: ${accuracy}% dos eventos recomendados tiveram recepção positiva (últimas ${recentReviews.length} validações)`
    );
    lines.push('');
  }

  // Prompt history
  const latestPrompt = mem.promptHistory.slice(-1)[0];
  if (latestPrompt) {
    lines.push(
      `ÚLTIMO AJUSTE DE PROMPT: v${latestPrompt.version} (${latestPrompt.weekId})`
    );
    lines.push(`  Mudança: ${latestPrompt.changes}`);
    if (latestPrompt.editionRating) {
      lines.push(`  Rating da edição: ${latestPrompt.editionRating}/5`);
    }
  }

  return lines.join('\n');
}

/**
 * Get source priority list (ordered by quality score).
 */
export function getSourcePriorities(): Array<{
  sourceId: string;
  qualityScore: number;
  priority: 'high' | 'medium' | 'low';
}> {
  const mem = loadMemory();
  return mem.sourceScores
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .map((s) => ({
      sourceId: s.sourceId,
      qualityScore: s.qualityScore,
      priority:
        s.qualityScore >= 60 ? 'high' : s.qualityScore >= 30 ? 'medium' : 'low',
    }));
}

// --- Internal helpers ---

function updatePatternsFromFeedback(
  mem: Memory,
  feedback: EditionFeedback
): void {
  const pat = mem.curationPatterns;

  // Update category preferences based on what was kept vs removed
  for (const [cat, count] of Object.entries(feedback.categoryCoverage)) {
    if (pat.preferredCategories[cat] !== undefined) {
      // Slightly boost categories that had more kept events
      const ratio = count / Math.max(feedback.eventsKept.length, 1);
      pat.preferredCategories[cat] =
        pat.preferredCategories[cat] * 0.8 + ratio * 4 * 0.2;
    }
  }

  // Learn from removal reasons
  for (const reason of Object.values(feedback.removalReasons)) {
    if (reason && !pat.rejectedPatterns.includes(reason)) {
      pat.rejectedPatterns.push(reason);
    }
  }
  // Keep last 30 rejection patterns
  if (pat.rejectedPatterns.length > 30) {
    pat.rejectedPatterns = pat.rejectedPatterns.slice(-30);
  }

  // Update average events per edition
  const allKeptCounts = mem.editionFeedback.map((f) => f.eventsKept.length);
  if (allKeptCounts.length > 0) {
    pat.avgEventsPerEdition =
      allKeptCounts.reduce((a, b) => a + b, 0) / allKeptCounts.length;
  }

  pat.lastUpdated = new Date().toISOString();
}
