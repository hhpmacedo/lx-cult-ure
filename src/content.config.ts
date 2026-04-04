import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const editions = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/editions' }),
  schema: z.object({
    slug: z.string(),
    weekNumber: z.number(),
    year: z.number(),
    dateRange: z.object({
      start: z.string(),
      end: z.string(),
    }),
    introText: z.string(),
    publishedAt: z.string(),
    events: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        category: z.enum([
          'artes-performativas',
          'artes-visuais',
          'literatura',
          'musica-noite',
        ]),
        venue: z.string(),
        venueNeighborhood: z.string(),
        dates: z.string(),
        time: z.string().optional(),
        price: z.string().optional(),
        blurb: z.string(),
        criticSource: z.string().optional(),
        criticQuote: z.string().optional(),
        originalUrl: z.string().optional(),
        imageUrl: z.string().optional(),
        tags: z.array(z.string()),
        aiScore: z.number(),
        featured: z.boolean(),
      })
    ),
  }),
});

export const collections = { editions };
