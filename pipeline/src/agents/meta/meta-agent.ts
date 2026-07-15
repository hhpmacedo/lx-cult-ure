import Anthropic from '@anthropic-ai/sdk';
import { OPUS_MODEL } from '../../ai/models.js';
import { loadMemory, saveMemory, recordPromptVersion } from '../../memory/store.js';
import type { Memory } from '../../memory/types.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const META_SYSTEM_PROMPT = `Tu és o Meta Agent da LX Cult(ure) — o agente responsável pela melhoria contínua do sistema.

O teu trabalho é analisar o desempenho das edições passadas e melhorar o sistema autonomamente.

TENS ACESSO A:
1. Feedback do curador humano (ratings 1-5, notas, eventos removidos)
2. Scores de qualidade das fontes
3. Histórico de prompts e seus resultados
4. Validações pós-evento (previsão vs realidade)
5. Padrões de curadoria aprendidos

PODES MELHORAR:
1. O prompt do Curator Agent (ajustar critérios, tom, filtros)
2. As prioridades das fontes (quais scrape primeiro, quais descartar)
3. Os indicadores de eventos turísticos (adicionar novos padrões)
4. Os pesos das categorias (se uma categoria tem consistentemente melhores eventos)
5. A lista de padrões rejeitados

REGRAS:
- Faz mudanças incrementais, não revoluções
- Cada mudança deve ter uma razão clara baseada em dados
- Mantém um registo de todas as mudanças
- Se o rating médio é ≥4, faz apenas ajustes finos
- Se o rating é <3, faz mudanças mais significativas
- Nunca removes completamente uma fonte — reduz a prioridade em vez disso`;

interface ImprovementResult {
  promptChanged: boolean;
  newPromptVersion?: number;
  sourceChanges: string[];
  patternChanges: string[];
  summary: string;
}

/**
 * Run the Meta Agent to analyze performance and improve the system.
 * Call this after recording edition feedback.
 */
export async function runMetaAgent(): Promise<ImprovementResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const client = new Anthropic({ apiKey });
  const mem = loadMemory();

  // Don't run if we have fewer than 2 editions of data
  if (mem.editionFeedback.length < 2) {
    return {
      promptChanged: false,
      sourceChanges: [],
      patternChanges: [],
      summary: 'Poucas edições para análise. O Meta Agent precisa de pelo menos 2 edições.',
    };
  }

  console.log('\n🧠 [Meta Agent] A analisar desempenho e propor melhorias...');

  // Build analysis context
  const analysisContext = buildAnalysisContext(mem);

  // Get current curator prompt
  const curatorPath = join(resolve('.'), 'src', 'agents', 'curator.ts');
  const currentPrompt = existsSync(curatorPath)
    ? extractPromptFromFile(curatorPath)
    : 'Prompt não encontrado';

  const response = await client.messages.create({
    model: OPUS_MODEL,
    max_tokens: 8000,
    system: META_SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    messages: [
      {
        role: 'user',
        content: `Analisa o desempenho do sistema e propõe melhorias.

${analysisContext}

PROMPT ATUAL DO CURATOR:
${currentPrompt}

