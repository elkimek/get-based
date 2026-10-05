// Preserve the existing public document aliases with one prerendered app.
export const reroute = ({ url }: { url: URL }): string =>
  ['/', '/index.html', '/app/'].includes(url.pathname) ? '/app' : url.pathname;
