// ─────────────────────────────────────────────────────────────
// InCynq .net — FAQ builder
//
// Bakes every question from data/qaData.js into faq.html as plain
// HTML, plus FAQPage structured data, so Google can read the FAQ
// without running JavaScript. Prices come live from admin
// (Supabase app_content), exactly like js/prices.js does.
//
// Run it from the incynq-net folder whenever qaData.js or a price
// in admin changes:
//
//     node tools/build-faq.mjs
//
// Then commit faq.html. Visitors still see live prices either way:
// the script in faq.html re-draws the FAQ when the page loads.
// ─────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAQ_FILE = join(ROOT, 'faq.html');
const PRICES_FILE = join(ROOT, 'js', 'prices.js');
const DATA_FILE = join(ROOT, 'data', 'qaData.js');

const PART_LABELS = ['For residents', 'For brands', 'For DJs & performers'];

// ── 1. Load the questions ────────────────────────────────────
// Loaded as a data: module so it works on any Node version without
// needing "type": "module" in a package.json.
const dataSrc = readFileSync(DATA_FILE, 'utf8');
const { QA_DATA } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(dataSrc));

// ── 2. Load prices from admin ────────────────────────────────
// Re-uses the public Supabase address and anon key from js/prices.js,
// so there is only one place to change them.
const pricesSrc = readFileSync(PRICES_FILE, 'utf8');
const SB = pricesSrc.match(/var SB\s*=\s*'([^']+)'/)?.[1];
const ANON = pricesSrc.match(/var ANON\s*=\s*'([^']+)'/)?.[1];
if (!SB || !ANON) fail('Could not find the Supabase address in js/prices.js.');

let map = {};
try {
  const res = await fetch(`${SB}/rest/v1/app_content?select=key,value`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  for (const row of await res.json()) map[row.key] = row.value;
} catch (e) {
  fail(`Could not load prices from admin (${e.message}). Check your connection and try again.`);
}

const fmt = (v) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? String(v) : n.toLocaleString('en-US');
};

function tierInlineText() {
  let tiers = [];
  try { tiers = JSON.parse(map.pricing_tiers || '[]'); } catch {}
  const span = (t) => {
    if (t.min === 0) return 'under ' + fmt((t.max || 0) + 1) + ' members';
    if (t.max == null) return fmt(t.min) + '+';
    return fmt(t.min) + '-' + fmt(t.max + 1);
  };
  return tiers.map((t) =>
    t.label + ' Tier (' + span(t) + '): Basic ' + fmt(t.basic) +
    ' / Featured ' + fmt(t.featured) + ' / Premium ' + fmt(t.premium) + ' L$.'
  ).join(' ');
}

const missing = new Set();
const tierInline = tierInlineText();
function sub(text) {
  return String(text)
    .replace('{{AD_TIER_INLINE}}', tierInline)
    .replace(/\{\{(\w+)\}\}/g, (m, k) => {
      if (map[k] == null) { missing.add(k); return m; }
      return fmt(map[k]);
    });
}

// ── 3. Build the page HTML (same markup the live script draws) ─
let html = '';
const faqEntities = [];

for (const [pi, part] of QA_DATA.entries()) {
  html += `\n        <div class="faq-part-title">${PART_LABELS[pi] || part.part}</div>`;
  for (const sec of part.sections) {
    html += `
        <div class="faq-group">
          <h2 class="faq-group-title">${sec.title}</h2>
          <div class="faq-list">`;
    for (const item of sec.items) {
      const q = sub(item.q);
      const a = sub(item.a);
      html += `
            <details class="faq-item">
              <summary class="faq-question">${q}<span class="faq-chevron">▾</span></summary>
              <div class="faq-answer">${a}</div>
            </details>`;
      faqEntities.push({
        '@type': 'Question',
        name: plain(q),
        acceptedAnswer: { '@type': 'Answer', text: plain(a) },
      });
    }
    html += `
          </div>
        </div>`;
  }
}

html += `
        <div class="faq-still-stuck">
          <h2>Still stuck?</h2>
          <p>Use the <a href="contact.html">contact form</a> or email us at <a href="mailto:support@incynq.net">support@incynq.net</a> and we'll get back to you.</p>
        </div>
        `;

if (missing.size) {
  fail(`These prices are used in qaData.js but are missing in admin: ${[...missing].join(', ')}.\n` +
       `Add them in the admin Content tab (or remove them from qaData.js), then run this again.`);
}

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqEntities,
}, null, 2).replace(/</g, '\\u003c');

// ── 4. Write it into faq.html between the markers ────────────
let page = readFileSync(FAQ_FILE, 'utf8');
page = between(page, '<!-- FAQ:STATIC:START -->', '<!-- FAQ:STATIC:END -->', html);
page = between(page, '<!-- FAQ:JSONLD:START -->', '<!-- FAQ:JSONLD:END -->',
  '\n  <script type="application/ld+json">\n  ' + jsonLd.replace(/\n/g, '\n  ') + '\n  </script>\n  ');
writeFileSync(FAQ_FILE, page);

const words = plain(html).split(/\s+/).filter(Boolean).length;
console.log(`✓ faq.html updated: ${faqEntities.length} questions, about ${words.toLocaleString('en-US')} words.`);
console.log('  Next: commit and push faq.html.');

// ── helpers ──────────────────────────────────────────────────
function plain(s) {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/▾/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function between(src, start, end, content) {
  const a = src.indexOf(start);
  const b = src.indexOf(end);
  if (a === -1 || b === -1 || b < a) fail(`Markers ${start} … ${end} not found in faq.html.`);
  return src.slice(0, a + start.length) + content + src.slice(b);
}

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}