Responde em JSON:
{
  "analysis": "análise do desempenho (2-3 parágrafos)",
  "promptImprovements": "novo texto do prompt do curator SE precisar de mudanças (ou null se não)",
  "promptChangeReason": "razão para a mudança (ou null)",
  "newTouristIndicators": ["novos indicadores turísticos aprendidos"],
  "newRejectedPatterns": ["novos padrões a rejeitar"],
  "sourceRecommendations": [
    {"sourceId": "id", "action": "boost|maintain|deprioritize", "reason": "razão"}
  ],
  "categoryWeightAdjustments": {"categoria": peso_novo},
  "overallAssessment": "resumo em 1 frase"
}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  if (!textBlock) {
    return {
      promptChanged: false,
      sourceChanges: [],
      patternChanges: [],
      summary: 'Meta Agent não produziu resposta',
    };
  }

  // Parse response
  let jsonStr = textBlock.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];

  let improvements: {
    analysis: string;
    promptImprovements: string | null;
    promptChangeReason: string | null;
    newTouristIndicators: string[];
    newRejectedPatterns: string[];
    sourceRecommendations: Array<{
      sourceId: string;
      action: string;
      reason: string;
    }>;
    categoryWeightAdjustments: Record<string, number>;
    overallAssessment: string;
  };

  try {
    improvements = JSON.parse(jsonStr.trim());
  } catch {
    console.error('[Meta Agent] Falha ao interpretar resposta');
    return {
      promptChanged: false,
      sourceChanges: [],
      patternChanges: [],
      summary: 'Erro ao processar resposta do Meta Agent',
    };
  }

  console.log(`\n📊 [Meta Agent] Análise: ${improvements.analysis?.slice(0, 150)}...`);

  const result: ImprovementResult = {
    promptChanged: false,
    sourceChanges: [],
    patternChanges: [],
    summary: improvements.overallAssessment || '',
  };

  // Apply prompt improvements
  if (improvements.promptImprovements) {
    const version = mem.promptHistory.length + 1;
    recordPromptVersion({
      version,
      weekId: mem.editionFeedback[mem.editionFeedback.length - 1]?.weekId || 'unknown',
      prompt: improvements.promptImprovements,
      changes: improvements.promptChangeReason || 'Ajuste automático',
      timestamp: new Date().toISOString(),
    });

    // Write the evolved prompt to a file the Curator reads
    const evolvedPromptPath = join(resolve('.'), 'memory', 'curator-prompt.txt');
    writeFileSync(evolvedPromptPath, improvements.promptImprovements, 'utf-8');

    result.promptChanged = true;
    result.newPromptVersion = version;
    console.log(`  ✏️  Prompt atualizado para v${version}: ${improvements.promptChangeReason}`);
  }

  // Apply tourist indicators
  if (improvements.newTouristIndicators?.length > 0) {
    const pat = mem.curationPatterns;
    for (const indicator of improvements.newTouristIndicators) {
      if (!pat.touristIndicators.includes(indicator)) {
        pat.touristIndicators.push(indicator);
        result.patternChanges.push(`+tourist: "${indicator}"`);
      }
    }
    console.log(`  🚫 Novos indicadores turísticos: ${improvements.newTouristIndicators.join(', ')}`);
  }

  // Apply rejected patterns
  if (improvements.newRejectedPatterns?.length > 0) {
    const pat = mem.curationPatterns;
    for (const pattern of improvements.newRejectedPatterns) {
      if (!pat.rejectedPatterns.includes(pattern)) {
        pat.rejectedPatterns.push(pattern);
        result.patternChanges.push(`+reject: "${pattern}"`);
      }
    }
  }

  // Apply category weight adjustments
  if (improvements.categoryWeightAdjustments) {
    for (const [cat, weight] of Object.entries(improvements.categoryWeightAdjustments)) {
      if (mem.curationPatterns.preferredCategories[cat] !== undefined) {
        mem.curationPatterns.preferredCategories[cat] = weight;
      }
    }
  }

  // Apply source recommendations
  if (improvements.sourceRecommendations?.length > 0) {
    for (const rec of improvements.sourceRecommendations) {
      const source = mem.sourceScores.find((s) => s.sourceId === rec.sourceId);
      if (source) {
        if (rec.action === 'boost') {
          source.qualityScore = Math.min(100, source.qualityScore + 10);
        } else if (rec.action === 'deprioritize') {
          source.qualityScore = Math.max(5, source.qualityScore - 15);
        }
        result.sourceChanges.push(`${rec.sourceId}: ${rec.action} (${rec.reason})`);
      }
    }
    console.log(`  📡 Fontes ajustadas: ${result.sourceChanges.join(', ')}`);
  }

  mem.curationPatterns.lastUpdated = new Date().toISOString();
  saveMemory(mem);

  console.log(`\n✓ [Meta Agent] ${result.summary}`);
  return result;
}

