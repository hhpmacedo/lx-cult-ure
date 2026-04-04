import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
  Row,
  Column,
  Heading,
  Preview,
  Font,
} from '@react-email/components';

// --- Types (mirrored from lib/types.ts for email isolation) ---

type Category =
  | 'artes-performativas'
  | 'artes-visuais'
  | 'literatura'
  | 'musica-noite';

interface CuratedEvent {
  id: string;
  title: string;
  category: Category;
  venue: string;
  venueNeighborhood: string;
  dates: string;
  time?: string;
  price?: string;
  blurb: string;
  criticSource?: string;
  criticQuote?: string;
  originalUrl?: string;
  tags: string[];
  aiScore: number;
  featured: boolean;
}

interface Edition {
  slug: string;
  weekNumber: number;
  year: number;
  dateRange: { start: string; end: string };
  introText: string;
  publishedAt: string;
  events: CuratedEvent[];
}

// --- Design tokens ---

const colors = {
  fundo: '#F5F0E8',
  texto: '#1A1A1A',
  primaria: '#1A1AE5',
  magenta: '#E5195E',
  amarelo: '#FFD600',
  violeta: '#7B2FBE',
  branco: '#FFFFFF',
  cinza: '#888888',
};

const categoryColors: Record<Category, string> = {
  'artes-performativas': colors.magenta,
  'artes-visuais': colors.primaria,
  'literatura': colors.amarelo,
  'musica-noite': colors.violeta,
};

const categoryLabels: Record<Category, string> = {
  'artes-performativas': 'ARTES PERFORMATIVAS & CINEMA',
  'artes-visuais': 'ARTES VISUAIS & EXPOSIÇÕES',
  'literatura': 'LITERATURA & CONVERSAS',
  'musica-noite': 'MÚSICA AO VIVO & NOITE',
};

const categoryOrder: Category[] = [
  'artes-performativas',
  'artes-visuais',
  'literatura',
  'musica-noite',
];

// --- Helper ---

function formatDateRange(start: string, end: string): string {
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const s = new Date(start);
  const e = new Date(end);
  return `${s.getDate()}–${e.getDate()} ${months[s.getMonth()]} ${s.getFullYear()}`;
}

// --- Components ---

interface WeeklyNewsletterProps {
  edition: Edition;
  siteUrl?: string;
}

