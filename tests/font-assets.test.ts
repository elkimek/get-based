import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import {afterEach, expect, it} from 'vitest';
import {planPrecacheFontAssets, selectPrecacheFontAssets} from '../scripts/font-assets.mjs';
import {applyNativeFontPrecache} from '../scripts/native-precache-fonts.mjs';
import {parseAppShellEntries,summarizeAppShell} from '../scripts/app-shell-budget.mjs';
import {readServiceWorkerSource} from '../scripts/service-worker-source.js';

const directories: string[] = [];
afterEach(async () => {await Promise.all(directories.splice(0).map(directory => fs.rm(directory, {recursive: true, force: true})));});
const face = (name: string) => `@font-face{font-family:Example;font-weight:400;src:url('./${name}.woff2') format('woff2')}`;
async function fixture(css = face('regular')) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-font-assets-')); directories.push(root);
  const directory = path.join(root, 'vendor/fonts'); await fs.mkdir(directory, {recursive: true});
  await fs.writeFile(path.join(directory, 'fonts.css'), css);
  for (const [name, body] of [['regular', 'same-font'], ['bold', 'same-font'], ['unique', 'other-font']]) {
    await fs.writeFile(path.join(directory, `${name}.woff2`), body!);
  }
  return root;
}
const urls = ['/app', '/vendor/fonts/fonts.css', '/vendor/fonts/regular.woff2', '/vendor/fonts/bold.woff2', '/vendor/fonts/unique.woff2'];

it('precaches every referenced font and unique asset while leaving duplicate aliases public', async () => {
  const root = await fixture();
  expect(await selectPrecacheFontAssets(urls, root)).toEqual(urls.filter(url => !url.endsWith('/bold.woff2')));
  expect(await fs.readFile(path.join(root, 'vendor/fonts/bold.woff2'), 'utf8')).toBe('same-font');
});
it('keeps even identical files when both URLs have explicit stylesheet consumers', async () => {
  expect(await selectPrecacheFontAssets(urls, await fixture(face('regular') + face('bold')))).toEqual(urls);
});
it('fails closed on a missing referenced file or app-shell entry', async () => {
  const root = await fixture();
  await expect(selectPrecacheFontAssets(urls.filter(url => !url.endsWith('/regular.woff2')), root)).rejects.toThrow('missing from the app shell');
  await fs.unlink(path.join(root, 'vendor/fonts/regular.woff2'));
  await expect(selectPrecacheFontAssets(urls, root)).rejects.toThrow();
});
it.each(["@import './other.css';" + face('regular'), face('regular').replace("'./regular.woff2'", "'https://example.com/font.woff2'"), face('regular').replace("'./regular.woff2'", "'../../outside.woff2'"), '@font-face{src:local(Example)}', ''])('rejects unresolved font dependency syntax: %s', async css => {
  await expect(selectPrecacheFontAssets(urls, await fixture(css))).rejects.toThrow();
});
it('shares one browser URL for identical fonts while retaining every font face and binary payload', async () => {
  const root = path.resolve('vendor/fonts');
  const stylesheet = postcss.parse(await fs.readFile(path.join(root, 'fonts.css'), 'utf8'));
  const hashes = new Map<string, string>();
  const digestsByFilename = new Map<string, string>();
  const faces: {prop: string; value: string; important: boolean}[][] = [];
  for (const rule of stylesheet.nodes) {
    if (rule.type !== 'atrule' || rule.name !== 'font-face') throw new Error('Unexpected font stylesheet structure');
    const declarations = [];
    for (const node of rule.nodes ?? []) {
      if (node.type !== 'decl') throw new Error('Unexpected font face node');
      let value = node.value;
      if (node.prop === 'src') {
        const filename = /^url\('\.\/([^']+)'\) format\('woff2'\)$/.exec(value)?.[1];
        if (!filename) throw new Error('Unexpected font source syntax');
        // This test never mutates the real font directory. Reuse only its
        // already-read identical URL within this ordered descriptor proof.
        let digest = digestsByFilename.get(filename);
        if (digest === undefined) {digest = createHash('sha256').update(await fs.readFile(path.join(root, filename))).digest('hex'); digestsByFilename.set(filename, digest);}
        expect(hashes.get(digest) ?? filename, 'identical font bytes share a single resource URL').toBe(filename);
        hashes.set(digest, filename);
        value = `sha256:${digest}`;
      }
      declarations.push({prop: node.prop, value, important: !!node.important});
    }
    faces.push(declarations);
  }
  expect(faces).toHaveLength(55);
  expect(hashes.size).toBe(18);
  // Pin ordered face descriptors and the actual font bytes, excluding URL aliases.
  expect(createHash('sha256').update(JSON.stringify(faces)).digest('hex')).toBe('9be0cd755da86899afcc9c4b8929a862413d3997cfc1a52e91cd45b817cb46ad');
});

