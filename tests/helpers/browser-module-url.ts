/** Keep each suite's cache namespace while generating a fresh URL per import. */
export function createModuleUrl(cacheKey: string): (path: string) => string {
  return function moduleUrl(path: string): string {
    return `${path}?${cacheKey}=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };
}
