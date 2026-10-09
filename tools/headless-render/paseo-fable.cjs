const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { createScenes: createStockScenes } = require('./stock-scenes.cjs');
const { createV3Scenes } = require('./v3-scenes.cjs');
const art = require('./stock-art.cjs');

const NOW = Date.parse('2026-10-08T08:40:00-05:00');
const min = (m) => NOW - m * 60_000;

const agents = [
  { status: 'approval', title: 'Fix reconnect after BLE drop', project: 'faceclaw', at: min(1), summary: 'Arreglé la reconexión; ¿apruebas correr los tests?', request: { label: 'Approve command', detail: 'npm test -- ble-session' } },
  { status: 'input', title: 'Revisar PR #1221 jelou-cli', project: 'jelou-cli', at: min(4), summary: 'Listo para fusionar; ¿lo mando a producción?' },
  { status: 'working', title: 'Horizonte clock tests', project: 'faceclaw', at: min(0), summary: 'Corriendo los tests nuevos, paso 2 de 3.' },
  { status: 'ready', unread: true, title: 'Analizar repositorio Hello QA', project: 'jelou-qa', at: min(18), summary: 'Kit de QA con dos PRs abiertos sin revisar.' },
  { status: 'failed', title: 'Upgrade NativeScript to 9', project: 'faceclaw', at: min(52), summary: 'Falló el build: falta el NDK 27 en la mini.' },
];
const detailSummary = 'Arreglé la reconexión tras una caída de BLE; ¿apruebas correr los tests?';
const fullReply = [
  { kind: 'user', text: 'The glasses lose the connection after a BLE drop. Find why and fix it.' },
  { kind: 'activity', label: 'Read', detail: 'app/native/ble-session.ts' },
  { kind: 'activity', label: 'Search', detail: 'reconnect' },
  { kind: 'activity', label: 'Read', detail: 'FaceclawBleService.kt' },
  { kind: 'activity', label: 'Edit', detail: 'app/native/ble-session.ts' },
  { kind: 'assistant', text: 'Encontré la causa. Después de una caída de BLE, la sesión conserva el handle GATT viejo, así que cada reintento escribe sobre una conexión muerta y el firmware nunca recibe el saludo. Cambié `BleSession.onDisconnect` para que libere el handle y reinicie el estado, y agregué un backoff de 1 s a 30 s con jitter para no saturar el radio. También quité un `setTimeout` duplicado que disparaba dos reconexiones a la vez. Antes de cerrar quiero correr la suite de BLE para confirmar que no rompí el emparejamiento inicial.' },
  { kind: 'request', label: 'Approve command', detail: 'npm test -- ble-session' },
];

const SECTION = { approval: 'needs', input: 'needs', working: 'working', waiting: 'working', ready: 'recent', failed: 'recent', limited: 'recent' };
// The firmware font has no ● or ✓, so the list marks use glyphs it ships.
const MARK = { approval: '!', input: '?', working: '…', waiting: '…', ready: '•', failed: '×', limited: '×' };
const ACTION = { approval: 'approve', input: 'answer', working: 'open', waiting: 'open', ready: 'read', failed: 'read', limited: 'read' };