it('maps only omitted byte-identical aliases to referenced precached canonical font files', async () => {
  const root = await fixture();
  const plan = await planPrecacheFontAssets(urls, root);
  expect(plan.urls).toEqual(urls.filter(url => !url.endsWith('/bold.woff2')));
  expect(plan.aliases).toEqual({'/vendor/fonts/bold.woff2': '/vendor/fonts/regular.woff2'});
  expect(Object.isFrozen(plan.aliases)).toBe(true);
  for (const [alias, canonical] of Object.entries(plan.aliases)) {
    expect(plan.urls).not.toContain(alias); expect(plan.urls).toContain(canonical);
    expect(await fs.readFile(path.join(root, alias))).toEqual(await fs.readFile(path.join(root, canonical)));
  }
  expect((await planPrecacheFontAssets(urls, await fixture(face('regular') + face('bold')))).aliases).toEqual({});
});
it('proves every real legacy alias against current canonical bytes while retaining only 18 font cache entries', async () => {
  const root = path.resolve('.');
  const fontUrls = (await fs.readdir('vendor/fonts')).filter(name => name.endsWith('.woff2')).map(name => '/vendor/fonts/' + name);
  const plan = await planPrecacheFontAssets(['/vendor/fonts/fonts.css', ...fontUrls], root);
  expect(fontUrls).toHaveLength(55);
  expect(plan.urls.filter(url => url.endsWith('.woff2'))).toHaveLength(18);
  expect(Object.entries(plan.aliases)).toHaveLength(37);
  const bytes = new Map(await Promise.all(fontUrls.map(async url => [url, await fs.readFile(path.join(root, url))] as const)));
  for (const [alias, canonical] of Object.entries(plan.aliases)) {
    expect(plan.urls).not.toContain(alias); expect(plan.urls).toContain(canonical);
    expect(bytes.get(alias)!.equals(bytes.get(canonical)!), `${alias} and ${canonical}: every byte`).toBe(true);
  }
});
it('does not alias a changed payload and fails closed when an omitted candidate cannot be verified', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'vendor/fonts/bold.woff2'), 'changed-font');
  expect((await planPrecacheFontAssets(urls, root)).aliases).toEqual({});
  expect((await planPrecacheFontAssets(urls, root)).urls).toContain('/vendor/fonts/bold.woff2');
  await fs.unlink(path.join(root, 'vendor/fonts/bold.woff2'));
  await expect(planPrecacheFontAssets(urls, root)).rejects.toThrow();
});

