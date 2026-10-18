import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { rewriteNativeAssetBase, staticKitTemplate, externalizeKitBootstrap } from '../scripts/sveltekit-contracts.mjs';

const root = path.resolve('/tmp/getbased-contract-fixture');
describe('shared SvelteKit build contracts', () => {
  it('preserves lazy CSS, worker and computed vendor URLs from nested Kit chunks', () => {
    const source = `const css = new URL('../css/settings.css', import.meta.url).href;
const worker = new URL('./lens-local-worker.js', import.meta.url).href;
const directory = '../vendor/evolu8/';
const vendor = new URL(directory + 'evolu-bundle.js', import.meta.url).href;
const styles = ['../css/light-sun.css', '../css/light-env.css'].map(file => new URL(file, import.meta.url).href);
globalThis.result = { css, worker, vendor, styles };`;
    const result = rewriteNativeAssetBase(source, path.join(root, 'js/feature.js'), root)!;
    const context = { URL, globalThis: { location: { href: 'https://getbased.test/app?fixture=1' }, result: {} } };
    vm.runInNewContext(result.code, context);
    expect(context.globalThis.result).toEqual({ css: 'https://getbased.test/css/settings.css',
      worker: 'https://getbased.test/js/lens-local-worker.js', vendor: 'https://getbased.test/vendor/evolu8/evolu-bundle.js',
      styles: ['https://getbased.test/css/light-sun.css', 'https://getbased.test/css/light-env.css'] });
    expect(result.map.sourcesContent).toEqual([source]);
  });
  it('does not rewrite import.meta text in strings, comments, or unrelated module metadata', () => {
    const source = `const text = 'import.meta.url'; // import.meta.url
const mode = import.meta.env.MODE;`;
    expect(rewriteNativeAssetBase(source, path.join(root, 'js/feature.js'), root)).toBeNull();
    expect(rewriteNativeAssetBase('import.meta.url', path.join(root, 'vendor/feature.js'), root)).toBeNull();
  });
  it('preserves the canonical shell while replacing its entry with the Kit root', () => {
    const input = `<!doctype html><html><head><script src="js/theme-bootstrap.js"></script><link href="https://outside.test/x"></head><body><button id="native-control">Native</button><!-- APP_SVELTE_SHELL_START --><div id="chat-panel">Generated</div><!-- APP_SVELTE_SHELL_END --><script src="js/legal-consent-bootstrap.js"></script><!-- PRODUCTION_MAIN_SCRIPT_START --><script type="module" src="js/main.js"></script><!-- PRODUCTION_MAIN_SCRIPT_END --></body></html>`;
    const output = staticKitTemplate(input);
    expect(output).toContain('id="native-control"');
    expect(output).not.toContain('id="chat-panel"');
    expect(output.match(/%sveltekit.body%/g)).toHaveLength(1);
    expect(output.indexOf('%sveltekit.body%')).toBeLessThan(output.indexOf('legal-consent-bootstrap'));
    expect(() => staticKitTemplate(input.replace('APP_SVELTE_SHELL_END', 'BROKEN'))).toThrow('one generated App');
    expect(output).toContain('src="/js/theme-bootstrap.js"');
    expect(output).toContain('src="/js/legal-consent-bootstrap.js"');
    expect(output).toContain('href="https://outside.test/x"');
    expect(output).not.toContain('src="js/main.js"');
    expect(output).toContain('%sveltekit.head%');
    expect(output).toContain('%sveltekit.body%');
  });
  it('rejects incomplete shells rather than producing a second native entry', () => {
    expect(() => staticKitTemplate('<head></head><body></body>')).toThrow('one production entry');
  });
  it('externalizes a classic Kit bootstrap without changing its parent-element contract', () => {
    const code = '{ __sveltekit_test = {}; const element = document.currentScript.parentElement; }';
    const output = externalizeKitBootstrap(`<div><script src="/version.js"></script><script>${code}</script></div>`);
    expect(output.scripts).toHaveLength(1);
    expect(output.scripts[0]?.code).toBe(code);
    expect(output.html).toContain(`<script src="/${output.scripts[0]?.file}"></script>`);
    expect(output.html).not.toContain('type="module"');
    expect(externalizeKitBootstrap(`<div><script>${code}</script></div>`).scripts[0]?.file).toBe(output.scripts[0]?.file);
  });
  it.each(['SCRIPT', 'ScRiPt'])('externalizes %s bootstraps using browser tag semantics and original source bytes', tag => {
    const code = '{ __sveltekit_test = {}; const element = document.currentScript.parentElement; }';
    const before = '<!doctype html><html><head><SCRIPT SRC="/version.js" data-note=">"> </SCRIPT></head><body><div>';
    const after = '</div><script TYPE="APPLICATION/JSON">{"literal":"<SCRIPT>"}</script></body></html>';
    const output = externalizeKitBootstrap(before+`<${tag} data-note=">">${code}</${tag} ignored="browser-end-tag">`+after);
    const canonical = externalizeKitBootstrap(`<div><script>${code}</script></div>`);
    expect(output.scripts).toEqual(canonical.scripts);
    expect(output.scripts[0]?.code).toBe(code);
    expect(output.html).toBe(before+`<script src="/${canonical.scripts[0]?.file}"></script>`+after);
  });
  it('ignores inert comment and attribute script text while inspecting real inline elements', () => {
    const code = '{ __sveltekit_test = {}; const element = document.currentScript.parentElement; }';
    const before = '<!-- <SCRIPT>alert(1)</SCRIPT> --><div data-note="<script>alert(2)</script>">';
    const after = '</div>';
    const output = externalizeKitBootstrap(before+`<script>${code}</script>`+after);
    expect(output.scripts).toHaveLength(1);
    expect(output.html).toBe(before+`<script src="/${output.scripts[0]?.file}"></script>`+after);
  });
  it.each([
    '<SCRIPT>alert(1)</SCRIPT>', '<ScRiPt>alert(1)</sCrIpT>',
    '<script>alert(1)</script ignored="browser-end-tag">',
    '<script data-note=">">alert(1)</script>',
    '<script data-src="/not-an-external-script.js">alert(1)</script>',
    '<script>unterminated',
  ])('rejects browser-recognized unexpected inline scripts: %s', unexpected => {
    const code = '{ __sveltekit_test = {}; const element = document.currentScript.parentElement; }';
    expect(() => externalizeKitBootstrap(`<div><script>${code}</script>${unexpected}</div>`)).toThrow(/inline/);
  });
  it('rejects unexpected inline executable scripts and missing bootstraps under the existing CSP', () => {
    expect(() => externalizeKitBootstrap('<script>alert(1)</script>')).toThrow('Unexpected inline');
    expect(() => externalizeKitBootstrap('<script src="/version.js"></script>')).toThrow('Expected one');
  });
});
