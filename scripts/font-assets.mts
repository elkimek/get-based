import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import postcss from 'postcss';

const FONT_STYLESHEET = '/vendor/fonts/fonts.css';
const FONT_DIRECTORY = '/vendor/fonts/';
const FONT_ORIGIN = 'https://getbased.invalid';

/** Font aliases stay public for old documents. Only unused, byte-identical
 * aliases can be omitted from a new build's precache. Unique files stay cached. */
export interface PrecacheFontPlan {
  urls: string[];
  aliases: Readonly<Record<string, string>>;
}
export async function planPrecacheFontAssets(urls: readonly string[], artifactRoot: string): Promise<PrecacheFontPlan> {
  const root = path.resolve(artifactRoot);
  const publicFile = (url: string) => {
    const file = path.resolve(root, '.' + url);
    if (!file.startsWith(root + path.sep)) throw new Error('Font asset escapes the public artifact');
    return file;
  };
  const stylesheet = postcss.parse(await fs.readFile(publicFile(FONT_STYLESHEET), 'utf8'));
  const referenced = new Set<string>();
  stylesheet.walkAtRules('import', () => {throw new Error('Font precaching requires a self-contained stylesheet');});
  stylesheet.walkDecls('src', declaration => {
    const source = /^url\((['"])([^'"]+)\1\)\s+format\((['"])woff2\3\)$/.exec(declaration.value);
    if (!source) throw new Error('Unexpected font source: review its precache dependencies');
    const url = new URL(source[2]!, FONT_ORIGIN + FONT_STYLESHEET);
    if (url.origin !== FONT_ORIGIN || !/^\/vendor\/fonts\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.woff2$/.test(url.pathname) || url.search || url.hash) {
      throw new Error('Font sources must be local WOFF2 assets');
    }
    if (!urls.includes(url.pathname)) throw new Error(`Font source is missing from the app shell: ${url.pathname}`);
    referenced.add(url.pathname);
  });
  if (!referenced.size) throw new Error('Missing font sources');
  const digest = async (url: string) => createHash('sha256').update(await fs.readFile(publicFile(url))).digest('hex');
  const canonicalByHash = new Map<string, string>();
  for (const url of [...referenced].sort()) {
    const hash = await digest(url);
    if (!canonicalByHash.has(hash)) canonicalByHash.set(hash, url);
  }
  const aliases: Record<string, string> = Object.create(null);
  const keep = await Promise.all(urls.map(async url => {
    if (!url.startsWith(FONT_DIRECTORY) || !url.endsWith('.woff2') || referenced.has(url)) return true;
    if (!/^\/vendor\/fonts\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.woff2$/.test(url)) throw new Error('Unexpected font alias path');
    const canonical = canonicalByHash.get(await digest(url));
    // An unused unique font may be another explicit public consumer's asset.
    if (!canonical) return true;
    aliases[url] = canonical;
    return false;
  }));
  return {urls: urls.filter((_, index) => keep[index]), aliases: Object.freeze(Object.fromEntries(Object.entries(aliases).sort()))};
}

/** Retain the public list-only helper for consumers that do not assemble a worker. */
export async function selectPrecacheFontAssets(urls: readonly string[], artifactRoot: string): Promise<string[]> {
  return (await planPrecacheFontAssets(urls, artifactRoot)).urls;
}
