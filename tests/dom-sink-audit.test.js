import { describe, expect, it } from 'vitest';

import {
  auditDomSinks,
  createDomSinkPolicy,
  fingerprintDomSinks,
  scanDomSinks,
} from '../scripts/dom-sink-audit.mjs';

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

  it('fingerprints reviewed sinks without locale-sensitive collation', () => {
    const originalLocaleCompare = String.prototype.localeCompare;
    String.prototype.localeCompare = () => {
      throw new Error('locale-sensitive comparison invoked');
    };

    try {
      expect(createDomSinkPolicy().sinkCount).toBeGreaterThan(400);
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
  }, 15_000);

  it('changes the reviewed fingerprint when an identical sink is relocated', () => {
    const original = scanDomSinks('node.innerHTML = html;\n');
    const relocated = scanDomSinks('\n\n\nnode.innerHTML = html;\n');

    expect(original[0].source).toBe(relocated[0].source);
    expect(fingerprintDomSinks(original)).not.toBe(fingerprintDomSinks(relocated));
  });
});
