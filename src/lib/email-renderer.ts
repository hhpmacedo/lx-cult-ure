import { render } from '@react-email/render';
import WeeklyNewsletter from '../emails/WeeklyNewsletter.js';
import type { Edition } from './types.js';

/**
 * Render an edition to email-safe HTML.
 */
export async function renderEditionEmail(
  edition: Edition,
  siteUrl = 'https://lxculture.pt'
): Promise<string> {
  const html = await render(
    WeeklyNewsletter({ edition, siteUrl })
  );
  return html;
}

/**
 * Render an edition to plain text (for email clients that don't support HTML).
 */
export async function renderEditionPlainText(
  edition: Edition,
  siteUrl = 'https://lxculture.pt'
): Promise<string> {
  const text = await render(
    WeeklyNewsletter({ edition, siteUrl }),
    { plainText: true }
  );
  return text;
}
