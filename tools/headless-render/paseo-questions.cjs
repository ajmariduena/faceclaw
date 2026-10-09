const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const { graphics } = createRenderContext();
const PITCH = 27;
const FOOTER_TOP = 288 - 4 - 40;

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  const file = path.join(__dirname, 'out', `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(file);
}

async function main() {
  const face = await stockFont(graphics);
  const text = (image, x, y, label, value, width) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    assert.ok(y + PITCH <= 288, `outside: ${label}`);
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
    return lines;
  };
  const frame = (footer) => {
    const image = new graphics.GrayImage(576, 288);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    image.fillRect(14, FOOTER_TOP, 548, 1, 119);
    text(image, 22, FOOTER_TOP + 8, footer.left, 119, 300);
    if (footer.right) text(image, 554 - face.measureLine(footer.right), FOOTER_TOP + 8, footer.right, 119, 220);
    return image;
  };
  // Choices sit in the same nested box as permissions; ">" marks the ring selection.
  const choiceBox = (image, top, question, options, selected, opts = {}) => {
    const bottom = FOOTER_TOP - 8;
    image.drawRoundedRect(14, top, 548, bottom - top, 255, 6);
    let y = top + 8;
    for (const line of wrap(question, 516)) { text(image, 28, y, line, 255, 516); y += PITCH; }
    options.forEach((option, i) => {
      const active = i === selected;
      if (active) text(image, 28, y, '>', 255, 20);
      const mark = opts.multi && option.check !== undefined ? (option.check ? '[x] ' : '[ ] ') : '';
      text(image, 48, y, `${mark}${option.label}`, active ? 255 : 136, 500);
      y += PITCH;
      if (active && option.detail) { text(image, 48, y, option.detail, 119, 500); y += PITCH; }
    });
    assert.ok(y <= bottom + 4, `choice box overflow: ${question}`);
  };

  {
    const image = frame({ left: '· Question', right: '1/2' });
    text(image, 22, 14, 'Necesito dos decisiones antes de seguir.', 187, 532);
    choiceBox(image, 50, '¿Dónde guardamos los casos?', [
      { label: 'Postgres', detail: 'La misma base del directorio' },
      { label: 'SQLite' },
      { label: 'Other…' },
    ], 0);
    save(image, 'paseo-q-single');
  }
  {
    const image = frame({ left: '· Question', right: '2/2' });
    choiceBox(image, 14, '¿Qué canales unificamos primero?', [
      { label: 'WhatsApp', check: true },
      { label: 'Correo', check: true },
      { label: 'Slack', check: false },
      { label: 'Submit' },
    ], 2, { multi: true });
    save(image, 'paseo-q-multi');
  }
  {
    const image = frame({ left: '· Listening', right: '0:03' });
    choiceBox(image, 14, '¿Cómo llamamos al nuevo servicio?', [
      { label: 'casos-api' },
      { label: 'tickets' },
      { label: 'Other…' },
    ], 2);
    text(image, 554 - face.measureLine('Ponle soporte-hub'), 186, 'Ponle soporte-hub', 255, 500);
    save(image, 'paseo-q-other');
  }
  {
    const image = frame({ left: '· Plan', right: '6 steps' });
    let y = 14;
    for (const line of wrap('Unificar tickets en Casos: migrar WhatsApp y correo, vincular por empresa y desplegar detrás de un flag.', 532)) {
      text(image, 22, y, line, 255, 532);
      y += PITCH;
    }
    choiceBox(image, 128, 'Approve this plan?', [
      { label: 'Approve plan' },
      { label: 'Keep planning' },
    ], 0);
    save(image, 'paseo-plan');
  }
  {
    const image = frame({ left: '· Plan', right: '3/6' });
    const steps = [
      '1. Crear tabla de casos y vínculos por empresa.',
      '2. Migrar los tickets de WhatsApp.',
      '3. Migrar los hilos de correo.',
      '4. Resolver la empresa por nombre o dominio.',
      '5. Pruebas con 50 pares reales.',
      '6. Desplegar detrás de un flag.',
    ];
    steps.forEach((step, i) => text(image, 22, 14 + i * 36, step, i === 2 ? 255 : 170, 532));
    save(image, 'paseo-plan-steps');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
