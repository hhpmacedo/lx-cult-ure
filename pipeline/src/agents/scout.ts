import { runAgent } from './agent-loop.js';
import { SCRAPE_ALL_TOOL, SCRAPE_TOOL, WRITE_FILE_TOOL, READ_FILE_TOOL } from './tools.js';
import type { PipelineConfig } from '../types.js';

const SCOUT_SYSTEM_PROMPT = `Tu és o Scout Agent da LX Cult(ure), uma newsletter semanal de eventos culturais em Lisboa.

A TUA MISSÃO: Recolher o máximo de eventos culturais possível das fontes configuradas para a semana corrente.

COMO FUNCIONAR:
1. Usa a ferramenta "scrape_all_sources" para recolher eventos de todas as fontes
2. Revê os resultados — quantos eventos por fonte, se houve erros
3. Guarda os resultados em "raw-events.json" usando "write_file"
4. Reporta um resumo: quantas fontes consultadas, quantos eventos encontrados, quais fontes falharam

FONTES DISPONÍVEIS:
- cartaz-cultural: Cartaz Cultural de Lisboa (principal)
- timeout-lisboa: Time Out Lisboa (críticas e cultura)
- visit-lisboa: Visit Lisboa (agenda oficial)
- eventbrite-lisboa: Eventbrite (eventos locais)
- lisboa-live: Lisboa Live (agenda)
- fever-lisboa: Fever (experiências)

IMPORTANTE:
- Se uma fonte falhar, continua com as outras
- Não filtres ainda — o Curator Agent fará a curadoria
- O teu trabalho é recolher TUDO, incluindo eventos que possam parecer turísticos
- Sê eficiente: usa scrape_all_sources em vez de scraping individual quando possível`;

export async function runScoutAgent(config: PipelineConfig): Promise<string> {
  const prompt = `Recolhe todos os eventos culturais em Lisboa para a semana de ${config.weekStart} a ${config.weekEnd} (${config.weekId}).

Usa todas as fontes disponíveis e guarda os resultados. Reporta um resumo dos resultados.`;

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
