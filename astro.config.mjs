import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  adapter: vercel(),
  site: 'https://lxculture.pt',
  i18n: {
    defaultLocale: 'pt',
    locales: ['pt'],
  },
});
