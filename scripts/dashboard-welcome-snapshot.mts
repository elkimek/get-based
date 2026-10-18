/** Skip compiler comments once, without backtracking across earlier terminators. */
function startsWithWelcomeOwner(body: string): boolean {
  let start = 0;
  while (body.startsWith('<!--', start)) {
    const end = body.indexOf('-->', start + 4);
    if (end < 0) return false;
    start = end + 3;
  }
  return /^<div class="welcome-hero welcome-hero-noai" data-prerendered-welcome(?:="")?>/.test(body.slice(start));
}

/** Replace only the existing early Dashboard paint; boot preserves this subtree. */
export function withDashboardWelcomeSnapshot(index: string, body: string): string {
  const section=/(<main class="main" id="main-content">)[\s\S]*?(<\/main>)/g;
  const matches=[...index.matchAll(section)];
  if(matches.length!==1 || !matches[0]![0].includes('data-prerendered-welcome')
    || !startsWithWelcomeOwner(body))
    throw new Error('Expected one owned initial Dashboard welcome section');
  return index.replace(section,(_whole:string,opening:string,closing:string)=>opening+'\n      '+body+'\n    '+closing);
}
