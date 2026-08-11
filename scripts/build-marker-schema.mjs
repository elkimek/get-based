#!/usr/bin/env node

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MARKER_SCHEMA } from '../js/marker-schema/index.js';

const TARGET_PATH = fileURLToPath(new URL('../js/marker-schema.js', import.meta.url));

export function renderMarkerSchema() {
  return `// @ts-check\n`
    + `// Generated from js/marker-schema/index.js. Run npm run marker-schema:build; do not edit.\n\n`
    + `export const MARKER_SCHEMA = ${JSON.stringify(MARKER_SCHEMA)};\n`;
}

const rendered = renderMarkerSchema();
if (process.argv.includes('--write')) {
  fs.writeFileSync(TARGET_PATH, rendered);
  console.log('Updated js/marker-schema.js');
} else if (fs.readFileSync(TARGET_PATH, 'utf8') !== rendered) {
  console.error('js/marker-schema.js is stale; run npm run marker-schema:build');
  process.exitCode = 1;
} else {
  console.log('Marker schema runtime catalog is current.');
}
