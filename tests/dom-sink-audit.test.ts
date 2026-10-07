import { describe, expect, it } from 'vitest';

import { auditDomSinks, scanDomSinks } from '../scripts/dom-sink-audit.mjs';

describe('DOM HTML sink audit', () => {
  it('tracks every production JavaScript module and reviewed sink fingerprint', () => {
    const report = auditDomSinks();

    expect(report.failures).toEqual([]);
    expect(report.current.scannedFiles).toBeGreaterThan(100);
    expect(report.current.sinkCount).toBe(Object.values(report.current.files).reduce((sum, file) => sum + file.count, 0));
    expect(Object.keys(report.current.files).length).toBeGreaterThan(31);
  }, 15_000);

  it('rejects altered fingerprints, omitted and stale entries, and discovery totals', () => {
    const { current } = auditDomSinks();
    const policy = structuredClone(current);
    const [changed, omitted] = Object.keys(policy.files);
    if (!changed || !omitted) throw new Error('Expected multiple reviewed sink-bearing modules');
    policy.files[changed]!.digest = 'unreviewed';
    delete policy.files[omitted];
    policy.files['js/stale-review.js'] = { count: 1, digest: 'stale', kinds: { innerHTML: 1 } };
    policy.scannedFiles -= 1;
    policy.sinkCount -= 1;
    const report = auditDomSinks(policy);
    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('scanned file count changed'),
      expect.stringContaining('HTML sink count changed'),
      expect.stringContaining(`reviewed sink surface changed in ${changed}`),
      `new sink-bearing file: ${omitted}`,
      'stale sink policy entry: js/stale-review.js',
    ]));
  }, 15_000);

  it('audits Svelte script sinks, raw HTML and editable HTML bindings without counting escaped text', () => {
    const source = `<script lang="ts">let value = '<b>unsafe</b>'; node.innerHTML = value;</script>
      <p>{value}</p>{@html value}<div contenteditable="true" bind:innerHTML={value}></div>
      <button onclick={() => { node.innerHTML = value; node.insertAdjacentHTML('beforeend', value); document.write(value); }}>Write</button>
      <iframe title="Preview" srcdoc={value}></iframe>`;
    const sinks = scanDomSinks(source, 'js/View.svelte');
    expect(sinks.map(sink => sink.kind)).toEqual(['innerHTML', 'svelte.html', 'svelte.bind.innerHTML', 'innerHTML', 'insertAdjacentHTML', 'document.write', 'svelte.attribute.srcdoc']);
    expect(sinks[1]!.source).toBe('{@html value}');
    expect(sinks[1]!.line).toBe(2);
  });

  it('recognizes assignment, insertion, fragment, unsafe-HTML, and document-write sinks', () => {
    const sinks = scanDomSinks(`
      node.innerHTML = html;
      node.outerHTML += more;
      frame['srcdoc'] = page;
      node.insertAdjacentHTML('beforeend', row);
      range.createContextualFragment(markup);
      shadow.setHTMLUnsafe(fragment);
      popup.document.write(report);
      popup.document.writeln(report);
    `);

    expect(sinks.map(sink => sink.kind)).toEqual([
      'innerHTML',
      'outerHTML',
      'srcdoc',
      'insertAdjacentHTML',
      'createContextualFragment',
      'setHTMLUnsafe',
      'document.write',
      'document.writeln',
    ]);
  });
});
