import { runAgent } from './agent-loop.js';
import {
  createScrapeAllTool,
  createScrapeTool,
  createScrapeReviewsTool,
  createMatchReviewsTool,
  createWriteFileTool,
  createReadFileTool,
} from './tools.js';
import { getSourcePriorities } from '../memory/store.js';
import type { PipelineConfig } from '../types.js';

const SCOUT_SYSTEM_PROMPT = `Tu és o Scout Agent da LX Cult(ure), uma newsletter semanal de eventos culturais em Lisboa.

A TUA MISSÃO: Recolher eventos culturais E críticas/reviews das fontes configuradas.

PROCESSO (segue esta ordem):
1. Usa "scrape_all_sources" para recolher eventos de todas as fontes
2. Se uma fonte de alta prioridade falhar, tenta individualmente com "scrape_source"
3. Usa "scrape_reviews" para recolher críticas de Ípsilon/Público, Time Out, Blitz, ArteCapital
4. Usa "match_reviews_to_events" para cruzar críticas com eventos (o sistema usa IA para matching)
5. Reporta um resumo completo

FONTES DE EVENTOS:
- cartaz-cultural, timeout-lisboa, visit-lisboa, eventbrite-lisboa, lisboa-live, fever-lisboa

FONTES DE CRÍTICAS:
- Ípsilon / Público (crítica cultural principal de Portugal)
- Time Out Lisboa (picks editoriais e ratings)
- Blitz (música e concertos)
- ArteCapital (artes visuais e exposições)

ESTRATÉGIA DE PRIORIDADE:
- Fontes "high" (qualidade >60): SEMPRE scrape, retry se falhar
- Fontes "medium" (qualidade 30-60): Scrape normalmente
- Fontes "low" (qualidade <30): Scrape mas não retry se falhar

IMPORTANTE:
- As críticas são ESSENCIAIS — são o que diferencia a LX Cult(ure) de um simples agregador
- Mesmo que nenhuma crítica faça match direto, o Curator usa o contexto crítico
- Scrape reviews SEMPRE, mesmo que os event scrapers tenham falhado parcialmente
- O ficheiro "enriched-events.json" é o output final que o Curator vai usar`;

export async function runScoutAgent(config: PipelineConfig): Promise<string> {
  const priorities = getSourcePriorities();
  let priorityContext = '';

  if (priorities.length > 0) {
    priorityContext = `\nPRIORIDADES DAS FONTES (baseado em desempenho passado):
${priorities.map((p) => `  ${p.priority.toUpperCase()} (${p.qualityScore}/100) — ${p.sourceId}`).join('\n')}

Dá especial atenção às fontes de alta prioridade. Se falharem, tenta novamente individualmente.`;
  }

  const prompt = `Recolhe todos os eventos culturais E críticas/reviews em Lisboa para a semana de ${config.weekStart} a ${config.weekEnd} (${config.weekId}).

Processo:
1. Scrape todos os eventos (scrape_all_sources)
2. Scrape todas as críticas (scrape_reviews)
3. Cruza críticas com eventos (match_reviews_to_events)
4. Reporta resumo com: eventos encontrados, críticas encontradas, matches feitos${priorityContext}`;

  return runAgent(
    {
      name: 'Scout',
      systemPrompt: SCOUT_SYSTEM_PROMPT,
      tools: [
        createScrapeAllTool(config),
        createScrapeTool(config),
        createScrapeReviewsTool(config),
        createMatchReviewsTool(config),
        createWriteFileTool(config),
        createReadFileTool(config),
      ],
      maxTurns: 8,
    },
    prompt
  );
}
