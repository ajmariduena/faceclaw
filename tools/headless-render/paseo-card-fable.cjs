// Paseo home-card proposals (designer: fable). Three layouts × four states,
// rendered in the home band with the stock left column. See research/paseo-card-fable.md.
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, TtfFont, adapter } = context;
const art = context.load('app/apps/home/stock-art.ts');
const { ICON_SVGS } = context.load('app/graphics/icons.ts');

const DIM = 136;
const PANEL = { x: 230, y: 14, w: 318, h: 260 };
const TEXT_LEFT = 20;
const TEXT_RIGHT = 298;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;
const FIRST_ROW = 62;
// Same floor as home-painter (y + 27 <= 254): seven rows in the stock font, five in Large text.
const BOTTOM = 254;

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', `${name}.png`), Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(`out/${name}.png`);
}

function column(image, { day, hh, mm, ring, glasses, temp, needs }, svgIcon) {
  image.fillRect(0, 0, 214, 288, 0);
  art.dotText(image, 22, 21, day);
  const battery = (x, letter, level) => {
    art.dotText(image, x, 21, letter, 255);
    for (let i = 0; i < 4; i++) image.fillRect(x + 14 + i * 4, 21, 2, 14, i < level ? 255 : 68);
  };
  battery(128, 'R', ring);
  battery(172, 'G', glasses);
  for (const [value, y] of [[hh, 69], [mm, 149]]) {
    for (let i = 0; i < 2; i++) image.drawImage(art.digit(graphics, value[i]), 58 + i * 62, y);
  }
  image.drawImage(svgIcon('cloud-sun', 22), 22, 250);
  art.dotText(image, 52, 254, temp);
  if (needs > 0) {
    image.drawImage(svgIcon('square-terminal', 22), 150, 250);
    art.dotText(image, 180, 254, String(needs));
  }
}

