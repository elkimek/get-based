#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'rolldown';
import {compile} from 'svelte/compiler';
import {MARKER_SCHEMA} from '../js/marker-schema.js';
import {projectDemoFixture} from './readonly-demo-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEMO_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export async function buildReadonlyDemo(directory = path.join(ROOT, 'artifacts/public-demo')) {
  const profiles = await Promise.all((['female', 'male'] as const).map(async id => projectDemoFixture(id,
    JSON.parse(await fs.readFile(path.join(ROOT, `data/demo-${id}.json`), 'utf8')) as Parameters<typeof projectDemoFixture>[1], MARKER_SCHEMA)));
  const component = path.join(ROOT, 'js/components/ReadonlyDemo.svelte');
  const entry = path.join(ROOT, 'js/readonly-demo-entry.js');
  const result = await build({input: 'getbased:public-demo-entry', platform: 'browser', write: false,
    plugins: [{name: 'readonly-public-demo',
      resolveId(id) {
        if (id === 'getbased:public-demo-entry') return id;
        if (id.endsWith('/ReadonlyDemo.svelte.native.js')) return 'getbased:demo-component';
        return null;
      },
      async load(id) {
        if (id === 'getbased:public-demo-entry') return `import {mountReadonlyDemo} from ${JSON.stringify(entry)}; mountReadonlyDemo(${JSON.stringify(profiles)});`;
        if (id === 'getbased:demo-component') return `export {default} from ${JSON.stringify(component)}; export {mount} from 'svelte';`;
        if (id !== component) return null;
        const compiled = compile(await fs.readFile(component, 'utf8'), {filename: component, generate: 'client', css: 'external', dev: false});
        if (compiled.warnings.length || compiled.css?.code) throw new Error('The dedicated demo must compile without warnings or component CSS.');
        return compiled.js.code;
      },
    }], output: {format: 'es', codeSplitting: false, minify: true, entryFileNames: 'demo.js'}});
  const chunks = result.output.filter(item => item.type === 'chunk');
  if (chunks.length !== 1 || result.output.length !== 1) throw new Error('Expected one standalone demo bundle.');
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Explore getbased with fictional health data. Install it yourself to use your own records."><meta name="robots" content="noindex"><title>getbased — sample data demo</title><link rel="stylesheet" href="/demo.css"></head><body><div id="demo-root"></div><noscript>This demo needs JavaScript to switch between fictional sample views. <a href="https://docs.getbased.health/guides/self-hosting">Read the installation guide</a>.</noscript><script type="module" src="/demo.js"></script></body></html>\n';
  const files = new Map<string, string | Buffer>([
    ['index.html', html], ['demo.js', chunks[0]!.code],
    ['demo.css', await fs.readFile(path.join(ROOT, 'css/readonly-demo.css'))],
    ['inter.woff2', await fs.readFile(path.join(ROOT, 'vendor/fonts/inter-400.woff2'))],
    ['outfit.woff2', await fs.readFile(path.join(ROOT, 'vendor/fonts/outfit-700.woff2'))],
    ['vercel.json', JSON.stringify({version: 2, headers: [{source: '/(.*)', headers: [
      {key: 'Content-Security-Policy', value: DEMO_CSP}, {key: 'X-Content-Type-Options', value: 'nosniff'},
      {key: 'Referrer-Policy', value: 'no-referrer'}, {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
      {key: 'Cache-Control', value: 'public, max-age=0, must-revalidate'},
    ]}]}, null, 2) + '\n'],
  ]);
  await fs.mkdir(directory, {recursive: true});
  const allowed = new Set([...files.keys(), 'artifact-manifest.json', '.vercel', '.gitignore']);
  for (const name of await fs.readdir(directory)) if (!allowed.has(name)) throw new Error('Refusing mixed demo output: ' + name);
  for (const [name, bytes] of files) await fs.writeFile(path.join(directory, name), bytes);
  const manifest = {schemaVersion: 1, kind: 'fictional-readonly-demo', files: [...files].map(([name, bytes]) => ({path: name, bytes: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex')}))};
  await fs.writeFile(path.join(directory, 'artifact-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv.indexOf('--output');
  const directory = output >= 0 ? path.resolve(process.argv[output + 1]!) : undefined;
  console.log(JSON.stringify(await buildReadonlyDemo(directory)));
}
