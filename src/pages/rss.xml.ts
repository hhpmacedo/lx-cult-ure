import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ site }) => {
  const editions = await getCollection('editions');
  const sorted = editions.sort((a, b) => b.data.slug.localeCompare(a.data.slug));

  const siteUrl = site?.toString() || 'https://lxculture.pt';

  const items = sorted.slice(0, 52).map((entry) => {
    const ed = entry.data;
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const start = new Date(ed.dateRange.start);
    const end = new Date(ed.dateRange.end);
    const dateLabel = `${start.getDate()}–${end.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;
    const pubDate = new Date(ed.publishedAt).toUTCString();

    const eventsSummary = ed.events
      .filter((e) => e.featured)
      .map((e) => `• ${e.title} — ${e.venue} (${e.venueNeighborhood})`)
      .join('\n');

    const description = `${ed.introText}\n\nDestaques:\n${eventsSummary}\n\n+ ${ed.events.length - ed.events.filter((e) => e.featured).length} outros eventos`;

    return `    <item>
      <title>Semana ${ed.weekNumber}: ${dateLabel}</title>
      <link>${siteUrl}/edicao/${ed.slug}</link>
      <guid isPermaLink="true">${siteUrl}/edicao/${ed.slug}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${description}]]></description>
    </item>`;
  });

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>LX Cult(ure) — Eventos Culturais em Lisboa</title>
    <description>Newsletter semanal com os melhores eventos culturais em Lisboa, curada por críticos.</description>
    <link>${siteUrl}</link>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
    <language>pt</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>LX Cult(ure)</generator>
${items.join('\n')}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