function fit(face, text, width) {
  text = text.replace(/[\r\n\t]/g, ' ');
  if (face.measureLine(text) <= width) return text;
  const chars = Array.from(text);
  while (chars.length && face.measureLine(`${chars.join('').trimEnd()}…`) > width) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

function wrap(face, text, width, max) {
  const lines = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (face.measureLine(next) <= width || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = fit(face, `${lines[max - 1]} …`, width);
  }
  return lines;
}

function formatAge(thenMs, nowMs) {
  const minutes = Math.round((nowMs - thenMs) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}
/** "1m", "4m", "2h", "3d": the rail rows are tight, the long form stays for sentences. */
const ageShort = (thenMs, nowMs) => formatAge(thenMs, nowMs).replace(' min', 'm').replace(' h', 'h').replace(' d', 'd');
const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ---------------------------------------------------------------------------
// Scenes. `agents` is what the snapshot would carry: every listed agent with its
// bucket, sorted needs → failed → review → working → done, newest first inside each.

const NOW = new Date(2026, 9, 10, 9, 41).getTime();
const ago = (minutes) => NOW - minutes * 60_000;

const SCENES = {
  a: {
    label: '1 needs you, 2 working, 3 done',
    status: '',
    agents: [
      { title: 'Fix reconnect after BLE drop', bucket: 'needs', activityMs: ago(1), line: '¿Apruebas correr los tests de BLE?' },
      { title: 'Revisar PR #1221 jelou-cli', bucket: 'working', activityMs: ago(4), line: 'Leyendo los cambios en workflow-engine.' },
      { title: 'Migrar settings a KV', bucket: 'working', activityMs: ago(9), line: 'Escribiendo la migración de settings-store.' },
      { title: 'Resumen de métricas octubre', bucket: 'done', activityMs: ago(12), line: 'Reporte listo en research/metrics-oct.md.' },
      { title: 'Limpiar logs del daemon', bucket: 'done', activityMs: ago(31), line: 'Borré 14 archivos viejos; quedan 2 GB libres.' },
      { title: 'Traducir README al inglés', bucket: 'done', activityMs: ago(55), line: 'README traducido y commit abierto.' },
    ],
  },
  b: {
    label: 'nothing needs you, 2 working',
    status: '',
    agents: [
      { title: 'Revisar PR #1221 jelou-cli', bucket: 'working', activityMs: ago(2), line: 'Corriendo los 18 tests de BLE.' },
      { title: 'Migrar settings a KV', bucket: 'working', activityMs: ago(9), line: 'Escribiendo la migración de settings-store.' },
      { title: 'Traducir README al inglés', bucket: 'done', activityMs: ago(95), line: 'README traducido y commit abierto.' },
    ],
  },
  c: {
    label: 'all quiet, everything done in the last hour',
    status: '',
    agents: [
      { title: 'Fix reconnect after BLE drop', bucket: 'done', activityMs: ago(12), line: 'Tests de BLE en verde, PR #1224 abierto.' },
      { title: 'Resumen de métricas octubre', bucket: 'done', activityMs: ago(20), line: 'Reporte listo en research/metrics-oct.md.' },
      { title: 'Limpiar logs del daemon', bucket: 'done', activityMs: ago(31), line: 'Borré 14 archivos viejos; quedan 2 GB libres.' },
      { title: 'Traducir README al inglés', bucket: 'done', activityMs: ago(55), line: 'README traducido y commit abierto.' },
    ],
  },
  d: {
    label: 'Mac unreachable',
    status: 'Mac unreachable',
    lastSeenMs: ago(29),
    lastCounts: { needs: 1, working: 2, done: 3 },
    agents: [],
  },
};

const ORDER = ['needs', 'failed', 'review', 'working', 'done'];
function counts(agents) {
  const c = { needs: 0, failed: 0, review: 0, working: 0, done: 0 };
  for (const a of agents) c[a.bucket]++;
  return c;
}
const WORD = { needs: 'needs you', failed: 'failed', review: 'to review', working: 'working', done: 'done' };
function ledgerText(c, skip = []) {
  return ORDER.filter((b) => c[b] > 0 && !skip.includes(b)).map((b) => `${c[b]} ${WORD[b]}`).join(' · ');
}

// ---------------------------------------------------------------------------
// Card painters. Each gets a panel-painting toolkit and returns nothing; rows are
// laid out from FIRST_ROW with the face's pitch, and nothing is drawn past BOTTOM.

function toolkit(panel, face, pitch, icon) {
  const rows = [];
  for (let y = FIRST_ROW; y + face.lineHeight <= BOTTOM; y += pitch) rows.push(y);
  const text = (y, label, value = 255, x = TEXT_LEFT, width = TEXT_RIGHT - x) => face.drawText(panel, x, y, fit(face, label, width), value);
  const right = (y, label, value = 255) => face.drawText(panel, TEXT_RIGHT - face.measureLine(label), y, label, value);
  const centered = (y, label, value = 255) => {
    const line = fit(face, label, TEXT_WIDTH);
    face.drawText(panel, Math.round((PANEL.w - face.measureLine(line)) / 2), y, line, value);
  };
  const header = () => { panel.drawImage(icon('square-terminal', 24), 20, 18); text(16, 'Paseo', 255, 52, 246); };
  // Rail marks: ">" for the agent that needs you (house style), a hollow box while working, a filled one when done.
  const markW = face.measureLine('> ');
  const mark = (y, kind, value) => {
    const box = Math.round(face.lineHeight * 0.33);
    const top = y + Math.round((face.lineHeight - box) / 2) + 1;
    if (kind === 'needs' || kind === 'failed' || kind === 'review') face.drawText(panel, TEXT_LEFT, y, '>', value);
    else if (kind === 'working') panel.drawRoundedRect(TEXT_LEFT + 1, top, box, box, value, 1);
    else panel.fillRoundedRect(TEXT_LEFT + 1, top, box, box, value, 1);
  };
  return { rows, text, right, centered, header, mark, markW, lastRow: rows[rows.length - 1] };
}

function unreachable(t, scene, withStale) {
  t.header();
  t.text(t.rows[0], 'Mac unreachable');
  t.text(t.rows[1], `Last seen ${formatAge(scene.lastSeenMs, NOW)} ago`, DIM);
  if (withStale && scene.lastCounts && t.rows.length >= 4) t.text(t.lastRow, `Was: ${ledgerText(scene.lastCounts, ['done'])}`, DIM);
}

// Layout 1 — Verdict: one white sentence answers the question, then the one agent that justifies it, then the ledger.
function paintVerdict(t, face, scene) {
  if (scene.status) return unreachable(t, scene, true);
  t.header();
  const c = counts(scene.agents);
  const lead = scene.agents[0];
  let verdict, ledger;
  if (c.needs) { verdict = `${c.needs} need${c.needs === 1 ? 's' : ''} you`; ledger = ledgerText(c, ['needs']); }
  else if (c.failed) { verdict = `${c.failed} failed`; ledger = ledgerText(c, ['failed']); }
  else if (c.review) { verdict = `${c.review} to review`; ledger = ledgerText(c, ['review']); }
  else if (c.working) { verdict = 'Nothing needs you'; ledger = ledgerText(c); }
  else if (c.done) { verdict = 'All done'; ledger = `${c.done} finished · last ${formatAge(lead.activityMs, NOW)}`; }
  else { verdict = 'No agents'; ledger = ''; }
  t.text(t.rows[0], verdict);
  if (lead) {
    t.text(t.rows[1], lead.title, DIM);
    const body = wrap(face, lead.line, TEXT_WIDTH, Math.min(2, t.rows.length - 3));
    body.forEach((line, i) => t.text(t.rows[2 + i], line));
  }
  if (ledger) t.text(t.lastRow, ledger, DIM);
}

// Layout 2 — Ledger: one row per bucket with its count on the right, the newest agent of each beneath.
function paintLedger(t, face, scene) {
  if (scene.status) return unreachable(t, scene, false);
  t.header();
  const c = counts(scene.agents);
  const lit = ORDER.find((b) => c[b] > 0 && b !== 'done') ?? 'done';
  const LABEL = { needs: 'Needs you', failed: 'Failed', review: 'To review', working: 'Working', done: 'Done' };
  let row = 0;
  for (const bucket of ORDER) {
    if (!c[bucket] || row >= t.rows.length) continue;
    const value = bucket === lit ? 255 : DIM;
    const count = String(c[bucket]);
    t.text(t.rows[row], LABEL[bucket], value, TEXT_LEFT, TEXT_WIDTH - face.measureLine(count) - 12);
    t.right(t.rows[row], count, value);
    row++;
    const inBucket = scene.agents.filter((a) => a.bucket === bucket);
    // One agent per bucket; when done is all there is, there is room to name a few.
    const shown = bucket === 'done' && c.done === scene.agents.length ? inBucket.slice(0, t.rows.length - row) : inBucket.slice(0, 1);
    for (const lead of shown) {
      if (row >= t.rows.length) break;
      const age = ` · ${ageShort(lead.activityMs, NOW)}`;
      const body = bucket === 'needs' ? lead.line : bucket === 'done' ? `${fit(face, lead.title, TEXT_WIDTH - t.markW - face.measureLine(age))}${age}` : lead.title;
      t.text(t.rows[row], body, value, TEXT_LEFT + t.markW);
      row++;
    }
  }
}

// Layout 3 — Roster: every agent on one row behind a rail mark; the ">" row also shows its question. Done agents fold into one dim row.
function paintRoster(t, face, scene) {
  if (scene.status) return unreachable(t, scene, false);
  t.header();
  const c = counts(scene.agents);
  const live = scene.agents.filter((a) => a.bucket !== 'done');
  const done = scene.agents.filter((a) => a.bucket === 'done');
  const railRow = (y, agent, value) => {
    const age = ageShort(agent.activityMs, NOW);
    t.mark(y, agent.bucket, value);
    t.text(y, `${fit(face, agent.title, TEXT_WIDTH - t.markW - face.measureLine(` · ${age}`))} · ${age}`, value, TEXT_LEFT + t.markW);
  };
  let row = 0;
  if (!live.length) {
    t.text(t.rows[row++], done.length ? 'All done' : 'No agents');
    // All quiet: there is room, so list what finished instead of folding it.
    const limit = done.length > t.rows.length - row ? t.rows.length - row - 1 : done.length;
    done.slice(0, limit).forEach((agent) => railRow(t.rows[row++], agent, DIM));
    if (limit < done.length) t.text(t.rows[row], `+${done.length - limit} more`, DIM, TEXT_LEFT + t.markW);
    return;
  }
  if (!c.needs && !c.failed && !c.review) t.text(t.rows[row++], 'Nothing needs you');
  const doneRow = done.length ? 1 : 0;
  const limit = t.rows.length - doneRow;
  for (const agent of live) {
    if (row >= limit) break;
    const urgent = agent.bucket !== 'working';
    railRow(t.rows[row++], agent, urgent ? 255 : DIM);
    // The question gets two rows when the pitch allows (stock font), one in Large text.
    if (urgent) for (const line of wrap(face, agent.line, TEXT_WIDTH - t.markW, Math.min(t.rows.length >= 7 ? 2 : 1, limit - row))) t.text(t.rows[row++], line, 255, TEXT_LEFT + t.markW);
  }
  if (done.length) {
    t.mark(t.lastRow, 'done', DIM);
    t.text(t.lastRow, `${done.length} done · last ${formatAge(done[0].activityMs, NOW)}`, DIM, TEXT_LEFT + t.markW);
  }
}

const LAYOUTS = { verdict: paintVerdict, ledger: paintLedger, roster: paintRoster };

function ttfFace(size) {
  const font = TtfFont.load(adapter.fontPath, size);
  return { lineHeight: font.lineHeight, measureLine: (t) => font.measureText(t), drawText: (...a) => font.drawText(...a) };
}

async function main() {
  await adapter.prepareIcons(['cloud-sun', 'square-terminal'].map((n) => ICON_SVGS[n]));
  const svgIcon = (name, size) => adapter.rasterizeSvg(ICON_SVGS[name], size, 2, graphics.GrayImage);
  const faces = [['', await stockFont(graphics), 27], ['-large', ttfFace(26), 34]];
  for (const [suffix, face, pitch] of faces) {
    for (const [layoutName, paint] of Object.entries(LAYOUTS)) {
      for (const [sceneName, scene] of Object.entries(SCENES)) {
        if (suffix && !(layoutName === 'roster' || sceneName === 'a')) continue;
        const band = new graphics.GrayImage(576, 288);
        const panel = new graphics.GrayImage(PANEL.w, PANEL.h);
        panel.drawRoundedRect(0, 0, PANEL.w, PANEL.h, 255, 6);
        paint(toolkit(panel, face, pitch, svgIcon), face, scene);
        band.bitBlt(panel.withDrawsBaked(), PANEL.x, PANEL.y);
        for (let i = 0; i < 5; i++) band.fillRect(218, 120 + i * 11, i === 0 ? 4 : 2, 3, i === 0 ? 255 : 85);
        const needs = scene.status ? 0 : counts(scene.agents).needs;
        column(band, { day: 'Sat 10', hh: '09', mm: '41', ring: 3, glasses: 4, temp: '27°C', needs }, svgIcon);
        save(band, `paseo-card-fable-${layoutName}-${sceneName}${suffix}`);
      }
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
