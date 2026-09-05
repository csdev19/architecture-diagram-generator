/// <reference types="@types/bun" />
/**
 * Prints a registry `art` entry from any SVG.
 *
 *   bun run icon:add angular ./angular.svg
 *   curl -s https://api.iconify.design/logos/hono.svg | bun run icon:add hono
 *
 * It prints and does not write: the curator still pastes the entry into
 * `diagram-icons.ts`, looks at the result at 32px on both tiles, and sets
 * `onDark`. Deciding that by eye is the one step a script cannot do.
 */
import { normaliseIconArt } from "../src/tooling/icon-art";

const [key, file] = process.argv.slice(2);

if (!key || !/^[a-z0-9]+$/.test(key)) {
  console.error("usage: bun run icon:add <key> [file.svg]   (reads stdin without a file)");
  console.error("       <key> is the registry key: lowercase letters and digits only");
  process.exit(1);
}

const source = file ? await Bun.file(file).text() : await Bun.stdin.text();
const { viewBox, body } = normaliseIconArt(key, source);

console.log(`  ${key}: {`);
console.log(`    ...toDiagramIcon(si${key[0]!.toUpperCase()}${key.slice(1)}),`);
console.log(`    art: {`);
console.log(`      viewBox: ${JSON.stringify(viewBox)},`);
console.log(`      body:`);
console.log(`        ${JSON.stringify(body)},`);
console.log(`      // Looked at on the dark tile at 32px: true if it reads there.`);
console.log(`      onDark: true,`);
console.log(`    },`);
console.log(`  },`);
