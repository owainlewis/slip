/**
 * Regenerates the GLYPH_WIDTHS table in packages/core/src/renderer.ts.
 *
 * The headline fitter needs to know how wide a line will be before satori lays
 * it out, so the advance widths are read straight from the shipped font files
 * and baked in. Run this after upgrading @fontsource/newsreader and paste the
 * output over the existing table.
 *
 *   node scripts/glyph-widths.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/core/package.json", import.meta.url));
const opentype = await import("@shuding/opentype.js");

function load(specifier) {
  const bytes = readFileSync(require.resolve(specifier));
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

const faces = [
  load("@fontsource/newsreader/files/newsreader-latin-400-normal.woff"),
  load("@fontsource/newsreader/files/newsreader-latin-400-italic.woff")
];

let characters = "";
for (let code = 32; code < 127; code += 1) characters += String.fromCharCode(code);
characters += "’‘“”–—…";

// Widest of the roman and italic, so an italic phrase can never outgrow the box.
const byWidth = new Map();
for (const character of characters) {
  const width = Math.max(
    ...faces.map((face) => face.charToGlyph(character).advanceWidth / face.unitsPerEm)
  );
  const key = width.toFixed(3);
  byWidth.set(key, (byWidth.get(key) ?? "") + character);
}

const rows = [...byWidth.entries()]
  .sort((left, right) => Number(left[0]) - Number(right[0]))
  .map(([width, chars]) => `[${Number(width)}, ${JSON.stringify(chars)}]`);

process.stdout.write(`const GLYPH_WIDTHS: ReadonlyArray<readonly [number, string]> = [\n`);
for (let index = 0; index < rows.length; index += 6) {
  process.stdout.write(`  ${rows.slice(index, index + 6).join(", ")},\n`);
}
process.stdout.write(`];\n`);
