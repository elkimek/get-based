import path from 'node:path';
import { createHash } from 'node:crypto';
import MagicString from 'magic-string';
import { JSDOM } from 'jsdom';
import * as ts from 'typescript/unstable/ast';
import { withParsedSource } from './native-typescript-ast.js';

/** Keep relative CSS, vendor and worker URLs based at their original /js module. */
export function rewriteNativeAssetBase(code: string, file: string, root: string) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  if (!relative.startsWith('js/') || !relative.endsWith('.js') || relative.includes('../')) return null;
  const rewritten = new MagicString(code);
  let changed = false;
  withParsedSource(code, file, source => {
    function visit(node: ts.Node): void {
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'url'
        && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
        && node.expression.name.text === 'meta') {
        rewritten.overwrite(node.getStart(source), node.end,
          `new URL(${JSON.stringify('/' + relative)}, globalThis.location.href).href`);
        changed = true;
      }
      node.forEachChild(visit);
    }
    visit(source);
  });
  return changed ? { code: rewritten.toString(), map: rewritten.generateMap({ hires: true, source: file, includeContent: true }) } : null;
}

/** Lossless build-only packing keeps the maintained prompt readable in source.
 * Static ASCII dictionary markers expand synchronously; there is no evaluation,
 * network dependency, or change to the exported instruction text. */
export function packStaticChatInstructions(code: string, file: string, root: string) {
  if (path.relative(root, file).replaceAll(path.sep, '/') !== 'shared/chat-tool-instructions.js') return null;
  const rewritten = new MagicString(code); let changed = false;
  withParsedSource(code, file, source => {
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'CHAT_TOOL_INSTRUCTIONS') continue;
        const literal = declaration.initializer;
        if (!literal || !(ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal))) throw new Error('Chat instructions must be a static literal for lossless packing.');
        const text = literal.text;
        if (text.includes('~')) continue; // Never collide with authored text.
        const candidates = [...new Set(text.match(/[A-Za-z_][A-Za-z0-9_.-]{3,}/g) || [])]
          .map(word => ({ word, gain: (word.length - 3) * (text.split(word).length - 1) - JSON.stringify(word).length - 1 }))
          .sort((a, b) => b.gain - a.gain || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
        let packed = text; const words: string[] = [];
        const marker = (index: number) => index < 36 ? '~' + index.toString(36)
          : '~' + String.fromCharCode(65 + Math.floor((index - 36) / 36)) + ((index - 36) % 36).toString(36);
        for (const { word } of candidates) {
          if (words.length === 972) break;
          const token = marker(words.length);
          if ((word.length - token.length) * (packed.split(word).length - 1) <= JSON.stringify(word).length + 1) continue;
          packed = packed.split(word).join(token); words.push(word);
        }
        const expand = (token: string) => words[token.length === 1 ? parseInt(token, 36) : 36 + (token.charCodeAt(0) - 65) * 36 + parseInt(token[1]!, 36)]!;
        if (packed.replace(/~([A-Z][0-9a-z]|[0-9a-z])/g, (_, token: string) => expand(token)) !== text) throw new Error('Chat instruction packing changed the prompt.');
        const expression = `((d)=>${JSON.stringify(packed)}.replace(/~([A-Z][0-9a-z]|[0-9a-z])/g,(_,c)=>d[c.length===1?parseInt(c,36):36+(c.charCodeAt(0)-65)*36+parseInt(c[1],36)]))(${JSON.stringify(words)})`;
        if (Buffer.byteLength(expression) + 256 >= Buffer.byteLength(code.slice(literal.getStart(source), literal.end))) continue;
        rewritten.overwrite(literal.getStart(source), literal.end, expression); changed = true;
      }
    }
  });
  return changed ? { code: rewritten.toString(), map: rewritten.generateMap({ hires: true, source: file, includeContent: true }) } : null;
}

/** The complete authored AppShell belongs to the Kit route; early document bootstraps remain external. */
export function staticKitTemplate(index: string): string {
  const marker = /<!-- PRODUCTION_MAIN_SCRIPT_START -->[\s\S]*?<!-- PRODUCTION_MAIN_SCRIPT_END -->/g;
  if ([...index.matchAll(marker)].length !== 1 || !index.includes('</head>') || !index.includes('</body>')) {
    throw new Error('The app shell must contain one production entry section and a complete document');
  }
  const shell = /<!-- APP_SVELTE_SHELL_START[^>]*-->[\s\S]*?<!-- APP_SVELTE_SHELL_END -->/g;
  if ([...index.matchAll(shell)].length !== 1) throw new Error('Expected one generated App shell section');
  return index.replace(marker, '').replace(shell, '<div id="kit-root" style="display:contents">%sveltekit.body%</div>')
    .replace(/(src|href)="(?![a-z][a-z\d+.-]*:|\/|#)([^"]+)"/gi, '$1="/$2"')
    .replace('</head>', '%sveltekit.head%</head>');
}

/** External classic bootstrap preserves document.currentScript and the deployed CSP. */
export function externalizeKitBootstrap(html: string) {
  const scripts: Array<{ file: string; code: string }> = [];
  // Parse without running scripts or fetching resources. Source offsets let us
  // replace only bootstrap tags, preserving every other authored byte.
  const parsed = new JSDOM(html, { includeNodeLocations: true });
  const document = new MagicString(html);
  try {
    for (const script of parsed.window.document.querySelectorAll('script')) {
      const type = script.getAttribute('type')?.trim().toLowerCase();
      if (script.hasAttribute('src') || type === 'application/json' || type === 'application/ld+json') continue;
      const location: {
        startOffset: number; endOffset: number;
        startTag?: { endOffset: number }; endTag?: { startOffset: number };
      } | null | undefined = parsed.nodeLocation(script);
      if (!location?.startTag || !location.endTag) {
        throw new Error('Incomplete inline script in the static SvelteKit document');
      }
      const code = html.slice(location.startTag.endOffset, location.endTag.startOffset);
      if (!/\b__sveltekit_[a-z\d]+\s*=/.test(code) || !code.includes('document.currentScript.parentElement')) {
        throw new Error('Unexpected inline executable script in the static SvelteKit document');
      }
      const hash = createHash('sha256').update(code).digest('hex').slice(0, 16);
      const file = `js/kit-bootstrap-${hash}.js`;
      scripts.push({ file, code });
      document.overwrite(location.startOffset, location.endOffset, `<script src="/${file}"></script>`);
    }
    if (scripts.length !== 1) throw new Error(`Expected one SvelteKit bootstrap; found ${scripts.length}`);
    return { html: document.toString(), scripts };
  } finally {
    parsed.window.close();
  }
}
