import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { runAgent } from './agent-loop.js';
import { READ_FILE_TOOL, WRITE_FILE_TOOL } from './tools.js';
import { getMemorySummary, loadMemory } from '../memory/store.js';
import type { PipelineConfig } from '../types.js';

const BASE_CURATOR_PROMPT = `Tu és o Curator Agent da LX Cult(ure) — um crítico cultural experiente que vive em Lisboa há décadas.

A TUA MISSÃO: Transformar eventos em bruto numa edição semanal curada, editorial e pronta para publicação.

PROCESSO:
1. Lê os eventos em bruto de "raw-events.json" usando "read_file"
2. Analisa cada evento e aplica os critérios de curadoria
3. Para os melhores 15-25 eventos:
   - Categoriza em: artes-performativas, artes-visuais, literatura, musica-noite
   - Escreve um blurb editorial de 2-3 frases em português (tom de revista cultural)
   - Atribui uma pontuação de 1-100
   - Marca os top 4 como "featured" (idealmente 1 por categoria)
4. Escreve um texto introdutório editorial para a semana
5. Guarda o resultado em "curated-events.json" usando "write_file"

CRITÉRIOS DE CURADORIA (por importância):
1. Recepção crítica — eventos com críticas positivas de Ípsilon, Time Out, Blitz, ArteCapital são PRIORITÁRIOS. Se um evento tem criticScore ≥80 ou matchedReviews com sentiment "positive", deve ser incluído quase sempre.
2. Relevância cultural — substância artística, não entretenimento genérico
3. Interesse local — EXCLUIR experiências turísticas (tuk-tuk, "fado para estrangeiros", etc.)
4. Diversidade — cobrir as 4 categorias equilibradamente
5. Acessibilidade — incluir opções gratuitas

COMO INCORPORAR CRÍTICAS:
- Se o evento tem matchedReviews, USA a melhor quote no campo "criticQuote"
- Indica a fonte no campo "criticSource" (ex: "Ípsilon / Público", "Time Out Lisboa")
- A pontuação aiScore deve ser INFLUENCIADA pelo criticScore: um evento com criticScore 90 deve ter aiScore ≥85
- No blurb, faz referência natural à recepção crítica quando relevante (ex: "Os críticos do Ípsilon consideram-na a exposição do ano")

SINAIS DE EVENTO TURÍSTICO (excluir):
- "experience", "tour", "tasting" no título
- Preços >50€ para experiências simples
- Locais genéricos sem nome próprio
- "Fado dinner", "wine tasting", "hop-on hop-off"

FORMATO DO FICHEIRO curated-events.json:
{
  "introText": "parágrafo editorial (3-4 frases, tom de revista cultural)",
  "events": [
    {
      "id": "evt-001",
      "title": "nome do evento",
      "category": "artes-performativas|artes-visuais|literatura|musica-noite",
      "venue": "nome do espaço",
      "venueNeighborhood": "bairro",
      "dates": "datas legíveis",
      "time": "horário",
      "price": "preço",
      "blurb": "descrição editorial 2-3 frases",
      "criticSource": "fonte da crítica",
      "criticQuote": "citação da crítica",
      "originalUrl": "url original",
      "tags": ["tag1", "tag2"],
      "aiScore": 85,
      "featured": false
    }
  ]
}

IMPORTANTE:
- Escreve TUDO em português
- Sê exigente mas justo — queremos qualidade, não quantidade
- O tom é informado, entusiasta mas criterioso — como um amigo culto que recomenda`;

/**
 * Build the curator's system prompt, incorporating learned patterns
 * and any evolved prompt from the Meta Agent.
 */
function buildCuratorPrompt(): string {
  // Check if Meta Agent has evolved the prompt
  const evolvedPromptPath = join(resolve('.'), 'memory', 'curator-prompt.txt');
  let basePrompt = BASE_CURATOR_PROMPT;

  if (existsSync(evolvedPromptPath)) {
    const evolved = readFileSync(evolvedPromptPath, 'utf-8').trim();
    if (evolved.length > 100) {
      basePrompt = evolved;
      console.log('  📝 [Curator] A usar prompt evoluído pelo Meta Agent');
    }
  }

  // Append learned patterns from memory
  const mem = loadMemory();
  const pat = mem.curationPatterns;
  const additions: string[] = [];

  // Add learned tourist indicators
  if (pat.touristIndicators.length > 6) {
    additions.push(
      `\nINDICADORES TURÍSTICOS APRENDIDOS (excluir também):\n${pat.touristIndicators.map((i) => `- "${i}"`).join('\n')}`
    );
  }

  // Add learned rejection patterns
  if (pat.rejectedPatterns.length > 0) {
    additions.push(
      `\nPADRÕES REJEITADOS PELO CURADOR HUMANO:\n${pat.rejectedPatterns.slice(-10).map((p) => `- ${p}`).join('\n')}`
    );
  }

  // Add category weight hints
  const catWeights = Object.entries(pat.preferredCategories);
  const maxCat = catWeights.reduce((a, b) => (b[1] > a[1] ? b : a));
  const minCat = catWeights.reduce((a, b) => (b[1] < a[1] ? b : a));
  if (maxCat[1] > 1.2 || minCat[1] < 0.8) {
    additions.push(
      `\nPREFERÊNCIAS DE CATEGORIA (baseado em feedback):
  Mais eventos de: ${maxCat[0]} (peso: ${maxCat[1].toFixed(2)})
  Menos eventos de: ${minCat[0]} (peso: ${minCat[1].toFixed(2)})`
    );
  }

  // Add preferred venues if known
  if (pat.preferredVenues.length > 0) {
    const topVenues = pat.preferredVenues
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    additions.push(
      `\nESPAÇOS FAVORITOS DO CURADOR:\n${topVenues.map((v) => `- ${v.name}`).join('\n')}`
    );
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
2. "raw-events.json" — eventos em bruto (fallback se enriched não existir)

Os eventos enriquecidos têm campos extra:
- matchedReviews: array de críticas correspondentes (source, sentiment, rating, quote)
- criticConsensus: resumo da recepção crítica ("Unanimemente positivo", etc.)
- criticScore: pontuação 0-100 baseada nas críticas

COMO USAR AS CRÍTICAS:
- Eventos com criticScore ≥80: candidatos fortes a destaque
- Eventos com criticScore 60-80: boa qualidade, incluir se possível
- Eventos com criticScore <60 ou sem críticas: avaliar pelos outros critérios
- USA as quotes das críticas nos campos "criticQuote" e "criticSource"
- O criticConsensus pode informar o blurb editorial

Guarda o resultado em "curated-events.json". Seleciona 15-25 dos melhores eventos, escreve blurbs em português, e marca 4 destaques.

${memorySummary ? `\nCONTEXTO DA MEMÓRIA DO SISTEMA:\n${memorySummary}` : ''}`;

  return runAgent(
    {
      name: 'Curator',
      systemPrompt: buildCuratorPrompt(),
      tools: [READ_FILE_TOOL, WRITE_FILE_TOOL],
      maxTurns: 8,
    },
    prompt,
    config
  );
}
