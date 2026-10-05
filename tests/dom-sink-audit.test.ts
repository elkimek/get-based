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
