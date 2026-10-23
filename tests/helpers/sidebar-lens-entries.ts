import assert from 'node:assert/strict';

export function standaloneLensEntries(): string[] {
  const entries = [
    {route: 'nutrition', label: 'Nutrition', branch: 16, path: 'M4 3v5a3 3 0 0 0 6 0V3M7 3v18M20 3c-4 3-5 7-5 10h5M20 3v18'},
    {route: 'supplements', label: 'Supplements &amp; Meds', branch: 17, path: 'M9 4a5 5 0 0 1 7 7l-5 5a5 5 0 0 1-7-7zM7 6l7 7'},
  ];
  return entries.map(({route, label, branch, path}) => `<div class="nav-item" data-category="${route}" tabindex="0" role="button" data-nav-action="navigate" data-nav-route="${route}">
    <span class="nav-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><!--[${branch}--><path d="${path}"></path><!--]--></svg><!----></span>
    <span class="nav-item-label">${label}</span><span class="nav-item-dot"></span></div>`);
}

// Qualify the intentional navigation changes before comparing the rest against
// immutable migration receipts. Shipping acceptance compares the complete new tree.
export function withoutStandaloneLensEntries(html: string): string {
  for (const row of standaloneLensEntries()) {
    assert.equal(html.split(row).length, 2, 'Exactly one qualified standalone lens entry');
    html = html.replace(row, '');
  }
  const genome=html.match(/<div class="nav-item" data-category="genome"[\s\S]*?<\/div>/g);
  assert.equal(genome?.length,1,'Exactly one Genome entry');
  const entry=genome![0]!;
  assert.ok(html.indexOf(entry)>html.indexOf('data-category="light"'),'Genome follows Light');
  assert.ok(html.indexOf(entry)<html.indexOf('data-category="insight"'),'Genome precedes Insight');
  html=html.replace(entry,'').replace('<div class="nav-item" data-category="body"',entry+'<div class="nav-item" data-category="body"');
  assert.equal(html.split('>Biometrics</span>').length, 2, 'Exactly one renamed Biometrics lens');
  return html.replace('>Biometrics</span>', '>Body</span>');
}
