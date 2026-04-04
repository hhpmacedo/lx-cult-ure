import { runAgent } from './agent-loop.js';
import { SCRAPE_ALL_TOOL, SCRAPE_TOOL, WRITE_FILE_TOOL, READ_FILE_TOOL } from './tools.js';
import { getSourcePriorities } from '../memory/store.js';
import type { PipelineConfig } from '../types.js';

const SCOUT_SYSTEM_PROMPT = `Tu és o Scout Agent da LX Cult(ure), uma newsletter semanal de eventos culturais em Lisboa.

A TUA MISSÃO: Recolher o máximo de eventos culturais possível das fontes configuradas para a semana corrente.

COMO FUNCIONAR:
1. Verifica as prioridades das fontes (se disponíveis no contexto)
2. Usa "scrape_all_sources" para recolher eventos de todas as fontes
3. Se uma fonte de alta prioridade falhar, tenta individualmente com "scrape_source"
4. Guarda os resultados em "raw-events.json" usando "write_file"
5. Reporta um resumo: quantas fontes consultadas, quantos eventos encontrados, quais fontes falharam

FONTES DISPONÍVEIS:
- cartaz-cultural: Cartaz Cultural de Lisboa (principal)
- timeout-lisboa: Time Out Lisboa (críticas e cultura)
- visit-lisboa: Visit Lisboa (agenda oficial)
- eventbrite-lisboa: Eventbrite (eventos locais)
- lisboa-live: Lisboa Live (agenda)
- fever-lisboa: Fever (experiências)

ESTRATÉGIA BASEADA EM PRIORIDADE:
- Fontes "high" (qualidade >60): SEMPRE scrape, retry se falhar
- Fontes "medium" (qualidade 30-60): Scrape normalmente
- Fontes "low" (qualidade <30): Scrape mas não retry se falhar

IMPORTANTE:
- Se uma fonte falhar, continua com as outras
- Não filtres ainda — o Curator Agent fará a curadoria
- O teu trabalho é recolher TUDO, incluindo eventos que possam parecer turísticos`;

export async function runScoutAgent(config: PipelineConfig): Promise<string> {
  // Get source priorities from memory
  const priorities = getSourcePriorities();
  let priorityContext = '';

  if (priorities.length > 0) {
    priorityContext = `\nPRIORIDADES DAS FONTES (baseado em desempenho passado):
${priorities.map((p) => `  ${p.priority.toUpperCase()} (${p.qualityScore}/100) — ${p.sourceId}`).join('\n')}

Dá especial atenção às fontes de alta prioridade. Se falharem, tenta novamente individualmente.`;
  }

  const prompt = `Recolhe todos os eventos culturais em Lisboa para a semana de ${config.weekStart} a ${config.weekEnd} (${config.weekId}).

Usa todas as fontes disponíveis e guarda os resultados. Reporta um resumo dos resultados.${priorityContext}`;

  return runAgent(
    {
      name: 'Scout',
      systemPrompt: SCOUT_SYSTEM_PROMPT,
      tools: [SCRAPE_ALL_TOOL, SCRAPE_TOOL, WRITE_FILE_TOOL, READ_FILE_TOOL],
      maxTurns: 5,
    },
    prompt,
    config
  );
}
