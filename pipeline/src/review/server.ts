import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CuratedEvent } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ReviewData {
  introText: string;
  events: CuratedEvent[];
}

/**
 * Local review server for human approval of curated events.
 * Runs on localhost:3333 and provides a simple UI for:
 * - Viewing all curated events grouped by category
 * - Approving/rejecting individual events
 * - Editing event descriptions
 * - Toggling featured status
 * - Publishing the approved edition
 */
export function startReviewServer(
  cacheDir: string,
  onPublish: (data: ReviewData) => Promise<void>
): Promise<void> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json({ limit: '5mb' }));

    // Load curated events
    const curatedPath = join(cacheDir, 'curated-events.json');
    if (!existsSync(curatedPath)) {
      console.error(
        'No curated events found. Run the curate step first.'
      );
      resolve();
      return;
    }

    // Serve the review UI
    app.get('/', (_req, res) => {
      const html = buildReviewHtml();
      res.type('html').send(html);
    });

    // API: get current data
    app.get('/api/data', (_req, res) => {
      const data = JSON.parse(readFileSync(curatedPath, 'utf-8'));
      res.json(data);
    });

    // API: save changes
    app.post('/api/save', (req, res) => {
      writeFileSync(curatedPath, JSON.stringify(req.body, null, 2));
      res.json({ ok: true });
    });

    // API: publish
    app.post('/api/publish', async (req, res) => {
      try {
        writeFileSync(
          join(cacheDir, 'approved-events.json'),
          JSON.stringify(req.body, null, 2)
        );
        await onPublish(req.body);
        res.json({ ok: true, message: 'Edição publicada!' });
        // Give time for response to be sent
        setTimeout(() => {
          console.log('\n✓ Edição publicada. O servidor vai encerrar.');
          resolve();
          process.exit(0);
        }, 1000);
      } catch (error) {
        res.status(500).json({
          ok: false,
          message: String(error),
        });
      }
    });

    const PORT = 3333;
    app.listen(PORT, () => {
      console.log(`\n🎭 LX Cult(ure) — Review Server`);
      console.log(`   Abrir: http://localhost:${PORT}`);
      console.log(`   Ctrl+C para sair sem publicar\n`);
    });
  });
}

function buildReviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LX Cult(ure) — Review</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a1a; color: #f5f0e8; padding: 2rem;
    }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .intro-section { margin-bottom: 2rem; }
    .intro-section textarea {
      width: 100%; height: 100px; padding: 1rem; background: #2a2a2a;
      color: #f5f0e8; border: 2px solid #444; font-size: 0.95rem;
      line-height: 1.5; resize: vertical; border-radius: 4px;
    }
    .intro-section textarea:focus { border-color: #1a1ae5; outline: none; }
    .category { margin-bottom: 2rem; }
    .category-header {
      display: flex; align-items: center; gap: 0.75rem;
      margin-bottom: 1rem; padding-bottom: 0.5rem;
      border-bottom: 3px solid var(--cat-color, #1a1ae5);
    }
    .category-header h2 { font-size: 1.3rem; }
    .category-header .count {
      background: #444; color: #fff; font-size: 0.75rem;
      padding: 0.2em 0.6em; border-radius: 10px;
    }
    .event {
      background: #2a2a2a; padding: 1.25rem; margin-bottom: 0.75rem;
      border-left: 4px solid var(--cat-color, #1a1ae5);
      border-radius: 0 4px 4px 0; position: relative;
      transition: opacity 0.2s;
    }
    .event.rejected { opacity: 0.3; }
    .event.featured { border-left-width: 8px; background: #222; }
    .event-header { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
    .event-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem; }
    .event-meta { font-size: 0.85rem; color: #999; margin-bottom: 0.5rem; }
    .event-blurb {
      font-size: 0.9rem; line-height: 1.5; margin-bottom: 0.5rem;
      border: 1px solid transparent; padding: 0.5rem;
      border-radius: 4px; background: #333;
    }
    .event-blurb:focus { border-color: #1a1ae5; outline: none; }
    .event-score { font-size: 0.8rem; color: #1a1ae5; font-weight: 700; }
    .event-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
    .btn {
      font-size: 0.75rem; padding: 0.4em 0.8em; border: 1px solid #555;
      background: transparent; color: #ccc; cursor: pointer;
      border-radius: 3px; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .btn:hover { background: #444; }
    .btn.active { background: #1a1ae5; border-color: #1a1ae5; color: #fff; }
    .btn.reject.active { background: #e5195e; border-color: #e5195e; }
    .btn.featured.active { background: #ffd600; border-color: #ffd600; color: #1a1a1a; }
    .actions-bar {
      position: fixed; bottom: 0; left: 0; right: 0; background: #111;
      padding: 1rem 2rem; display: flex; justify-content: space-between;
      align-items: center; border-top: 2px solid #333; z-index: 100;
    }
    .publish-btn {
      font-size: 1rem; padding: 0.8em 2em; background: #1a1ae5;
      color: #fff; border: none; cursor: pointer; font-weight: 700;
      border-radius: 4px; text-transform: uppercase;
    }
    .publish-btn:hover { background: #e5195e; }
    .status { font-size: 0.9rem; color: #888; }
    .stats { font-size: 0.85rem; color: #888; }
    .pad-bottom { padding-bottom: 5rem; }
    .tags { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.25rem; }
    .tag {
      font-size: 0.7rem; background: #444; color: #ccc; padding: 0.15em 0.5em;
      border-radius: 2px;
    }
  </style>
</head>
<body class="pad-bottom">
  <h1>LX Cult(ure) — Review</h1>
  <p class="subtitle">Revê e aprova os eventos curados para a próxima edição</p>

  <div class="intro-section">
    <h3 style="margin-bottom:0.5rem">Texto Introdutório</h3>
    <textarea id="intro-text"></textarea>
  </div>

  <div id="events-container"></div>

  <div class="actions-bar">
    <div>
      <span class="stats" id="stats"></span>
    </div>
    <div style="display:flex;gap:1rem;align-items:center">
      <span class="status" id="status"></span>
      <button class="btn" onclick="saveChanges()">Guardar</button>
      <button class="publish-btn" onclick="publishEdition()">Publicar Edição</button>
    </div>
  </div>

  <script>
    let data = { introText: '', events: [] };
    const CATEGORIES = {
      'artes-performativas': { label: 'Artes Performativas & Cinema', color: '#e5195e' },
      'artes-visuais': { label: 'Artes Visuais & Exposições', color: '#1a1ae5' },
      'literatura': { label: 'Literatura & Conversas', color: '#ffd600' },
      'musica-noite': { label: 'Música ao Vivo & Noite', color: '#7b2fbe' },
    };

    async function loadData() {
      const res = await fetch('/api/data');
      data = await res.json();
      document.getElementById('intro-text').value = data.introText || '';
      // Mark all as approved by default
      data.events.forEach(e => { if (e._rejected === undefined) e._rejected = false; });
      render();
    }

    function render() {
      const container = document.getElementById('events-container');
      let html = '';

      for (const [catId, catInfo] of Object.entries(CATEGORIES)) {
        const catEvents = data.events.filter(e => e.category === catId);
        if (catEvents.length === 0) continue;

        const approved = catEvents.filter(e => !e._rejected).length;
        html += '<div class="category" style="--cat-color:' + catInfo.color + '">';
        html += '<div class="category-header"><h2>' + catInfo.label + '</h2>';
        html += '<span class="count">' + approved + '/' + catEvents.length + '</span></div>';

        catEvents.sort((a, b) => b.aiScore - a.aiScore);
        for (const event of catEvents) {
          const idx = data.events.indexOf(event);
          const cls = (event._rejected ? ' rejected' : '') + (event.featured ? ' featured' : '');
          html += '<div class="event' + cls + '" data-idx="' + idx + '">';
          html += '<div class="event-header"><div>';
          html += '<div class="event-title">' + esc(event.title) + '</div>';
          html += '<div class="event-meta">' + esc(event.venue || '') + ' · ' + esc(event.venueNeighborhood || '') + ' · ' + esc(event.dates || '') + (event.time ? ' · ' + esc(event.time) : '') + (event.price ? ' · ' + esc(event.price) : '') + '</div>';
          html += '</div><div class="event-score">Score: ' + event.aiScore + '</div></div>';
          html += '<div class="event-blurb" contenteditable="true" data-field="blurb" data-idx="' + idx + '">' + esc(event.blurb || '') + '</div>';
          if (event.criticQuote) {
            html += '<div style="font-size:0.8rem;color:#888;font-style:italic;margin-bottom:0.5rem">«' + esc(event.criticQuote) + '» — ' + esc(event.criticSource || '') + '</div>';
          }
          if (event.tags && event.tags.length) {
            html += '<div class="tags">' + event.tags.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>';
          }
          html += '<div class="event-actions">';
          html += '<button class="btn' + (!event._rejected ? ' active' : '') + '" onclick="toggleApprove(' + idx + ')">Aprovar</button>';
          html += '<button class="btn reject' + (event._rejected ? ' active' : '') + '" onclick="toggleReject(' + idx + ')">Rejeitar</button>';
          html += '<button class="btn featured' + (event.featured ? ' active' : '') + '" onclick="toggleFeatured(' + idx + ')">Destaque</button>';
          html += '</div></div>';
        }
        html += '</div>';
      }

      container.innerHTML = html;
      updateStats();

      // Bind contenteditable changes
      document.querySelectorAll('[contenteditable]').forEach(el => {
        el.addEventListener('blur', () => {
          const idx = parseInt(el.dataset.idx);
          const field = el.dataset.field;
          data.events[idx][field] = el.textContent;
        });
      });
    }

    function toggleApprove(idx) { data.events[idx]._rejected = false; render(); }
    function toggleReject(idx) { data.events[idx]._rejected = true; render(); }
    function toggleFeatured(idx) { data.events[idx].featured = !data.events[idx].featured; render(); }

    function updateStats() {
      const total = data.events.length;
      const approved = data.events.filter(e => !e._rejected).length;
      const featured = data.events.filter(e => e.featured && !e._rejected).length;
      document.getElementById('stats').textContent =
        approved + '/' + total + ' aprovados · ' + featured + ' destaques';
    }

    async function saveChanges() {
      data.introText = document.getElementById('intro-text').value;
      const status = document.getElementById('status');
      status.textContent = 'A guardar...';
      await fetch('/api/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      status.textContent = 'Guardado ✓';
      setTimeout(() => { status.textContent = ''; }, 2000);
    }

    async function publishEdition() {
      if (!confirm('Publicar esta edição? Os eventos rejeitados serão excluídos.')) return;
      data.introText = document.getElementById('intro-text').value;
      const publishData = {
        introText: data.introText,
        events: data.events.filter(e => !e._rejected).map(e => {
          const { _rejected, ...clean } = e;
          return clean;
        }),
      };
      const status = document.getElementById('status');
      status.textContent = 'A publicar...';
      const res = await fetch('/api/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishData),
      });
      const result = await res.json();
      status.textContent = result.message;
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    loadData();
  </script>
</body>
</html>`;
}
