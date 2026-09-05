#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_COMPANION_BUNDLE_BYTES = 250_000;

export async function buildCompanionBundle({ outputRoot = ROOT } = {}) {
  await fs.mkdir(outputRoot, { recursive: true });
  const result = await build({
    input: path.join(ROOT, 'bin', 'getbased-companion.js'),
    platform: 'node',
    external: id => id.startsWith('node:'),
    output: {
      dir: outputRoot,
      format: 'es',
      codeSplitting: false,
      entryFileNames: 'getbased-companion.mjs',
      minify: false,
    },
  });
  const chunks = result.output.filter(item => item.type === 'chunk');
  if (chunks.length !== 1 || chunks[0].fileName !== 'getbased-companion.mjs') {
    throw new Error('Companion build must emit exactly one getbased-companion.mjs file.');
  }
  const outputPath = path.join(outputRoot, chunks[0].fileName);
  const stat = await fs.stat(outputPath);
  if (stat.size > MAX_COMPANION_BUNDLE_BYTES) {
    throw new Error(`Companion bundle ${stat.size} bytes exceeds ${MAX_COMPANION_BUNDLE_BYTES}.`);
  }
  await fs.chmod(outputPath, 0o755);
  return { outputPath, bytes: stat.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildCompanionBundle();
  process.stdout.write(`Built ${path.basename(result.outputPath)} (${result.bytes} bytes)\n`);
}
