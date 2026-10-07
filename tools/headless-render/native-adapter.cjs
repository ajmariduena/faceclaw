const path = require('node:path');
const assert = require('node:assert/strict');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

exports.createNativeAdapter = (root) => {
  const fontPath = path.join(root, 'app/fonts/ttf/Roboto-Light.ttf');
  assert.ok(GlobalFonts.registerFromPath(fontPath, 'HomeRoboto'), 'Roboto Light must load');
  const contexts = new Map();
  const context = (size) => {
    if (!contexts.has(size)) {
      const ctx = createCanvas(size * 4, size * 4).getContext('2d');
      ctx.font = `${size}px HomeRoboto`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      contexts.set(size, ctx);
    }
    return contexts.get(size);
  };
  const metrics = (size) => {
    const m = context(size).measureText('Hg');
    return [Math.ceil(m.fontBoundingBoxAscent), Math.ceil(m.fontBoundingBoxDescent)];
  };
  const fontRenderer = {
    getFontMetrics: (_path, size) => [...metrics(size), 0].join(' '),
    measureTextExact: (_path, text, size) => context(size).measureText(text).width,
    renderGlyphCell: (_path, size, cp, gamma) => {
      const ctx = context(size);
      const text = String.fromCodePoint(cp);
      const m = ctx.measureText(text);
      const [ascent] = metrics(size);
      const left = -Math.ceil(m.actualBoundingBoxLeft);
      const top = Math.ceil(m.actualBoundingBoxAscent);
      const width = Math.max(0, Math.ceil(m.actualBoundingBoxRight) - left);
      const height = Math.max(0, top + Math.ceil(m.actualBoundingBoxDescent));
      const bytes = Buffer.alloc(10 + width * height);
      // The native bridge ABI is a 10-byte LE header followed by 8-bit coverage.
      bytes.writeUInt16LE(Math.round(m.width * 64), 0);
      bytes.writeInt16LE(left, 2);
      bytes.writeInt16LE(ascent - top, 4);
      bytes.writeUInt16LE(width, 6);
      bytes.writeUInt16LE(height, 8);
      if (width && height) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillText(text, -left, top);
        const rgba = ctx.getImageData(0, 0, width, height).data;
        for (let i = 0; i < width * height; i++) bytes[10 + i] = Math.round(255 * (rgba[i * 4 + 3] / 255) ** gamma);
      }
      return bytes;
    },
  };
  const svgs = new Map();
  return {
    fontPath,
    fontRenderer,
    async prepareIcons(sources) {
      await Promise.all(sources.map(async (svg) => {
        const styled = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ');
        svgs.set(svg, await loadImage(Buffer.from(styled)));
      }));
    },
    rasterizeSvg(svg, size, strokeWidth, GrayImage) {
      assert.equal(strokeWidth, 2);
      assert.ok(svgs.has(svg), 'SVG must be preloaded');
      const ctx = createCanvas(size, size).getContext('2d');
      ctx.drawImage(svgs.get(svg), 0, 0, size, size);
      const rgba = ctx.getImageData(0, 0, size, size).data;
      const image = new GrayImage(size, size);
      for (let i = 0; i < image.pixels.length; i++) image.pixels[i] = rgba[i * 4 + 3];
      assert.ok(image.pixels.some((value) => value > 0), 'SVG must have visible ink');
      return image;
    },
  };
};
