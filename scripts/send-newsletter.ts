import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import WeeklyNewsletter from '../src/emails/WeeklyNewsletter.js';

// Load .env from project root
const envPath = join(resolve('.'), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] = rest.join('=').trim();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const editionArg = args.find((a) => a.startsWith('--edition='));
  const testEmail = args.find((a) => a.startsWith('--to='))?.split('=')[1];

  // Find the edition to send
  const editionsDir = join(resolve('.'), 'src', 'content', 'editions');
  let editionSlug: string;

  if (editionArg) {
    editionSlug = editionArg.split('=')[1];
  } else {
    // Use the latest edition
    const files = readdirSync(editionsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) {
      console.error('Nenhuma edição encontrada.');
      process.exit(1);
    }
    editionSlug = files[0].replace('.json', '');
  }

  const editionPath = join(editionsDir, `${editionSlug}.json`);
  if (!existsSync(editionPath)) {
    console.error(`Edição não encontrada: ${editionPath}`);
    process.exit(1);
  }

  const edition = JSON.parse(readFileSync(editionPath, 'utf-8'));

  console.log(`\n📧 LX Cult(ure) — Enviar Newsletter`);
  console.log(`   Edição: ${editionSlug}`);
  console.log(`   Eventos: ${edition.events?.length || 0}`);
  console.log(`   Modo: ${dryRun ? 'DRY RUN' : 'PRODUÇÃO'}`);
  console.log('');

  // Render email HTML
  console.log('A renderizar email...');
  const html = await render(
    WeeklyNewsletter({ edition, siteUrl: 'https://lxculture.pt' })
  );
  const text = await render(
    WeeklyNewsletter({ edition, siteUrl: 'https://lxculture.pt' }),
    { plainText: true }
  );

  console.log(`  HTML: ${html.length} caracteres`);
  console.log(`  Texto: ${text.length} caracteres`);

  if (dryRun) {
    // Save HTML to file for preview
    const previewPath = join(resolve('.'), 'dist', 'newsletter-preview.html');
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync(join(resolve('.'), 'dist'), { recursive: true });
    writeFileSync(previewPath, html);
    console.log(`\n✓ Preview guardado em: ${previewPath}`);
    console.log('  Abre no browser para ver o resultado.');

    if (testEmail) {
      // Send to test email
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error('\nRESEND_API_KEY não configurada. Adicione ao .env');
        process.exit(1);
      }

      const resend = new Resend(apiKey);
      console.log(`\nA enviar para ${testEmail}...`);

      const result = await resend.emails.send({
        from: 'LX Cult(ure) <newsletter@lxculture.pt>',
        to: testEmail,
        subject: `[TEST] LX Cult(ure) — Semana ${edition.weekNumber} · ${editionSlug}`,
        html,
        text,
      });

      console.log(`✓ Email de teste enviado: ${JSON.stringify(result)}`);
    }

    return;
  }

  // Production send
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey) {
    console.error('RESEND_API_KEY não configurada.');
    process.exit(1);
  }

  if (!audienceId) {
    console.error('RESEND_AUDIENCE_ID não configurado.');
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const subject = `LX Cult(ure) — Semana ${edition.weekNumber} · ${formatDateRange(edition.dateRange.start, edition.dateRange.end)}`;

  console.log(`\nA enviar para audiência ${audienceId}...`);
  console.log(`Assunto: ${subject}`);

  const result = await resend.batch.send([
    {
      from: 'LX Cult(ure) <newsletter@lxculture.pt>',
      to: audienceId,
      subject,
      html,
      text,
    },
  ]);

  console.log(`\n✓ Newsletter enviada!`);
  console.log(`  Resultado: ${JSON.stringify(result)}`);
}

function formatDateRange(start: string, end: string): string {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const s = new Date(start);
  const e = new Date(end);
  return `${s.getDate()}–${e.getDate()} ${months[s.getMonth()]}`;
}

main().catch((error) => {
  console.error('Erro:', error);
  process.exit(1);
});
