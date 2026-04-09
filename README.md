# LX Cult(ure)

Curadoria semanal dos melhores eventos culturais de Lisboa.

**Website**: [[lx-cult-ure.vercel.app](https://lx-cult-ure.vercel.app/)]

## O que é

Uma newsletter semanal que reúne os melhores eventos culturais de Lisboa — das artes performativas à música ao vivo, das exposições à literatura. Curadoria feita com inteligência artificial, para lisboetas.

### Categorias

- **Artes Performativas & Cinema** — teatro, dança, cinema, ópera, circo contemporâneo
- **Artes Visuais & Exposições** — galerias, instalações, museus, fotografia
- **Literatura & Conversas** — lançamentos, leituras, poesia, festivais literários
- **Música ao Vivo & Noite** — concertos, fado, jazz, eletrónica, DJs

## Como funciona

```
Scraping (6 fontes) → Curadoria AI (Claude) → Revisão → Publicação → Newsletter
```

1. **Scraping** — Recolha automática de eventos de 6 fontes lisboetas (Time Out, Fever, Eventbrite, Visit Lisboa, Cartaz Cultural, Lisboa Live)
2. **Curadoria AI** — O Claude analisa ~1000 eventos e seleciona 15-25 dos melhores, excluindo eventos turísticos
3. **Publicação** — Edição semanal publicada no site como página estática (Astro + Vercel)
4. **Newsletter** — Envio automático via Resend para subscritores

Cada edição distingue entre **estreias da semana** (eventos novos) e eventos **ainda a decorrer** (exposições e espetáculos de longa duração).

## Desenvolvimento

### Requisitos

- Node.js 20+
- Chromium (instalado via Playwright)

### Setup

```bash
# Instalar dependências
npm install
cd pipeline && npm install
npx playwright install chromium

# Configurar variáveis de ambiente
cp .env.example .env        # editar com as chaves
cp .env pipeline/.env       # pipeline precisa da sua própria cópia
```

### Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Chave da API Anthropic (curadoria AI) |
| `RESEND_API_KEY` | Chave da API Resend (envio de emails) |
| `RESEND_SEGMENT_ID` | ID do segmento de subscritores no Resend |

### Comandos

```bash
# Website
npm run dev                  # Servidor de desenvolvimento
npm run build                # Build de produção

# Pipeline (executar a partir de pipeline/)
npm run pipeline             # Pipeline completo
npm run pipeline:scrape      # Apenas scraping
npm run pipeline:curate      # Apenas curadoria AI
npm run pipeline:publish     # Publicar edição

# Newsletter
npm run newsletter:preview   # Pré-visualizar sem enviar
npm run newsletter:send      # Enviar newsletter
```

## Stack

- **Frontend**: [Astro](https://astro.build) + [Vercel](https://vercel.com)
- **Pipeline**: TypeScript + [Playwright](https://playwright.dev) + [Cheerio](https://cheerio.js.org)
- **AI**: [Claude](https://anthropic.com) via `@anthropic-ai/sdk`
- **Email**: [React Email](https://react.email) + [Resend](https://resend.com)

## Licença

Privado — Burgundy Avenue, Lda.
