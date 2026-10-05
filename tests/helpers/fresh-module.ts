/** Load a real URL without claiming validation of its module namespace. */
export function importFreshModule(url: URL): Promise<unknown> {
  return import(url.href);
}
