/** Route the legacy suite's relative source reads to its own reader. */
export function createSourceFetch(read: (relative: string) => string, realFetch: typeof fetch, readBeforeResponse = false): typeof fetch {
  return async (url, opts) => {
    if (typeof url === 'string' && !/^https?:/.test(url)) {
      const rel = url.replace(/^\//, '');
      try {
        if (readBeforeResponse) {
          const body = read(rel);
          return new Response(body, { status: 200 });
        }
        return new Response(read(rel), { status: 200 });
      } catch (_) { return new Response('', { status: 404 }); }
    }
    return realFetch(url, opts);
  };
}