function nativeWorker(urls:readonly string[]):string{return 'const FONT_ALIASES = {};\nconst APP_SHELL = '+JSON.stringify(urls)+';';}
function nativeAliases(worker:string):Record<string,string>{const match=/const FONT_ALIASES = (\{[^;]*\});/.exec(worker);expect(match).not.toBeNull();return JSON.parse(match![1]!)as Record<string,string>;}
it('native worker assembly shares the exact byte-qualified font plan without omitting SDKs, chunks or unique fonts',async()=>{
 const root=await fixture(),nativeUrls=[...urls,'/vendor/sdk.js','/js/bundle-feature.js'];
 await fs.mkdir(path.join(root,'js'),{recursive:true});await fs.writeFile(path.join(root,'vendor/sdk.js'),'sdk');await fs.writeFile(path.join(root,'js/bundle-feature.js'),'chunk');await fs.writeFile(path.join(root,'index.html'),'app');
 const output=await applyNativeFontPrecache(nativeWorker(nativeUrls),root),plan=await planPrecacheFontAssets(nativeUrls,root);
 expect(parseAppShellEntries(output)).toEqual(plan.urls);expect(nativeAliases(output)).toEqual(plan.aliases);
 expect(plan.aliases).toEqual({'/vendor/fonts/bold.woff2':'/vendor/fonts/regular.woff2'});expect(parseAppShellEntries(output).filter(url=>!url.startsWith('/vendor/fonts/'))).toEqual(nativeUrls.filter(url=>!url.startsWith('/vendor/fonts/')));
 const measured=await summarizeAppShell({serviceWorkerSource:output,artifactRoot:path.join(root,'missing-artifact'),sourceRoot:root});
 const original=await summarizeAppShell({serviceWorkerSource:nativeWorker(nativeUrls),artifactRoot:root});
 expect(measured.resources).toBe(original.resources-1);expect(measured.decodedBytes).toBe(original.decodedBytes-Buffer.byteLength('same-font'));
 expect(await fs.readFile(path.join(root,'vendor/fonts/bold.woff2'))).toEqual(await fs.readFile(path.join(root,'vendor/fonts/regular.woff2')));
});
it('native real shell retains all public faces and non-font URLs while measuring exactly 18 canonical payloads',async()=>{
 const worker=await readServiceWorkerSource(relative=>fs.readFile(path.resolve(relative),'utf8')),before=parseAppShellEntries(worker),output=await applyNativeFontPrecache(worker,path.resolve('.')),after=parseAppShellEntries(output),aliases=nativeAliases(output);
 expect(before.filter(url=>url.endsWith('.woff2'))).toHaveLength(55);expect(after.filter(url=>url.endsWith('.woff2'))).toHaveLength(18);expect(Object.entries(aliases)).toHaveLength(37);
 expect(after.filter(url=>!url.endsWith('.woff2'))).toEqual(before.filter(url=>!url.endsWith('.woff2')));
 const fontBytes=new Map(await Promise.all(before.filter(url=>url.endsWith('.woff2')).map(async url=>[url,await fs.readFile('.'+url)] as const)));
 let removedBytes=0;for(const[alias,canonical]of Object.entries(aliases)){expect(alias).toMatch(/^\/vendor\/fonts\/[^/]+\.woff2$/);expect(after).toContain(canonical);expect(after).not.toContain(alias);const bytes=fontBytes.get(alias)!;expect(bytes.equals(fontBytes.get(canonical)!),`${alias} and ${canonical}: every byte`).toBe(true);removedBytes+=bytes.length;}
 const originalMetrics=await summarizeAppShell({serviceWorkerSource:worker,artifactRoot:path.resolve('.')}),nativeMetrics=await summarizeAppShell({serviceWorkerSource:output,artifactRoot:path.resolve('.local-notes/native-font-no-output'),sourceRoot:path.resolve('.')});
 expect(nativeMetrics).toEqual({resources:originalMetrics.resources-37,decodedBytes:originalMetrics.decodedBytes-removedBytes});
});
it('native font assembly fails closed without exactly one original injection marker',async()=>{
 const root=await fixture(),source=nativeWorker(urls);await expect(applyNativeFontPrecache(source.replace('const FONT_ALIASES = {};',''),root)).rejects.toThrow('unique');await expect(applyNativeFontPrecache('const FONT_ALIASES = {};\n'+source,root)).rejects.toThrow('unique');await expect(applyNativeFontPrecache(source.replace('const FONT_ALIASES = {};','const FONT_ALIASES = {foreign:"value"};'),root)).rejects.toThrow('unique');
});
it('native font assembly keeps changed unused payloads cached instead of manufacturing aliases',async()=>{
 const root=await fixture();await fs.writeFile(path.join(root,'vendor/fonts/bold.woff2'),'changed payload');const output=await applyNativeFontPrecache(nativeWorker(urls),root);expect(nativeAliases(output)).toEqual({});expect(parseAppShellEntries(output)).toEqual(urls);
});
