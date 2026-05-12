import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { runAgent } from './agent-loop.js';
import { READ_FILE_DEF, WRITE_FILE_DEF } from './tools.js';
import { getMemorySummary, loadMemory } from '../memory/store.js';
import type { PipelineConfig } from '../types.js';

const BASE_CURATOR_PROMPT = `Tu és o Curator Agent da LX Cult(ure) — um crítico cultural experiente que vive em Lisboa há décadas.

A TUA MISSÃO: Transformar eventos em bruto numa edição semanal curada, editorial e pronta para publicação.

PROCESSO:
1. Lê os eventos em bruto usando "read_file"
2. Analisa cada evento e aplica os critérios de curadoria
3. Para os melhores 15-25 eventos:
   - Categoriza em: artes-performativas, artes-visuais, literatura, musica-noite
   - Escreve um blurb editorial de 2-3 frases em português
   - Atribui uma pontuação de 1-100
   - Marca os top 4 como "featured" (idealmente 1 por categoria)
4. Escreve um texto introdutório editorial para a semana
5. Guarda o resultado em "curated-events.json" usando "write_file"

CRITÉRIOS DE CURADORIA (por importância):
1. Recepção crítica — eventos com críticas positivas de Ípsilon, Time Out, Blitz, ArteCapital são PRIORITÁRIOS
2. Relevância cultural — substância artística, não entretenimento genérico
3. Interesse local — EXCLUIR experiências turísticas
4. Diversidade — cobrir as 4 categorias equilibradamente
5. Acessibilidade — incluir opções gratuitas

COMO INCORPORAR CRÍTICAS:
- Se o evento tem matchedReviews, USA a melhor quote no campo "criticQuote"
- Indica a fonte no campo "criticSource"
- A pontuação aiScore deve ser INFLUENCIADA pelo criticScore

SINAIS DE EVENTO TURÍSTICO (excluir):
- "experience", "tour", "tasting" no título
- Preços >50€ para experiências simples
- "Fado dinner", "wine tasting", "hop-on hop-off"

FORMATO DO FICHEIRO curated-events.json:
{
  "introText": "parágrafo editorial",
  "events": [{
    "id": "evt-001", "title": "nome", "category": "artes-performativas|artes-visuais|literatura|musica-noite",
    "venue": "espaço", "venueNeighborhood": "bairro", "dates": "datas", "time": "horário",
    "price": "preço", "blurb": "descrição 2-3 frases", "criticSource": "fonte",
    "criticQuote": "citação", "originalUrl": "url", "tags": [], "aiScore": 85, "featured": false
  }]
}

IMPORTANTE: Escreve TUDO em português. Sê exigente mas justo.`;

function buildCuratorPrompt(): string {
  const evolvedPromptPath = join(resolve('.'), 'memory', 'curator-prompt.txt');
  let basePrompt = BASE_CURATOR_PROMPT;

  if (existsSync(evolvedPromptPath)) {
    const evolved = readFileSync(evolvedPromptPath, 'utf-8').trim();
    if (evolved.length > 100) {
      basePrompt = evolved;
      console.log('  [Curator] A usar prompt evoluído pelo Meta Agent');
    }
  }

  const mem = loadMemory();
  const pat = mem.curationPatterns;
  const additions: string[] = [];

  if (pat.touristIndicators.length > 6) {
    additions.push(`\nINDICADORES TURÍSTICOS APRENDIDOS:\n${pat.touristIndicators.map((i) => `- "${i}"`).join('\n')}`);
  }
  if (pat.rejectedPatterns.length > 0) {
    additions.push(`\nPADRÕES REJEITADOS:\n${pat.rejectedPatterns.slice(-10).map((p) => `- ${p}`).join('\n')}`);
  }

  const catWeights = Object.entries(pat.preferredCategories);
  const maxCat = catWeights.reduce((a, b) => (b[1] > a[1] ? b : a));
  const minCat = catWeights.reduce((a, b) => (b[1] < a[1] ? b : a));
  if (maxCat[1] > 1.2 || minCat[1] < 0.8) {
    additions.push(`\nPREFERÊNCIAS DE CATEGORIA:\n  Mais: ${maxCat[0]} (${maxCat[1].toFixed(2)})\n  Menos: ${minCat[0]} (${minCat[1].toFixed(2)})`);
  }

  if (pat.preferredVenues.length > 0) {
    const topVenues = pat.preferredVenues.sort((a, b) => b.score - a.score).slice(0, 5);
    additions.push(`\nESPAÇOS FAVORITOS:\n${topVenues.map((v) => `- ${v.name}`).join('\n')}`);
  }

  if (additions.length > 0) {
    return basePrompt + '\n\n--- APRENDIZAGENS DO SISTEMA ---' + additions.join('\n');
  }
  return basePrompt;
}

export async function runCuratorAgent(config: PipelineConfig): Promise<string> {
  const memorySummary = getMemorySummary();

  const prompt = `Cura a edição semanal para ${config.weekId} (${config.weekStart} a ${config.weekEnd}).

FICHEIROS DISPONÍVEIS (lê por esta ordem de preferência):
1. "enriched-events.json" — eventos COM críticas cruzadas (preferir este!)
2. "raw-events.json" — eventos em bruto (fallback)

Guarda o resultado em "curated-events.json". Seleciona 15-25 dos melhores eventos, escreve blurbs em português, e marca 4 destaques.

${memorySummary ? `\nCONTEXTO DA MEMÓRIA:\n${memorySummary}` : ''}`;

  return runAgent(
    {
      name: 'Curator',
      systemPrompt: buildCuratorPrompt(),
      tools: [READ_FILE_DEF, WRITE_FILE_DEF],
    },
    prompt,
    config
  );
}
