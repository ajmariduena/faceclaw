const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics } = context;

const outDir = path.join(__dirname, 'out');
const W = 576;
const H = 288;
const PITCH = 27;
const FOOTER_TOP = H - 4 - 40;
const CONTENT_BOTTOM = FOOTER_TOP - 8;
const DICTATION = 'Perfecto, haz el merge cuando pase el check';

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(file);
}

async function main() {
  const face = await stockFont(graphics);
  const text = (image, x, y, label, value, width) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    assert.ok(y >= 8 && y + PITCH <= CONTENT_BOTTOM + 4 || y >= FOOTER_TOP, `outside: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const wrap = (label, width) => {
    const lines = [];
    let line = '';
    for (const word of label.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (face.measureLine(next) <= width) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    assert.ok(lines.every((l) => face.measureLine(l) <= width), `unwrappable: ${label}`);
    return lines;
  };
  const frame = () => {
    const image = new graphics.GrayImage(W, H);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    return image;
  };
  const footer = (image, f, left, right, joined = false) => {
    image.fillRect(14, FOOTER_TOP, 548, 1, 119);
    if (joined) text(image, left, FOOTER_TOP + 8, `${f.left}  ${f.right}`, 119, 400);
    else {
      text(image, left, FOOTER_TOP + 8, f.left, 119, 300);
      text(image, right - face.measureLine(f.right), FOOTER_TOP + 8, f.right, 119, 200);
    }
  };
  // Keeps whole blocks only, newest first, until the next one would not fit.
  const fit = (blocks, avail, gap) => {
    const shown = [];
    let used = 0;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const g = shown.length ? gap(blocks[i], shown[0]) : 0;
      if (used + blocks[i].height + g > avail) break;
      shown.unshift(blocks[i]);
      used += blocks[i].height + g;
    }
    assert.ok(shown.length >= 1, 'nothing fits');
    return { shown, used };
  };
  const place = (blocks, top, bottom, gap, anchor) => {
    const { shown, used } = fit(blocks, bottom - top, gap);
    let y = anchor === 'bottom' ? bottom - used : top;
    shown.forEach((block, i) => {
      if (i) y += gap(shown[i - 1], block);
      block.draw(y);
      assert.ok(y + block.height <= bottom, 'block overlaps footer');
      y += block.height;
    });
  };
  const tag = (entries) => entries.map((e, i) => ({ ...e, latest: i === entries.length - 1 }));

  // A · Prompt: the user's turn is a "> " shell line, replies indent under it; exchanges breathe.
  const prompt = (entries, f) => {
    const image = frame();
    const left = 22, right = 554, indent = 22;
    const blocks = tag(entries).map((e) => {
      const lines = wrap(e.text, right - left - indent);
      const value = e.kind === 'you' ? (e.live ? 255 : 153) : e.latest ? 255 : 187;
      return {
        kind: e.kind, height: lines.length * PITCH,
        draw(y) {
          if (e.kind === 'you') text(image, left, y, '>', value, indent);
          lines.forEach((line, i) => text(image, left + indent, y + i * PITCH, line, value, right - left - indent));
        },
      };
    });
    place(blocks, 16, CONTENT_BOTTOM, (a, b) => (b.kind === 'you' ? 26 : 12), 'bottom');
    footer(image, f, left, right);
    return image;
  };

  // B · Ledger: a dim speaker column on the left, text in a second column, like a script.
  const ledger = (entries, f) => {
    const image = frame();
    const left = 22, right = 554, col = 94;
    const blocks = tag(entries).map((e) => {
      const lines = wrap(e.text, right - left - col);
      const value = e.kind === 'you' ? (e.live ? 255 : 170) : e.latest ? 255 : 187;
      return {
        kind: e.kind, height: lines.length * PITCH,
        draw(y) {
          text(image, left, y, e.kind === 'you' ? 'You' : 'Agent', e.live || e.latest ? 153 : 102, col - 8);
          lines.forEach((line, i) => text(image, left + col, y + i * PITCH, line, value, right - left - col));
        },
      };
    });
    place(blocks, 16, CONTENT_BOTTOM, () => 18, 'top');
    footer(image, f, left, right, true);
    return image;
  };

  // C · Bubble: the user's turn right-aligned inside a dim pill that lights up while dictating.
  const bubble = (entries, f) => {
    const image = frame();
    const left = 30, right = 546, pad = 12;
    const blocks = tag(entries).map((e) => {
      const you = e.kind === 'you';
      const lines = wrap(e.text, you ? right - left - 80 - pad * 2 : right - left);
      const value = you ? (e.live ? 255 : 170) : e.latest ? 255 : 187;
      const widest = Math.max(...lines.map((l) => face.measureLine(l)));
      return {
        kind: e.kind, height: lines.length * PITCH + (you ? 10 : 0),
        draw(y) {
          if (you) {
            const w = widest + pad * 2;
            image.drawRoundedRect(right - w, y, w, lines.length * PITCH + 10, e.live ? 255 : 119, 10);
            lines.forEach((line, i) => text(image, right - pad - face.measureLine(line), y + 5 + i * PITCH, line, value, w));
          } else lines.forEach((line, i) => text(image, left, y + i * PITCH, line, value, right - left));
        },
      };
    });
    place(blocks, 16, CONTENT_BOTTOM, () => 20, 'bottom');
    footer(image, f, left, right);
    return image;
  };

  // D · Bars: every turn carries a 3 px gutter bar; only the newest is bright, older ones fade.
  const bars = (entries, f) => {
    const image = frame();
    const left = 22, right = 554, gutter = 16;
    const blocks = tag(entries).map((e) => {
      const lines = wrap(e.text, right - left - gutter);
      const bright = e.latest;
      const value = e.kind === 'you' ? (bright ? 255 : 153) : bright ? 255 : 187;
      const bar = bright ? 255 : e.kind === 'you' ? 119 : 153;
      return {
        kind: e.kind, height: lines.length * PITCH,
        draw(y) {
          image.fillRect(left, y + 3, 3, lines.length * PITCH - 6, bar);
          lines.forEach((line, i) => text(image, left + gutter, y + i * PITCH, line, value, right - left - gutter));
        },
      };
    });
    place(blocks, 16, CONTENT_BOTTOM, () => 16, 'bottom');
    footer(image, f, left, right, true);
    return image;
  };

  // D2 · Bars, with the user's turns right-aligned and their bar on the right edge.
  const barsright = (entries, f) => {
    const image = frame();
    const left = 22, right = 554, gutter = 16;
    const blocks = tag(entries).map((e) => {
      const you = e.kind === 'you';
      const lines = wrap(e.text, right - left - gutter - (you ? 64 : 0));
      const bright = e.latest;
      const value = you ? (bright ? 255 : 153) : bright ? 255 : 187;
      const bar = bright ? 255 : you ? 119 : 153;
      return {
        kind: e.kind, height: lines.length * PITCH,
        draw(y) {
          image.fillRect(you ? right - 3 : left, y + 3, 3, lines.length * PITCH - 6, bar);
          lines.forEach((line, i) => {
            const x = you ? right - gutter - face.measureLine(line) : left + gutter;
            text(image, x, y + i * PITCH, line, value, right - left - gutter);
          });
        },
      };
    });
    place(blocks, 16, CONTENT_BOTTOM, () => 16, 'bottom');
    footer(image, f, left, right, true);
    return image;
  };

  // H · Horizontal separators instead of bars; the user's turns stay right-aligned.
  const rules = (style) => (entries, f) => {
    const image = frame();
    const left = 22, right = 554, gap = style === 'latest' ? 26 : 22;
    const blocks = tag(entries).map((e) => {
      const you = e.kind === 'you';
      const lines = wrap(e.text, right - left - (you ? 64 : 0));
      const bright = e.latest;
      const value = you ? (bright ? 255 : 153) : bright ? 255 : 187;
      return {
        kind: e.kind, latest: bright, height: lines.length * PITCH,
        draw(y) {
          lines.forEach((line, i) => text(image, you ? right - face.measureLine(line) : left, y + i * PITCH, line, value, right - left));
          if (style === 'under' && you) {
            const w = Math.max(...lines.map((l) => face.measureLine(l)));
            image.fillRect(right - w, y + lines.length * PITCH - 2, w, 1, bright ? 255 : 119);
          }
        },
      };
    });
    const { shown, used } = fit(blocks, CONTENT_BOTTOM - 16, () => gap);
    let y = CONTENT_BOTTOM - used;
    shown.forEach((block, i) => {
      if (i > 0) {
        const mid = y - Math.round(gap / 2) - 1;
        if (style === 'full') image.fillRect(14, mid, 548, 1, 85);
        if (style === 'short') image.fillRect(288 - 24, mid, 48, 1, 136);
        if (style === 'latest' && block.latest) image.fillRect(14, mid, 548, 1, 119);
        if (style === 'side') {
          const you = block.kind === 'you';
          image.fillRect(you ? 562 - 160 : 14, mid, 160, 1, 119);
        }
      }
      block.draw(y);
      y += block.height + gap;
    });
    footer(image, f, left, right);
    return image;
  };

  // E · Card: whatever is current (the newest reply, or the dictation) sits in an outlined card above the footer; history fades above it.
  const card = (entries, f) => {
    const image = frame();
    const left = 22, right = 554, pad = 12;
    const tagged = tag(entries);
    const current = tagged[tagged.length - 1];
    const lines = wrap(current.text, right - left - pad * 2);
    const cardH = lines.length * PITCH + pad * 2 - 4;
    const cardTop = CONTENT_BOTTOM - cardH;
    image.drawRoundedRect(14, cardTop, 548, cardH, 255, 8);
    lines.forEach((line, i) => text(image, left + (current.kind === 'you' ? pad + 22 : pad), cardTop + pad - 2 + i * PITCH, line, 255, right - left - pad * 2));
    if (current.kind === 'you') text(image, left + pad, cardTop + pad - 2, '>', 255, 22);
    const blocks = tagged.slice(0, -1).map((e) => {
      const you = e.kind === 'you';
      const ls = wrap(e.text, right - left - (you ? 60 : 0));
      const value = you ? 153 : 170;
      return {
        kind: e.kind, height: ls.length * PITCH,
        draw(y) { ls.forEach((line, i) => text(image, you ? right - face.measureLine(line) : left, y + i * PITCH, line, value, right - left)); },
      };
    });
    place(blocks, 16, cardTop - 14, () => 10, 'bottom');
    footer(image, f, left, right);
    return image;
  };

  const real = JSON.parse(fs.readFileSync(process.env.PASEO_REAL ?? '/tmp/paseo-real-voces.json', 'utf8'));
  const session = real.sessions[0];
  const chat = session.entries.filter((e) => e.kind !== 'step').map((e) => ({ kind: e.kind, text: e.text }));
  const minutes = Math.max(1, Math.round((Date.parse(session.updatedAt) - Date.parse(session.activeSince)) / 60000));
  const scenes = [
    { suffix: 'chat', entries: chat, footer: { left: '· Working', right: `${minutes}m` } },
    { suffix: 'dictating', entries: [...chat, { kind: 'you', text: DICTATION, live: true }], footer: { left: '· Listening', right: '0:04' } },
  ];
  const options = { prompt, ledger, bubble, bars, barsright, card, rulesfull: rules('full'), rulesshort: rules('short'), ruleslatest: rules('latest'), rulesside: rules('side'), rulesunder: rules('under') };
  for (const [name, render] of Object.entries(options)) {
    for (const scene of scenes) save(render(scene.entries, scene.footer), `paseo-chat-fable-${name}-${scene.suffix}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
