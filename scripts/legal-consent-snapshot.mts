const START = '<!-- LEGAL_SVELTE_BOOT_START -->';
const END = '<!-- LEGAL_SVELTE_BOOT_END -->';
const BOOTSTRAP = '<!-- PRODUCTION_LEGAL_BOOTSTRAP_START -->';

/** Keep the mutable early consent gate before both classic bootstrap and Kit ownership. */
export function withLegalConsentSnapshot(index: string, html: string): string {
 const start = index.indexOf(START), end = index.indexOf(END), bootstrap = index.indexOf(BOOTSTRAP);
 if (bootstrap < 0 || index.indexOf(BOOTSTRAP, bootstrap + BOOTSTRAP.length) >= 0)
  throw new Error('Expected one early legal bootstrap boundary');
 if (start >= 0 || end >= 0) {
  if (start < 0 || end < start || end > bootstrap || index.indexOf(START, start + START.length) >= 0 || index.indexOf(END, end + END.length) >= 0)
   throw new Error('Expected one early legal snapshot boundary');
  return index.slice(0, start + START.length) + '\n' + html + '\n  ' + index.slice(end);
 }
 const body = index.indexOf('<body>');
 const previous = body < 0 ? '' : index.slice(body + '<body>'.length, bootstrap);
 if (!/^\s*<div\s+id="legal-consent-overlay"[\s>]/.test(previous) || !previous.trimEnd().endsWith('</div>'))
  throw new Error('Expected the initial legal overlay immediately after body');
 return index.slice(0, body + '<body>'.length) + '\n  ' + START + '\n' + html + '\n  ' + END + '\n  ' + index.slice(bootstrap);
}
