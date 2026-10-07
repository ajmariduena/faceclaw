const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
process.env.NODE_PATH = path.join(__dirname, 'node_modules');
require('node:module').Module._initPaths();
const { loader } = require('../../tests/helpers/load-typescript.cjs');

const assetPath = path.join(__dirname, 'out/local-fonts/evenhub-firmware-20.json');

function extract(firmwarePath) {
  const load = loader({ DataView, ArrayBuffer });
  const firmware = fs.readFileSync(firmwarePath);
  const expected = load('app/g2/firmware/cfw-patches.ts').CFW_PATCH_SET.baseSha256;
  const actual = crypto.createHash('sha256').update(firmware).digest('hex');
  if (actual !== expected) throw new Error('Firmware SHA-256 does not match the fork base');
  const asset = load('app/g2/firmware-fonts.ts').extractEvenHubFontAsset(firmware.buffer.slice(firmware.byteOffset, firmware.byteOffset + firmware.byteLength));
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  fs.writeFileSync(assetPath, JSON.stringify(asset));
  return { path: assetPath, sha256: actual, glyphs: Object.keys(asset.glyphs).length };
}

async function stockFont(graphics) {
  if (!fs.existsSync(assetPath)) throw new Error('Extract the local font first: node stock-font.cjs /path/to/verified-EVENOTA.bin');
  const pretext = await import('@evenrealities/pretext');
  const load = loader({}, {
    '@nativescript/core': {
      File: { exists: fs.existsSync, fromPath: p => ({ readTextSync: () => fs.readFileSync(p, 'utf8') }) },
      knownFolders: { documents: () => ({ path: path.dirname(assetPath) }), currentApp: () => ({ getFile: p => ({ path: p }) }) },
    },
    '@evenrealities/pretext': pretext,
    '../native/lvgl-font': { lvglMetrics: () => [27, 22], lvglGlyph: () => null },
    './image': graphics,
    './ttf-font': { TtfFont: {} },
  });
  return load('app/graphics/evenhub-font.ts').EvenHubFont.get();
}

if (require.main === module) console.log(JSON.stringify(extract(process.argv[2])));
module.exports = { stockFont, extract };
