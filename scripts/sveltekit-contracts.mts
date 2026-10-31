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

/** Build-only LZSS encoding; runtime decoding is synchronous and has no dependencies. */
function packPromptBytes(text: string): string | null {
  const bytes = Buffer.from(text, 'utf8');
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== text) return null;
  const packed: number[] = [], seen = new Map<number, number[]>();
  const key = (index: number) => (bytes[index]! << 16) | (bytes[index + 1]! << 8) | bytes[index + 2]!;
  let position = 0;
  while (position < bytes.length) {
    const flags = packed.length; packed.push(0);
    for (let bit = 0; bit < 8 && position < bytes.length; bit++) {
      let length = 0, distance = 0;
      const candidates = position + 2 < bytes.length ? seen.get(key(position)) || [] : [];
      for (let index = candidates.length - 1; index >= 0; index--) {
        const previous = candidates[index]!, offset = position - previous;
        if (offset > 4095) break;
        let count = 0;
        while (count < 18 && position + count < bytes.length && bytes[previous + count] === bytes[position + count]) count++;
        if (count >= 3 && count > length) { length = count; distance = offset; if (count === 18) break; }
      }
      if (length >= 3) { packed[flags] = packed[flags]! | (1 << bit); packed.push(((length - 3) << 4) | (distance >> 8), distance & 255); }
      else { packed.push(bytes[position]!); length = 1; }
      for (let count = 0; count < length; count++) if (position + count + 2 < bytes.length) {
        const id = key(position + count), previous = seen.get(id) || [];
        previous.push(position + count); if (previous.length > 64) previous.shift(); seen.set(id, previous);
      }
      position += length;
    }
  }
  // Independently reconstruct bytes before emitting any packed source.
  const restored = new Uint8Array(bytes.length); let input = 0, output = 0;
  while (input < packed.length) {
    const flags = packed[input++]!;
    for (let bit = 0; bit < 8 && input < packed.length; bit++) {
      if (flags & (1 << bit)) {
        const value = packed[input++]!, distance = ((value & 15) << 8) | packed[input++]!, length = (value >> 4) + 3;
        if (!distance || distance > output || output + length > restored.length) throw new Error('Invalid static prompt backreference.');
        for (let end = output + length; output < end; output++) restored[output] = restored[output - distance]!;
      } else restored[output++] = packed[input++]!;
    }
  }
  if (output !== bytes.length || !Buffer.from(restored).equals(bytes)) throw new Error('Static prompt byte packing changed its content.');
  const encoded = JSON.stringify(Buffer.from(packed).toString('base64'));
  return `((b,n)=>{const d=Uint8Array.from(atob(b),c=>c.charCodeAt(0)),o=new Uint8Array(n);let i=0,j=0;while(i<d.length){const f=d[i++];for(let k=0;k<8&&i<d.length;k++){if(f&(1<<k)){const v=d[i++],s=(v&15)*256+d[i++],l=(v>>4)+3;if(!s||s>j||j+l>n)throw Error('Invalid static prompt');for(let e=j+l;j<e;j++)o[j]=o[j-s]}else o[j++]=d[i++]}}if(j!==n)throw Error('Invalid static prompt');return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(o)})(${encoded},${bytes.length})`;
}

/** Lossless build-only packing keeps the maintained prompt readable in source.
 * Static word or byte references expand synchronously; there is no evaluation,
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
        // The native AST transport drops a leading BOM from literal values.
        // Leave these authored literals untouched rather than packing altered text.
        if (/^['"`](?:\uFEFF|\\u(?:feff|\{feff\}))/i.test(code.slice(literal.getStart(source), literal.end))) continue;
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
        const dictionary = `((d)=>${JSON.stringify(packed)}.replace(/~([A-Z][0-9a-z]|[0-9a-z])/g,(_,c)=>d[c.length===1?parseInt(c,36):36+(c.charCodeAt(0)-65)*36+parseInt(c[1],36)]))(${JSON.stringify(words)})`;
        const bytePacked = packPromptBytes(text);
        const expression = bytePacked && Buffer.byteLength(bytePacked) < Buffer.byteLength(dictionary) ? bytePacked : dictionary;
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
