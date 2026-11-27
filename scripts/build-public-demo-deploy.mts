#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PUBLIC_DEMO_APP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export async function buildPublicDemoAppDeploy(
  sourceDir = path.join(ROOT, 'dist'),
  outputDir = path.join(ROOT, 'artifacts/public-demo-app'),
) {
  const indexStat = await fs.stat(path.join(sourceDir, 'index.html')).catch(() => null);
  if (!indexStat?.isFile()) {
    throw new Error('dist/index.html is missing. Run npm run production:build first.');
  }
  await fs.mkdir(outputDir, {recursive: true});
  const keep = new Set(['.vercel', '.gitignore', '.env.local']);
  for (const entry of await fs.readdir(outputDir)) {
    if (keep.has(entry)) continue;
    await fs.rm(path.join(outputDir, entry), {recursive: true, force: true});
  }
  await fs.cp(sourceDir, outputDir, {recursive: true});

  const demoVercelConfig = {
    version: 2,
    routes: [
      {
        src: '^/_app/immutable/(.*)$',
        headers: {'Cache-Control': 'public, max-age=31536000, immutable'},
        continue: true,
      },
      {
        src: '^/js/bundle-.*\\.js$',
        headers: {'Cache-Control': 'public, max-age=31536000, immutable'},
        continue: true,
      },
      {
        src: '/(.*)',
        headers: {
          'Content-Security-Policy': PUBLIC_DEMO_APP_CSP,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        },
        continue: true,
      },
      {src: '^/app/?$', dest: '/index.html'},
    ],
  };
  await fs.writeFile(path.join(outputDir, 'vercel.json'), JSON.stringify(demoVercelConfig, null, 2) + '\n');
  return {outputDir, csp: PUBLIC_DEMO_APP_CSP};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output');
  const outputDir = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]!) : undefined;
  console.log(JSON.stringify(await buildPublicDemoAppDeploy(undefined, outputDir)));
}
