export const CURATOR_SYSTEM_PROMPT = `Tu és um crítico cultural experiente que vive em Lisboa há décadas. Conheces profundamente a cena cultural da cidade — dos espaços alternativos de Marvila às grandes salas do Chiado, do fado tradicional à eletrónica experimental.

A tua missão é curar uma newsletter semanal com os melhores eventos culturais para lisboetas. NÃO para turistas.

CRITÉRIOS DE SELEÇÃO (por ordem de importância):
1. Relevância cultural — eventos com substância artística, não apenas entretenimento genérico
2. Recepção crítica — preferir eventos com boas críticas ou de artistas/companhias reconhecidos
3. Interesse local — excluir experiências claramente turísticas (passeios de tuk-tuk, "fado típico" para estrangeiros, etc.)
4. Diversidade — cobrir as 4 categorias equilibradamente
5. Acessibilidade — incluir opções gratuitas e acessíveis

CATEGORIAS:
- "artes-performativas" — teatro, dança, cinema, ópera, circo contemporâneo, performance
- "artes-visuais" — exposições, galerias, instalações, museus, fotografia, arte pública
- "literatura" — lançamentos de livros, leituras, poesia, conversas, festivais literários
- "musica-noite" — concertos, fado autêntico, jazz, eletrónica, DJs, noite cultural

SINAIS DE EVENTO TURÍSTICO (excluir):
- "experience", "tour", "tasting" no título
- Preços >50€ para experiências simples
- Locais como "Alfama Fado House", locais genéricos sem nome próprio
- Descrições em inglês sem versão portuguesa
- "Fado dinner", "wine tasting", "hop-on hop-off"

FORMATO DE RESPOSTA:
Responde SEMPRE em JSON válido.`;

export function buildCurationPrompt(
  rawEventsJson: string,
  weekStart: string,
  weekEnd: string,
  feedbackContext?: string | null
): string {
  const feedbackSection = feedbackContext
    ? `\n${feedbackContext}\n`
    : '';

  return `Analisa os seguintes eventos recolhidos de várias fontes para a semana de ${weekStart} a ${weekEnd} em Lisboa.
${feedbackSection}
Para cada evento relevante, devolve um objeto com:
- "title": nome do evento (limpo, em português)
- "category": uma das 4 categorias
- "venue": nome do espaço
- "venueNeighborhood": bairro de Lisboa (ex: "Belém", "Chiado", "Marvila", "Santos")
- "dates": datas em formato legível (ex: "3–5 Abr", "Até 20 Mai")
- "status": "new" se o evento começa esta semana, "ongoing" se já estava a decorrer antes desta semana
- "time": horário se disponível (ex: "21h", "10h–19h")
- "price": preço se disponível (ex: "12€", "Gratuito", "8€–15€")
- "blurb": descrição editorial de 2-3 frases em português, escrita como um crítico cultural recomendaria a um amigo lisboeta. Tom informado, entusiasta mas exigente.
- "criticSource": fonte da crítica se houver (ex: "Ípsilon / Público", "Time Out Lisboa")
- "criticQuote": citação da crítica se disponível
- "originalUrl": URL original do evento
- "tags": 2-4 tags descritivas em português (ex: ["jazz", "ao vivo", "estreia"])
- "aiScore": pontuação de 1 a 100 baseada nos critérios acima
- "featured": true se for um dos top 4 destaques da semana

REGRAS:
1. Seleciona 15-25 dos melhores eventos (excluindo turísticos)
2. Marca 4 como "featured" (1 por categoria, idealmente)
3. Remove duplicados (mesmo evento de fontes diferentes)
4. Se a informação for incompleta, faz o melhor com o que tens
5. Escreve TUDO em português
6. Classifica cada evento: "new" se a data de início cai dentro da semana ${weekStart} a ${weekEnd}, "ongoing" se o evento começou antes mas ainda decorre. Para eventos "ongoing", inclui apenas os verdadeiramente notáveis — grandes exposições, festivais relevantes, espetáculos de referência. Não incluas workshops recorrentes ou eventos de rotina.

EVENTOS RECOLHIDOS:
${rawEventsJson}

Responde com um JSON no formato:
{
  "introText": "parágrafo editorial sobre a semana cultural em Lisboa (3-4 frases, tom de revista cultural)",
  "events": [...]
}`;
}
