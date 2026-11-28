import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tokenize, TokenType } from '@csstools/css-tokenizer';
import postcss from 'postcss';

const LEGAL_COMMENT_RE = /license|copyright|permission|public domain|@preserve|^!/i;
const isLegalComment = (raw: string) => LEGAL_COMMENT_RE.test(raw.slice(2, -2));

function compactCssTokens(source: string): string {
  const tokens = tokenize({ css: source });
  const out: string[] = [];
  let inCustomProp = false;
  let parenDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const [type, raw] = tokens[i]!;
    if (type === TokenType.EOF) break;
    if (type === TokenType.Comment) {
      if (isLegalComment(raw)) out.push(raw);
      continue;
    }
    if (type === TokenType.OpenParen || type === TokenType.Function) parenDepth++;
    if (type === TokenType.CloseParen && parenDepth > 0) parenDepth--;

    if (type === TokenType.Ident && raw.startsWith('--')) {
      let j = i + 1;
      while (j < tokens.length && (tokens[j]![0] === TokenType.Whitespace || tokens[j]![0] === TokenType.Comment)) j++;
      if (tokens[j]?.[0] === TokenType.Colon) inCustomProp = true;
    }
    if (type === TokenType.Semicolon || type === TokenType.CloseCurly) inCustomProp = false;

    if (type === TokenType.Whitespace) {
      const prev = out.length ? out[out.length - 1]! : null;
      let j = i + 1;
      while (
        j < tokens.length
        && (tokens[j]![0] === TokenType.Whitespace
          || (tokens[j]![0] === TokenType.Comment && !isLegalComment(tokens[j]![1])))
      ) j++;
      const next = tokens[j];
      if (!prev || !next || next[0] === TokenType.EOF) continue;
      if (inCustomProp) {
        if (!prev.endsWith(' ')) out.push(' ');
        continue;
      }
      const nextType = next[0];
      const prevEndsStruct = prev === '{' || prev === '}' || prev === ';' || prev === ',' || prev === ':';
      const nextIsStruct = nextType === TokenType.OpenCurly
        || nextType === TokenType.CloseCurly
        || nextType === TokenType.Semicolon
        || nextType === TokenType.Comma;
      if (prevEndsStruct || nextIsStruct) continue;
      if (parenDepth > 0 && (prev.endsWith('(') || nextType === TokenType.CloseParen)) continue;
      if (!prev.endsWith(' ')) out.push(' ');
      continue;
    }
    out.push(raw);
  }
  return out.join('');
}

function significantTokens(text: string): string[] {
  return tokenize({ css: text })
    .filter(([t]) => t !== TokenType.EOF && t !== TokenType.Whitespace && t !== TokenType.Comment)
    .map(([t, r]) => `${t}:${r}`);
}

function legalNotices(css: string): string[] {
  return tokenize({ css })
    .filter(([t, r]) => t === TokenType.Comment && isLegalComment(r))
    .map(([, r]) => r);
}

function cssAstSignature(css: string): string {
  const root = postcss.parse(css);
  function walk(node: postcss.ChildNode | postcss.Root): unknown {
    if (node.type === 'root') return ['root', node.nodes.filter(n => n.type !== 'comment').map(walk)];
    if (node.type === 'rule') return ['rule', node.selectors.map(significantTokens), node.nodes.filter(n => n.type !== 'comment').map(walk)];
    if (node.type === 'atrule') return ['atrule', node.name, significantTokens(node.params), node.nodes ? node.nodes.filter(n => n.type !== 'comment').map(walk) : null];
    if (node.type === 'decl') return ['decl', node.prop, node.prop.startsWith('--') ? node.value.replace(/\s+/g, ' ') : significantTokens(node.value), Boolean(node.important)];
    return [node.type];
  }
  return JSON.stringify(walk(root));
}

export function assertEquivalentStaticCss(source: string, output: string): void {
  assert.equal(cssAstSignature(output), cssAstSignature(source), 'Static CSS AST must remain identical');
  assert.deepEqual(legalNotices(output), legalNotices(source), 'Every CSS legal notice must remain verbatim and ordered');
}

/** Strip non-legal comments and non-semantic whitespace from static CSS.
 * Retains exact original bytes if PostCSS AST or legal notices differ. */
export function encodeStaticCss(_file: string, source: string): string {
  const compacted = compactCssTokens(source);
  try { assertEquivalentStaticCss(source, compacted); }
  catch { return source; }
  return compacted.length > 0 && Buffer.byteLength(compacted) < Buffer.byteLength(source) ? compacted : source;
}

export function verifyStaticCss(file: string, source: string, output: string): void {
  assert.equal(output, encodeStaticCss(file, source), 'Exact current static CSS encoding: ' + file);
}

export async function compactStaticCss(directory: string, urls: readonly string[]) {
  let files = 0, before = 0, after = 0;
  const resolvedRoot = path.resolve(directory) + path.sep;
  for (const url of new Set(urls)) {
    if (!url.endsWith('.css')) continue;
    const file = path.resolve(directory, '.' + url);
    if (!file.startsWith(resolvedRoot)) throw new Error('CSS leaves static output directory: ' + url);
    const source = await fs.readFile(file, 'utf8');
    const output = encodeStaticCss(url, source);
    files++;
    before += Buffer.byteLength(source);
    after += Buffer.byteLength(output);
    if (output !== source) await fs.writeFile(file, output);
  }
  return { files, before, after, saved: before - after };
}
