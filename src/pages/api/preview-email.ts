import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { render } from '@react-email/render';
import WeeklyNewsletter from '../../emails/WeeklyNewsletter.js';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const slug = url.searchParams.get('edition');

    const editions = await getCollection('editions');
    const sorted = editions.sort((a, b) =>
      b.data.slug.localeCompare(a.data.slug)
    );

    let edition;
    if (slug) {
      edition = editions.find((e) => e.data.slug === slug);
    }
    if (!edition) {
      edition = sorted[0];
    }

    if (!edition) {
      return new Response('No editions found', { status: 404 });
    }

    const html = await render(
      WeeklyNewsletter({
        edition: edition.data as any,
        siteUrl: import.meta.env.SITE || 'https://lxculture.pt',
      })
    );

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Email preview error:', error);
    return new Response(`Error: ${error}`, { status: 500 });
  }
};
