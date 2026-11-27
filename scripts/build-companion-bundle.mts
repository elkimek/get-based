#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { build } from 'rolldown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_COMPANION_BUNDLE_BYTES = 250_000;

export async function buildCompanionBundle({ outputRoot = ROOT }: { outputRoot?: string } = {}) {
  const pinnedUpdateKey = process.env.GETBASED_COMPANION_UPDATE_PUBLIC_KEY || '';
  const signingPem = process.env.GETBASED_COMPANION_SIGNING_PRIVATE_KEY || '';
  const signingKey = signingPem ? createPrivateKey(signingPem) : null;
  if (signingKey) {
    const pinnedKey = pinnedUpdateKey ? createPublicKey(pinnedUpdateKey) : null;
    if (signingKey.asymmetricKeyType !== 'ed25519' || !pinnedKey
        || !createPublicKey(signingKey).export({ type: 'spki', format: 'der' })
          .equals(pinnedKey.export({ type: 'spki', format: 'der' }))) {
      throw new Error('The Companion signing key must match the pinned Ed25519 update key.');
    }
  }
  await fs.mkdir(outputRoot, { recursive: true });
  const result = await build({
    input: path.join(ROOT, 'bin', 'getbased-companion.js'),
    platform: 'node',
    external: id => id.startsWith('node:'),
    transform: { define: { 'process.env.GETBASED_COMPANION_UPDATE_PUBLIC_KEY': JSON.stringify(pinnedUpdateKey) } },
    output: {
      dir: outputRoot,
      format: 'es',
      codeSplitting: false,
      entryFileNames: 'getbased-companion.mjs',
      // Compact whitespace without changing identifiers or enabling compression.
      minify: { compress: false, mangle: false, codegen: { removeWhitespace: true } },
    },
  });
  const chunks = result.output.filter(item => item.type === 'chunk');
  if (chunks.length !== 1 || chunks[0]!.fileName !== 'getbased-companion.mjs') {
    throw new Error('Companion build must emit exactly one getbased-companion.mjs file.');
  }
  const outputPath = path.join(outputRoot, chunks[0]!.fileName);
  const bundle = Buffer.from(chunks[0]!.code);
  if (bundle.byteLength > MAX_COMPANION_BUNDLE_BYTES) {
    throw new Error(`Companion bundle ${bundle.byteLength} bytes exceeds ${MAX_COMPANION_BUNDLE_BYTES}.`);
  }
  await fs.chmod(outputPath, 0o755);
  const signaturePath = outputPath + '.sig';
  if (signingKey) {
    const signature = sign(null, bundle, signingKey);
    await fs.writeFile(signaturePath, signature.toString('base64') + '\n');
  } else {
    await fs.rm(signaturePath, { force: true });
  }
  return { outputPath, bytes: bundle.byteLength };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildCompanionBundle();
  process.stdout.write(`Built ${path.basename(result.outputPath)} (${result.bytes} bytes)\n`);
}
