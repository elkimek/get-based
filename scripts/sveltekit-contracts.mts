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
