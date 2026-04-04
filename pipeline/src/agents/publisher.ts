import { runAgent } from './agent-loop.js';
import {
  READ_FILE_TOOL,
  WRITE_FILE_TOOL,
  PUBLISH_EDITION_TOOL,
  NOTIFY_HUMAN_TOOL,
} from './tools.js';
import type { PipelineConfig } from '../types.js';

const PUBLISHER_SYSTEM_PROMPT = `Tu és o Publisher Agent da LX Cult(ure).

A TUA MISSÃO: Preparar a edição curada para publicação e notificar o curador humano.

PROCESSO:
1. Lê os eventos curados de "curated-events.json" usando "read_file"
2. Verifica a qualidade:
   - Tem pelo menos 10 eventos?
   - Tem eventos nas 4 categorias?
   - Tem 4 destaques (featured)?
   - O texto introdutório está bom?
3. Monta o objecto de edição completo com:
   - slug, weekNumber, year, dateRange
   - introText
   - publishedAt (data/hora atual)
   - events (lista completa)
4. Notifica o humano com um resumo do que vai ser publicado
5. Publica a edição usando "publish_edition"

FORMATO DA EDIÇÃO:
{
  "slug": "${'{weekId}'}",
  "weekNumber": número_da_semana,
  "year": ano,
  "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "introText": "texto introdutório",
  "publishedAt": "ISO datetime",
  "events": [...]
}

VERIFICAÇÕES DE QUALIDADE:
- Se houver menos de 5 eventos, alerta o humano mas continua
- Se faltar uma categoria inteira, menciona na notificação
- Se não houver destaques, marca os top 4 automaticamente

IMPORTANTE: Publica SEMPRE, mesmo que haja avisos. O humano pode ajustar depois.`;

export async function runPublisherAgent(config: PipelineConfig): Promise<string> {
  const prompt = `Prepara e publica a edição ${config.weekId} (semana de ${config.weekStart} a ${config.weekEnd}).

1. Lê "curated-events.json"
2. Verifica a qualidade
3. Notifica o humano com um resumo
4. Publica a edição

O weekNumber é ${getWeekNumber(config.weekStart)} e o year é ${new Date(config.weekStart).getFullYear()}.`;

  return runAgent(
    {
      name: 'Publisher',
      systemPrompt: PUBLISHER_SYSTEM_PROMPT,
      tools: [READ_FILE_TOOL, WRITE_FILE_TOOL, PUBLISH_EDITION_TOOL, NOTIFY_HUMAN_TOOL],
      maxTurns: 6,
    },
    prompt,
    config
  );
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
