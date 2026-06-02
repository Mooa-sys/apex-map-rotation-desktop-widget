import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const svgToIco = require('svg-to-ico');

const inputName = ['build/icon.svg', 'build/icon_256.svg', 'build/icon_128.svg']
  .map((path) => resolve(path))
  .find((path) => existsSync(path));
const outputName = resolve('build/icon.ico');

if (!inputName) {
  throw new Error('Missing icon source: build/icon.svg or build/icon_256.svg');
}

await svgToIco({
  input_name: inputName,
  output_name: outputName,
  sizes: [16, 32, 48, 64, 128, 256]
});

console.log(`Generated ${outputName}`);
