import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Scraper health monitoring.
 *
 * Tracks scraper success/failure rates and alerts when sources degrade.
 * Stored as a simple JSON log — no database needed.
 */

export interface ScraperRun {
  sourceId: string;
  timestamp: string;
  success: boolean;
  eventCount: number;
  durationMs: number;
  error?: string;
}

export interface HealthReport {
  generated: string;
  scrapers: Array<{
    sourceId: string;
    lastRun: string;
    successRate: number; // 0-100
    avgEventCount: number;
    avgDurationMs: number;
    consecutiveFailures: number;
    status: 'healthy' | 'degraded' | 'failing' | 'unknown';
    recentRuns: ScraperRun[];
  }>;
  alerts: string[];
}

const HEALTH_DIR = resolve('memory');
const HEALTH_FILE = join(HEALTH_DIR, 'scraper-health.json');
const MAX_RUNS_PER_SCRAPER = 20;

function loadRuns(): ScraperRun[] {
  if (!existsSync(HEALTH_FILE)) return [];
  try {
    return JSON.parse(readFileSync(HEALTH_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveRuns(runs: ScraperRun[]): void {
  mkdirSync(HEALTH_DIR, { recursive: true });
  writeFileSync(HEALTH_FILE, JSON.stringify(runs, null, 2));
}

/**
 * Record the result of a scraper run.
 */
export function recordScraperRun(run: ScraperRun): void {
  const allRuns = loadRuns();
  allRuns.push(run);

  // Keep only recent runs per scraper
  const bySource = new Map<string, ScraperRun[]>();
  for (const r of allRuns) {
    const existing = bySource.get(r.sourceId) || [];
    existing.push(r);
    bySource.set(r.sourceId, existing);
  }

  const trimmed: ScraperRun[] = [];
  for (const [, runs] of bySource) {
    const sorted = runs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    trimmed.push(...sorted.slice(0, MAX_RUNS_PER_SCRAPER));
  }

  saveRuns(trimmed);
}

/**
 * Generate a health report across all scrapers.
 */
export function generateHealthReport(): HealthReport {
  const allRuns = loadRuns();
  const bySource = new Map<string, ScraperRun[]>();

  for (const r of allRuns) {
    const existing = bySource.get(r.sourceId) || [];
    existing.push(r);
    bySource.set(r.sourceId, existing);
  }

  const alerts: string[] = [];
  const scrapers: HealthReport['scrapers'] = [];

  for (const [sourceId, runs] of bySource) {
    const sorted = runs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const recent = sorted.slice(0, 10);

    const successes = recent.filter((r) => r.success);
    const successRate = recent.length > 0
      ? Math.round((successes.length / recent.length) * 100)
      : 0;

    const avgEventCount = successes.length > 0
      ? Math.round(successes.reduce((a, r) => a + r.eventCount, 0) / successes.length)
      : 0;

    const avgDurationMs = recent.length > 0
      ? Math.round(recent.reduce((a, r) => a + r.durationMs, 0) / recent.length)
      : 0;

    // Count consecutive failures from most recent
    let consecutiveFailures = 0;
    for (const r of sorted) {
      if (!r.success) consecutiveFailures++;
      else break;
    }

    // Determine status
    let status: 'healthy' | 'degraded' | 'failing' | 'unknown' = 'unknown';
    if (recent.length === 0) {
      status = 'unknown';
    } else if (consecutiveFailures >= 3) {
      status = 'failing';
      alerts.push(`${sourceId}: ${consecutiveFailures} consecutive failures — source may be down or changed`);
    } else if (successRate < 70) {
      status = 'degraded';
      alerts.push(`${sourceId}: success rate ${successRate}% — investigate scraper`);
    } else if (avgEventCount < 3 && successes.length > 2) {
      status = 'degraded';
      alerts.push(`${sourceId}: avg ${avgEventCount} events — may be returning empty results`);
    } else {
      status = 'healthy';
    }

    scrapers.push({
      sourceId,
      lastRun: sorted[0]?.timestamp || 'never',
      successRate,
      avgEventCount,
      avgDurationMs,
      consecutiveFailures,
      status,
      recentRuns: recent.slice(0, 5),
    });
  }

  return {
    generated: new Date().toISOString(),
    scrapers: scrapers.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    alerts,
  };
}

/**
 * Print a human-readable health summary.
 */
export function printHealthSummary(): void {
  const report = generateHealthReport();

  console.log('\n━━━ SCRAPER HEALTH REPORT ━━━━━━━━━━━━━━━━━━━');
  console.log(`Generated: ${report.generated}\n`);

  const statusIcon = {
    healthy: '  ',
    degraded: '  ',
    failing: '  ',
    unknown: '  ',
  };

  for (const s of report.scrapers) {
    console.log(
      `${statusIcon[s.status]} ${s.sourceId.padEnd(20)} | ` +
      `${s.successRate}% ok | ${s.avgEventCount} avg events | ` +
      `${Math.round(s.avgDurationMs / 1000)}s avg | ${s.status}`
    );
  }

  if (report.alerts.length > 0) {
    console.log('\nALERTS:');
    for (const a of report.alerts) {
      console.log(`  ! ${a}`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// CLI entry point
if (process.argv[1]?.endsWith('health.ts') || process.argv[1]?.endsWith('health.js')) {
  printHealthSummary();
}
