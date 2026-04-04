import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

export const getStaticPaths: GetStaticPaths = async () => {
  const editions = await getCollection('editions');
  return editions.map((entry) => ({
    params: { slug: entry.data.slug },
    props: { edition: entry.data },
  }));
};

/**
 * Generate a simple SVG-based OG image for each edition.
 * Returns an SVG rendered as PNG-compatible format.
 *
 * For a production setup, use @vercel/og or satori for true PNG generation.
 * This provides a working SVG fallback that most social platforms accept.
 */
export const GET: APIRoute = async ({ props }) => {
  const ed = (props as any).edition;
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const start = new Date(ed.dateRange.start);
  const end = new Date(ed.dateRange.end);
  const dateLabel = `${start.getDate()}\u2013${end.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;

  const featured = ed.events
    .filter((e: any) => e.featured)
    .slice(0, 3)
    .map((e: any) => e.title);

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#1A1A1A"/>

  <!-- Decorative bars -->
  <rect x="80" y="80" width="120" height="8" fill="#E5195E"/>
  <rect x="210" y="80" width="60" height="8" fill="#FFD600"/>
  <rect x="280" y="80" width="30" height="8" fill="#1A1AE5"/>

  <!-- Logo -->
  <text x="80" y="160" font-family="Arial Black, Arial" font-size="64" font-weight="900">
    <tspan fill="#FFD600">LX</tspan><tspan fill="#F5F0E8"> Cult</tspan><tspan fill="#E5195E">(</tspan><tspan fill="#F5F0E8">ure</tspan><tspan fill="#E5195E">)</tspan>
  </text>

  <!-- Week label -->
  <text x="80" y="220" font-family="Arial" font-size="24" fill="#FFD600" letter-spacing="3">
    SEMANA ${ed.weekNumber} \u00B7 ${ed.year}
  </text>

  <!-- Date range -->
  <text x="80" y="300" font-family="Arial Black, Arial" font-size="56" font-weight="900" fill="#F5F0E8">
    ${dateLabel}
  </text>

  <!-- Featured events -->
  ${featured.map((title: string, i: number) => `
  <text x="80" y="${380 + i * 40}" font-family="Arial" font-size="24" fill="rgba(245,240,232,0.7)">
    \u2022 ${title.length > 50 ? title.slice(0, 47) + '...' : title}
  </text>`).join('')}

  <!-- Bottom bar -->
  <rect x="0" y="610" width="1200" height="20" fill="#E5195E"/>
  <rect x="0" y="610" width="400" height="20" fill="#1A1AE5"/>

  <!-- URL -->
  <text x="1120" y="580" font-family="Arial" font-size="18" fill="rgba(245,240,232,0.4)" text-anchor="end">
    lxculture.pt
  </text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=604800',
    },
  });
};