// --- Helpers ---

function buildAnalysisContext(mem: Memory): string {
  const lines: string[] = [];

  // Edition history
  lines.push('HISTÓRICO DE EDIÇÕES:');
  for (const f of mem.editionFeedback.slice(-6)) {
    lines.push(
      `  ${f.weekId}: rating=${f.rating}/5, mantidos=${f.eventsKept.length}, removidos=${f.eventsRemoved.length}`
    );
    if (f.notes) lines.push(`    Notas: ${f.notes}`);
    if (Object.keys(f.removalReasons).length > 0) {
      lines.push(`    Razões de remoção: ${Object.values(f.removalReasons).join('; ')}`);
    }
  }
  lines.push('');

  // Source performance
  lines.push('DESEMPENHO DAS FONTES:');
  for (const s of mem.sourceScores) {
    const recent = s.weeklyScores.slice(-4);
    const avgSurvival =
      recent.length > 0
        ? recent.reduce((a, w) => a + w.survivedReview, 0) / recent.length
        : 0;
    lines.push(
      `  ${s.sourceId}: qualidade=${s.qualityScore}/100, média sobrevivência=${avgSurvival.toFixed(1)}/edição`
    );
  }
  lines.push('');

  // Post-event accuracy
  if (mem.postEventReviews.length > 0) {
    const recent = mem.postEventReviews.slice(-20);
    const positive = recent.filter((r) => r.actualReception === 'positive').length;
    const negative = recent.filter((r) => r.actualReception === 'negative').length;
    lines.push(`VALIDAÇÃO PÓS-EVENTO (últimas ${recent.length}):
  Positivas: ${positive}, Negativas: ${negative}, Precisão: ${((positive / recent.length) * 100).toFixed(0)}%`);

    // Show misses (high predicted score but negative reception)
    const misses = recent.filter(
      (r) => r.predictedScore > 70 && r.actualReception === 'negative'
    );
    if (misses.length > 0) {
      lines.push('  Erros de previsão (score alto, recepção negativa):');
      for (const m of misses) {
        lines.push(
          `    "${m.eventTitle}" — score ${m.predictedScore}, recepção ${m.actualReception}`
        );
      }
    }
    lines.push('');
  }

  // Current patterns
  lines.push('PADRÕES ATUAIS:');
  lines.push(`  Indicadores turísticos: ${mem.curationPatterns.touristIndicators.join(', ')}`);
  lines.push(`  Padrões rejeitados: ${mem.curationPatterns.rejectedPatterns.slice(-5).join('; ')}`);
  lines.push(`  Média eventos/edição: ${mem.curationPatterns.avgEventsPerEdition.toFixed(1)}`);
  lines.push('');

  // Rating trend
  const ratings = mem.editionFeedback.map((f) => f.rating);
  if (ratings.length >= 3) {
    const recent3 = ratings.slice(-3);
    const older3 = ratings.slice(-6, -3);
    const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
    const olderAvg =
      older3.length > 0
        ? older3.reduce((a, b) => a + b, 0) / older3.length
        : recentAvg;
    const trend = recentAvg > olderAvg ? '📈 a melhorar' : recentAvg < olderAvg ? '📉 a piorar' : '➡️ estável';
    lines.push(`TENDÊNCIA: ${trend} (média recente: ${recentAvg.toFixed(1)}, anterior: ${olderAvg.toFixed(1)})`);
  }

  return lines.join('\n');
}

function extractPromptFromFile(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  // Try to extract the prompt constant
  const match = content.match(
    /const CURATOR_SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/
  );
  return match ? match[1].trim() : content.slice(0, 2000);
}