export default function WeeklyNewsletter({
  edition,
  siteUrl = 'https://lxculture.pt',
}: WeeklyNewsletterProps) {
  const dateRange = formatDateRange(edition.dateRange.start, edition.dateRange.end);

  return (
    <Html lang="pt">
      <Head>
        <Font
          fontFamily="Arial"
          fallbackFontFamily="Helvetica"
        />
      </Head>
      <Preview>LX Cult(ure) — Semana {edition.weekNumber}: {dateRange}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Row>
              <Column>
                <Text style={styles.logoLx}>LX</Text>
              </Column>
              <Column>
                <Text style={styles.logoCulture}>Cult(ure)</Text>
              </Column>
            </Row>
          </Section>

          {/* Edition Header */}
          <Section style={styles.editionHeader}>
            <Text style={styles.weekLabel}>
              SEMANA {edition.weekNumber} · {edition.year}
            </Text>
            <Heading as="h1" style={styles.dateTitle}>
              {dateRange}
            </Heading>
            {/* Decorative bars */}
            <Row>
              <Column style={{ width: '64px' }}>
                <Hr style={{ borderTop: `4px solid ${colors.magenta}`, margin: '0' }} />
              </Column>
              <Column style={{ width: '32px', paddingLeft: '6px' }}>
                <Hr style={{ borderTop: `4px solid ${colors.amarelo}`, margin: '0' }} />
              </Column>
              <Column style={{ width: '16px', paddingLeft: '6px' }}>
                <Hr style={{ borderTop: `4px solid ${colors.primaria}`, margin: '0' }} />
              </Column>
              <Column />
            </Row>
            <Text style={styles.introText}>{edition.introText}</Text>
          </Section>

          {/* Events by category */}
          {categoryOrder.map((cat) => {
            const events = edition.events
              .filter((e) => e.category === cat)
              .sort((a, b) => {
                if (a.featured && !b.featured) return -1;
                if (!a.featured && b.featured) return 1;
                return b.aiScore - a.aiScore;
              });

            if (events.length === 0) return null;

            return (
              <Section key={cat} style={{ marginBottom: '32px' }}>
                {/* Category header */}
                <Row style={{ marginBottom: '16px' }}>
                  <Column style={{ width: '20px' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: categoryColors[cat],
                      }}
                    />
                  </Column>
                  <Column style={{ paddingLeft: '12px' }}>
                    <Heading as="h2" style={styles.categoryTitle}>
                      {categoryLabels[cat]}
                    </Heading>
                  </Column>
                </Row>

                {/* Event cards */}
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    catColor={categoryColors[cat]}
                    siteUrl={siteUrl}
                  />
                ))}
              </Section>
            );
          })}

          {/* Subscribe CTA */}
          <Section style={styles.ctaSection}>
            <Heading as="h2" style={styles.ctaTitle}>
              Receba todas as semanas
            </Heading>
            <Text style={styles.ctaText}>
              Partilhe esta newsletter com quem vive a cultura de Lisboa.
            </Text>
            <Link
              href={`${siteUrl}#subscrever`}
              style={styles.ctaButton}
            >
              SUBSCREVER
            </Link>
          </Section>

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              <Link href={siteUrl} style={styles.footerLink}>LX Cult(ure)</Link>
              {' — '}
              Os melhores eventos culturais de Lisboa, todas as semanas.
            </Text>
            <Text style={styles.footerText}>
              <Link href={`${siteUrl}/arquivo`} style={styles.footerLink}>
                Arquivo
              </Link>
              {' · '}
              <Link href={`${siteUrl}/edicao/${edition.slug}`} style={styles.footerLink}>
                Ver no browser
              </Link>
              {' · '}
              <Link href={`${siteUrl}/rss.xml`} style={styles.footerLink}>
                RSS
              </Link>
            </Text>
            <Hr style={{ borderTop: '1px solid #ddd', margin: '16px 0' }} />
            <Text style={styles.footerSmall}>
              Lisboa, Portugal · © {edition.year} LX Cult(ure)
              {' · '}
              <Link href={`${siteUrl}/privacidade`} style={{ ...styles.footerLink, fontSize: '11px', color: '#aaa' }}>
                Privacidade
              </Link>
            </Text>
            <Text style={{ ...styles.footerSmall, marginTop: '8px' }}>
              {'{{RESEND_UNSUBSCRIBE_URL}}' !== '' ? (
                <Link
                  href="{{RESEND_UNSUBSCRIBE_URL}}"
                  style={{ ...styles.footerLink, fontSize: '11px', color: '#aaa' }}
                >
                  Cancelar subscrição
                </Link>
              ) : (
                <Link
                  href={`mailto:ola@lxculture.pt?subject=Cancelar%20subscrição`}
                  style={{ ...styles.footerLink, fontSize: '11px', color: '#aaa' }}
                >
                  Cancelar subscrição
                </Link>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// --- Event Card Component ---

function EventCard({
  event,
  catColor,
  siteUrl,
}: {
  event: CuratedEvent;
  catColor: string;
  siteUrl: string;
}) {
  const isFeatured = event.featured;

  return (
    <Section
      style={{
        ...styles.eventCard,
        borderLeftColor: catColor,
        borderLeftWidth: isFeatured ? '6px' : '4px',
        backgroundColor: isFeatured ? colors.texto : colors.branco,
        color: isFeatured ? colors.fundo : colors.texto,
        marginBottom: '12px',
      }}
    >
      {isFeatured && (
        <Text style={styles.featuredBadge}>DESTAQUE</Text>
      )}

      <Heading as="h3" style={{
        ...styles.eventTitle,
        color: isFeatured ? colors.branco : colors.texto,
      }}>
        {event.originalUrl ? (
          <Link href={event.originalUrl} style={{
            color: isFeatured ? colors.branco : colors.texto,
            textDecoration: 'none',
          }}>
            {event.title}
          </Link>
        ) : (
          event.title
        )}
      </Heading>

      <Text style={{
        ...styles.eventMeta,
        color: isFeatured ? 'rgba(255,255,255,0.7)' : colors.cinza,
      }}>
        {event.venue} · {event.venueNeighborhood}
      </Text>

      <Text style={{
        ...styles.eventDetails,
        color: isFeatured ? 'rgba(255,255,255,0.7)' : colors.cinza,
      }}>
        {event.dates}
        {event.time ? ` · ${event.time}` : ''}
        {event.price ? ` · ` : ''}
        {event.price && (
          <span style={{ color: isFeatured ? colors.amarelo : colors.primaria, fontWeight: 600 }}>
            {event.price}
          </span>
        )}
      </Text>

      <Text style={{
        ...styles.eventBlurb,
        color: isFeatured ? 'rgba(255,255,255,0.9)' : colors.texto,
      }}>
        {event.blurb}
      </Text>

      {event.criticQuote && (
        <Text style={{
          ...styles.eventQuote,
          borderLeftColor: isFeatured ? 'rgba(255,255,255,0.2)' : '#ddd',
          color: isFeatured ? 'rgba(255,255,255,0.7)' : '#666',
        }}>
          «{event.criticQuote}»
          {event.criticSource && ` — ${event.criticSource}`}
        </Text>
      )}

      {event.tags.length > 0 && (
        <Text style={styles.eventTags}>
          {event.tags.map((tag) => `[${tag}]`).join(' ')}
        </Text>
      )}
    </Section>
  );
}

// --- Styles ---

const styles = {
  body: {
    backgroundColor: '#E8E3DB',
    fontFamily: 'Arial, Helvetica, sans-serif',
    margin: '0',
    padding: '20px 0',
  } as React.CSSProperties,

  container: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: colors.fundo,
  } as React.CSSProperties,

  header: {
    backgroundColor: colors.texto,
    padding: '20px 32px',
  } as React.CSSProperties,

  logoLx: {
    fontFamily: 'Arial Black, Arial, sans-serif',
    fontSize: '28px',
    fontWeight: 900,
    color: colors.amarelo,
    margin: '0',
    lineHeight: '1',
  } as React.CSSProperties,

  logoCulture: {
    fontFamily: 'Arial Black, Arial, sans-serif',
    fontSize: '28px',
    fontWeight: 900,
    color: colors.branco,
    margin: '0',
    lineHeight: '1',
  } as React.CSSProperties,

  editionHeader: {
    backgroundColor: colors.texto,
    padding: '0 32px 32px',
    color: colors.fundo,
  } as React.CSSProperties,

  weekLabel: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: colors.amarelo,
    margin: '0 0 8px',
  } as React.CSSProperties,

  dateTitle: {
    fontSize: '36px',
    fontWeight: 900,
    color: colors.branco,
    margin: '0 0 16px',
    lineHeight: '1.1',
  } as React.CSSProperties,

  introText: {
    fontSize: '15px',
    lineHeight: '1.6',
    color: 'rgba(255,255,255,0.85)',
    margin: '16px 0 0',
  } as React.CSSProperties,

  categoryTitle: {
    fontSize: '14px',
    fontWeight: 900,
    letterSpacing: '1px',
    color: colors.texto,
    margin: '0',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  eventCard: {
    borderLeftStyle: 'solid' as const,
    padding: '16px 20px',
    borderRadius: '0 4px 4px 0',
  } as React.CSSProperties,

  featuredBadge: {
    fontSize: '10px',
    fontWeight: 900,
    letterSpacing: '2px',
    backgroundColor: colors.magenta,
    color: colors.branco,
    padding: '3px 8px',
    display: 'inline-block',
    margin: '0 0 8px',
  } as React.CSSProperties,

  eventTitle: {
    fontSize: '18px',
    fontWeight: 700,
    margin: '0 0 4px',
    lineHeight: '1.2',
  } as React.CSSProperties,

  eventMeta: {
    fontSize: '13px',
    margin: '0 0 2px',
  } as React.CSSProperties,

  eventDetails: {
    fontSize: '13px',
    margin: '0 0 10px',
  } as React.CSSProperties,

  eventBlurb: {
    fontSize: '14px',
    lineHeight: '1.5',
    margin: '0 0 8px',
  } as React.CSSProperties,

  eventQuote: {
    fontSize: '13px',
    fontStyle: 'italic' as const,
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid' as const,
    paddingLeft: '12px',
    margin: '0 0 8px',
    lineHeight: '1.4',
  } as React.CSSProperties,

  eventTags: {
    fontSize: '11px',
    color: colors.cinza,
    margin: '0',
    letterSpacing: '0.5px',
  } as React.CSSProperties,

  ctaSection: {
    backgroundColor: colors.primaria,
    padding: '40px 32px',
    textAlign: 'center' as const,
    margin: '16px 0 0',
  } as React.CSSProperties,

  ctaTitle: {
    fontSize: '24px',
    fontWeight: 900,
    color: colors.branco,
    margin: '0 0 8px',
  } as React.CSSProperties,

  ctaText: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.8)',
    margin: '0 0 20px',
  } as React.CSSProperties,

  ctaButton: {
    display: 'inline-block',
    backgroundColor: colors.amarelo,
    color: colors.texto,
    padding: '12px 32px',
    fontSize: '14px',
    fontWeight: 900,
    letterSpacing: '1px',
    textDecoration: 'none',
  } as React.CSSProperties,

  footer: {
    padding: '24px 32px',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  footerText: {
    fontSize: '13px',
    color: colors.cinza,
    margin: '0 0 8px',
    lineHeight: '1.5',
  } as React.CSSProperties,

  footerLink: {
    color: colors.primaria,
    textDecoration: 'none',
  } as React.CSSProperties,

  footerSmall: {
    fontSize: '11px',
    color: '#aaa',
    margin: '16px 0 0',
  } as React.CSSProperties,
};