async function main() {
  const context = createRenderContext();
  const { graphics, rect, load, TtfFont, adapter } = context;
  const { face } = await createStockScenes(context);
  const v3 = await createV3Scenes(context);
  const { wrapText, truncateText } = load('app/graphics/textwrap.ts');
  const { threadStatusLabel, formatAge, plainMarkdown } = load('app/apps/t3code/t3-model.ts');
  const { Menu } = load('app/ui/menu-core.ts');
  const roboto = (size) => TtfFont.load(adapter.fontPath, size);
  const W = rect.width, H = rect.height, LH = face.lineHeight;
  const written = [];

  const blank = (w = W, h = H) => new graphics.GrayImage(w, h);
  const inside = (image, y, lineHeight, label) => assert.ok(y >= 0 && y + lineHeight <= image.height, `Line outside image: ${label} (y=${y})`);
  const ellipsize = (measure, label, width, word = false) => {
    if (measure(label) <= width) return label;
    if (word) {
      const words = label.split(' ');
      for (let n = words.length - 1; n >= 1; n--) {
        const cut = words.slice(0, n).join(' ') + '…';
        if (measure(cut) <= width) return cut;
      }
    }
    let out = Array.from(label);
    while (out.length && measure(out.join('') + '…') > width) out = out.slice(0, -1);
    return out.join('').trimEnd() + '…';
  };
  const st = (image, x, y, label, value = 255, width = image.width - x, opts = {}) => {
    for (const char of label) assert.ok(char === ' ' || face.hasGlyph(char.codePointAt(0)), `Missing stock glyph: ${char}`);
    if (opts.truncate) label = ellipsize((s) => face.measureLine(s), label, width, opts.truncate === 'word');
    assert.ok(face.measureLine(label) <= width, `Stock text overflow: ${label} (${face.measureLine(label)} > ${width})`);
    inside(image, y, LH, label);
    face.drawText(image, x, y, label, value);
    return face.measureLine(label);
  };
  const stRight = (image, right, y, label, value, width) => st(image, right - face.measureLine(label), y, label, value, width);
  const stWrap = (image, x, y, label, value, width, maxLines) => {
    const lines = face.wrap(label, width);
    assert.ok(lines.length <= maxLines, `Stock wrap overflow: ${lines.length} > ${maxLines} lines for "${label}"`);
    // face.wrap kerns each glyph against its successor, so a wrapped line can measure 1 px over the limit on its own.
    lines.forEach((line, i) => st(image, x, y + i * LH, line, value, width + 2));
    return lines.length;
  };
  const rt = (image, font, x, y, label, value, width, opts = {}) => {
    if (opts.truncate) label = ellipsize((s) => font.measureText(s), label, width);
    assert.ok(font.measureText(label) <= width, `TTF text overflow: ${label} (${font.measureText(label)} > ${width})`);
    inside(image, y, font.lineHeight, label);
    image.drawText(font, x, y, label, value);
  };
  const rtWrap = (image, font, x, y, label, value, width, maxLines, pitch = font.lineHeight) => {
    const lines = wrapText(font, label, width);
    assert.ok(lines.length <= maxLines, `TTF wrap overflow: ${lines.length} > ${maxLines} lines for "${label}"`);
    lines.forEach((line, i) => rt(image, font, x, y + i * pitch, line, value, width));
    return lines.length;
  };
  const icon = (image, name, x, y, size = 24, value = 255) => image.drawImage(art.icon(graphics, name, size).dimmed(value / 255), x, y);
  const vbar = (image, x, top, height, pages, page) => {
    image.fillRect(x, top, 2, height, 51);
    const thumb = Math.max(12, Math.floor(height / pages));
    image.fillRect(x, top + Math.floor(((height - thumb) * page) / Math.max(1, pages - 1)), 2, thumb, 255);
  };
  const pill = (image, x, y, label, active, padding = 18) => {
    const width = face.measureLine(label) + padding * 2;
    if (active) image.fillRoundedRect(x, y, width, 36, 68, 6);
    st(image, x + padding, y + 4, label, active ? 255 : 153, width - padding * 2);
    return width;
  };
  const meta = (agent) => `${agent.project} · ${formatAge(agent.at, NOW)}`;
  const counts = () => {
    const needs = agents.filter((a) => SECTION[a.status] === 'needs').length;
    const working = agents.filter((a) => SECTION[a.status] === 'working').length;
    return { needs, working, recent: agents.length - needs - working };
  };
  const replyText = plainMarkdown(fullReply.find((e) => e.kind === 'assistant').text);
  const request = fullReply.find((e) => e.kind === 'request');
  const focus = agents[0];

  function save(band, name) {
    const output = blank(640, 480);
    output.bitBlt(band.withDrawsBaked(), rect.x, rect.y);
    const rgba = new Uint8Array(640 * 480 * 4);
    for (let i = 0; i < output.pixels.length; i++) {
      const v = graphics.grayToNibble(output.pixels[i]) * 17;
      rgba.set([v, v, v, 255], i * 4);
    }
    const file = path.join(__dirname, 'out', `paseo-fable-${name}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
    written.push(file);
  }

  // ---- Direction A: Deck — one agent per card, stock home layout ----------
  const deck = {
    list(index = 0) {
      const image = blank();
      const agent = agents[index];
      const { needs, working, recent } = counts();
      icon(image, 'ai', 22, 17);
      st(image, 54, 14, 'Paseo', 255, 140);
      st(image, 22, 72, `${needs} need you`, 255, 170);
      st(image, 22, 99, `${working} working`, 153, 170);
      st(image, 22, 126, `${recent} recent`, 153, 170);
      st(image, 22, 247, `${index + 1} / ${agents.length}`, 153, 170);
      for (let i = 0; i < agents.length; i++) image.fillRect(208, 120 + i * 11, i === index ? 4 : 2, 3, i === index ? 255 : 85);
      const card = { x: 220, y: 14, w: 338, h: 260 };
      image.drawRoundedRect(card.x, card.y, card.w, card.h, 255, 6);
      const ix = card.x + 20, iw = card.w - 40;
      const age = formatAge(agent.at, NOW);
      const ageW = face.measureLine(age);
      st(image, ix, card.y + 16, `${threadStatusLabel(agent.status)} · ${agent.project}`, 153, iw - ageW - 12, { truncate: true });
      stRight(image, ix + iw, card.y + 16, age, 153, ageW);
      st(image, ix, card.y + 43, agent.title, 255, iw, { truncate: true });
      stWrap(image, ix, card.y + 82, agent.summary, 255, iw, 4);
      st(image, ix, card.y + 219, `Tap · ${ACTION[agent.status]}`, 153, iw);
      return image;
    },
    header(image, agent) {
      const label = threadStatusLabel(agent.status);
      const labelW = face.measureLine(label);
      icon(image, 'ai', 22, 17);
      st(image, 54, 14, agent.title, 255, W - 54 - 22 - labelW - 24, { truncate: true });
      stRight(image, 554, 14, label, 153, labelW);
    },
    detail() {
      const image = blank();
      deck.header(image, focus);
      stWrap(image, 22, 57, detailSummary, 255, 532, 2);
      image.drawRoundedRect(18, 128, 540, 100, 255, 6);
      st(image, 38, 140, focus.request.label, 255, 240);
      stRight(image, 538, 140, focus.request.detail, 153, 260);
      st(image, 38, 177, '› Approve', 255, 160);
      st(image, 210, 177, 'Deny', 153, 120);
      st(image, 22, 247, 'Scroll · full reply', 153, 260);
      stRight(image, 554, 247, 'Hold · more', 153, 200);
      return image;
    },
    full(page = 0) {
      const image = blank();
      deck.header(image, focus);
      const perPage = 7;
      const lines = face.wrap(replyText, 500);
      const pages = Math.ceil(lines.length / perPage);
      assert.ok(page < pages);
      lines.slice(page * perPage, (page + 1) * perPage).forEach((line, i) => st(image, 22, 52 + i * LH, line, 255, 502));
      vbar(image, 546, 52, perPage * LH, pages, page);
      st(image, 22, 247, `${page + 1} / ${pages}`, 153, 100);
      stRight(image, 554, 247, 'Double tap · summary', 153, 300);
      return image;
    },
    toast() {
      const image = v3.home().dimmed(0.25);
      image.fillRoundedRect(46, 28, 494, 178, 0, 6);
      image.drawRoundedRect(46, 28, 494, 178, 255, 6);
      icon(image, 'ai', 62, 46);
      const age = formatAge(focus.at, NOW);
      st(image, 100, 43, `Paseo · ${focus.project}`, 255, 300);
      stRight(image, 526, 43, age, 153, 80);
      st(image, 100, 80, threadStatusLabel(focus.status), 255, 426);
      stWrap(image, 100, 107, focus.summary, 255, 426, 2);
      st(image, 100, 161, `Tap · ${ACTION[focus.status]}`, 153, 426);
      return image;
    },
  };

  // ---- Direction B: Triage — one flat list, the selected row unfolds -------
  const triage = {
    list(selected = 0) {
      const image = blank();
      const { needs, working } = counts();
      icon(image, 'ai', 22, 17);
      st(image, 54, 14, 'Paseo', 255, 140);
      stRight(image, 554, 14, `${needs} need you · ${working} working`, 153, 320);
      const box = { x: 18, y: 48, width: 540, height: H - 48 - 4 };
      const ROW = 33, OPEN = LH * 3 + 16;
      let current = selected;
      const menu = new Menu({
        wrap: false,
        highlight: false,
        getHeight: (item) => (agents.indexOf(item) === current ? OPEN : ROW),
        draw({ image: target, item, x, y, width, height, selected: isSelected }) {
          const urgent = SECTION[item.status] === 'needs';
          const titleValue = urgent ? 255 : SECTION[item.status] === 'working' ? 204 : 153;
          const right = meta(item);
          const rightW = face.measureLine(right);
          const top = isSelected ? y + 8 : y + 3;
          if (isSelected) target.drawRoundedRect(x, y, width, height, 255, 6);
          st(target, x + 16, top, MARK[item.status], urgent ? 255 : 153, 24);
          st(target, x + 44, top, item.title, titleValue, width - 44 - rightW - 36, { truncate: true });
          stRight(target, x + width - 16, top, right, 153, rightW);
          if (!isSelected) return;
          st(target, x + 44, top + LH, item.summary, 204, width - 60, { truncate: true });
          st(target, x + 44, top + LH * 2, `Tap · ${ACTION[item.status]}`, 153, 200);
          stRight(target, x + width - 16, top + LH * 2, 'Hold · more', 153, 160);
        },
      });
      menu.setItems(agents, selected);
      current = menu.selectedIndex;
      menu.paint(image, box, true);
      menu.drawScrollbar(image, 552, box.y, box.height);
      return image;
    },
    header(image, agent) {
      const label = threadStatusLabel(agent.status);
      const labelW = face.measureLine(label);
      st(image, 22, 14, MARK[agent.status], 255, 24);
      st(image, 44, 14, agent.title, 255, W - 44 - 22 - labelW - 24, { truncate: true });
      stRight(image, 554, 14, label, 153, labelW);
    },
    detail() {
      const image = blank();
      triage.header(image, focus);
      st(image, 44, 41, meta(focus), 153, 400);
      stWrap(image, 22, 84, detailSummary, 255, 532, 2);
      st(image, 22, 150, focus.request.label, 153, 532);
      st(image, 22, 177, focus.request.detail, 255, 532, { truncate: true });
      let x = 18;
      x += pill(image, x, 222, 'Approve', true) + 10;
      pill(image, x, 222, 'Deny', false);
      stRight(image, 554, 226, 'Scroll · full reply', 153, 260);
      return image;
    },
    full(page = 0) {
      const image = blank();
      triage.header(image, focus);
      const steps = fullReply.filter((e) => e.kind === 'activity').map((e) => e.label).join(' · ');
      const body = face.wrap(replyText, 500);
      const tail = [`${request.label} · ${request.detail}`];
      const lines = [{ text: `${fullReply.filter((e) => e.kind === 'activity').length} steps · ${steps}`, value: 102 }, ...body.map((text) => ({ text, value: 255 })), { text: '', value: 0 }, ...tail.map((text) => ({ text, value: 153 }))];
      const perPage = 7;
      const pages = Math.ceil(lines.length / perPage);
      lines.slice(page * perPage, (page + 1) * perPage).forEach((line, i) => line.text && st(image, 22, 52 + i * LH, line.text, line.value, 502, { truncate: true }));
      vbar(image, 546, 52, perPage * LH, pages, page);
      st(image, 22, 247, `${page + 1} / ${pages}`, 153, 100);
      stRight(image, 554, 247, 'Tap · approve', 255, 200);
      return image;
    },
    toast() {
      const image = v3.home().dimmed(0.25);
      image.fillRoundedRect(18, 192, 540, 82, 0, 6);
      image.drawRoundedRect(18, 192, 540, 82, 255, 6);
      const right = threadStatusLabel(focus.status);
      const rightW = face.measureLine(right);
      st(image, 34, 204, MARK[focus.status], 255, 24);
      st(image, 62, 204, focus.title, 255, 540 - 62 - rightW - 40, { truncate: 'word' });
      stRight(image, 542, 204, right, 153, rightW);
      st(image, 62, 231, focus.summary, 204, 464, { truncate: 'word' });
      return image;
    },
  };

  // ---- Direction C: Glance — the one thing now, the queue beside it --------
  const big = roboto(26), huge = roboto(30), reader = roboto(24);
  const glance = {
    list(selected = 0) {
      const image = blank();
      const agent = agents[selected];
      const nowW = 266;
      st(image, 22, 14, `${MARK[agent.status]} ${threadStatusLabel(agent.status)} · ${formatAge(agent.at, NOW)}`, 153, nowW, { truncate: true });
      st(image, 22, 45, agent.title, 255, nowW, { truncate: true });
      rtWrap(image, big, 22, 88, agent.summary, 255, nowW, 4, big.lineHeight + 2);
      st(image, 22, 247, `Tap · ${ACTION[agent.status]}`, 153, nowW);
      const panel = { x: 306, y: 14, w: 252, h: 260 };
      image.drawRoundedRect(panel.x, panel.y, panel.w, panel.h, 255, 6);
      agents.forEach((item, i) => {
        const y = panel.y + 14 + i * 44;
        const active = i === selected;
        if (active) image.fillRoundedRect(panel.x + 6, y, panel.w - 12, 40, 68, 5);
        st(image, panel.x + 18, y + 7, MARK[item.status], active ? 255 : SECTION[item.status] === 'needs' ? 255 : 153, 24);
        st(image, panel.x + 44, y + 7, item.title, active ? 255 : 153, panel.w - 44 - 16, { truncate: 'word' });
      });
      return image;
    },
    detail() {
      const image = blank();
      const label = threadStatusLabel(focus.status);
      const labelW = face.measureLine(label);
      st(image, 22, 14, focus.title, 255, W - 22 - 22 - labelW - 24, { truncate: true });
      stRight(image, 554, 14, label, 153, labelW);
      rtWrap(image, huge, 22, 56, detailSummary, 255, 532, 3, huge.lineHeight + 2);
      st(image, 22, 176, `${focus.request.label} · ${focus.request.detail}`, 153, 532, { truncate: true });
      const approveW = face.measureLine('Approve') + 44, denyW = face.measureLine('Deny') + 44;
      let x = Math.round((W - approveW - denyW - 14) / 2);
      x += pill(image, x, 222, 'Approve', true, 22) + 14;
      pill(image, x, 222, 'Deny', false, 22);
      return image;
    },
    full(page = 0) {
      const image = blank();
      const pitch = reader.lineHeight + 1;
      const perPage = Math.floor((H - 52 - 44) / pitch);
      const lines = wrapText(reader, replyText, 500);
      const pages = Math.ceil(lines.length / perPage);
      assert.ok(page < pages);
      st(image, 22, 14, focus.title, 255, 400, { truncate: true });
      stRight(image, 554, 14, `${page + 1} / ${pages}`, 153, 100);
      lines.slice(page * perPage, (page + 1) * perPage).forEach((line, i) => rt(image, reader, 22, 52 + i * pitch, line, 255, 500));
      vbar(image, 546, 52, perPage * pitch, pages, page);
      st(image, 22, 247, 'Scroll · more', 153, 200);
      stRight(image, 554, 247, 'Tap · approve', 255, 200);
      return image;
    },
    toast() {
      const image = v3.home().dimmed(0.25);
      const box = { x: 28, y: 52, w: 520, h: 184 };
      image.fillRoundedRect(box.x, box.y, box.w, box.h, 0, 6);
      image.drawRoundedRect(box.x, box.y, box.w, box.h, 102, 6);
      st(image, box.x + 22, box.y + 14, `Paseo · ${threadStatusLabel(focus.status)} · ${focus.project}`, 153, box.w - 44, { truncate: true });
      rtWrap(image, big, box.x + 22, box.y + 48, focus.summary, 255, box.w - 44, 3, big.lineHeight + 2);
      st(image, box.x + 22, box.y + box.h - 40, `Tap · ${ACTION[focus.status]}`, 153, 200);
      stRight(image, box.x + box.w - 22, box.y + box.h - 40, 'Double tap · dismiss', 153, 260);
      return image;
    },
  };

  save(deck.list(0), 'deck-list');
  save(deck.list(3), 'deck-list-recent');
  save(deck.detail(), 'deck-detail');
  save(deck.full(0), 'deck-full');
  save(deck.toast(), 'deck-toast');
  save(triage.list(0), 'triage-list');
  save(triage.list(3), 'triage-list-recent');
  save(triage.detail(), 'triage-detail');
  save(triage.full(0), 'triage-full');
  save(triage.full(1), 'triage-full-2');
  save(triage.toast(), 'triage-toast');
  save(glance.list(0), 'glance-list');
  save(glance.list(3), 'glance-list-recent');
  save(glance.detail(), 'glance-detail');
  save(glance.full(0), 'glance-full');
  save(glance.toast(), 'glance-toast');
  for (const file of written) console.log(file);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
