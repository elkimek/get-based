import { describe, expect, it } from 'vitest';

import { auditDomSinks, scanDomSinks } from '../scripts/dom-sink-audit.mjs';

describe('DOM HTML sink audit', () => {
  it('tracks every production JavaScript module and reviewed sink fingerprint', () => {
    const report = auditDomSinks();

    expect(report.failures).toEqual([]);
    expect(report.current.scannedFiles).toBeGreaterThan(100);
    expect(report.current.sinkCount).toBeGreaterThan(400);
    expect(Object.keys(report.current.files).length).toBeGreaterThan(31);
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
