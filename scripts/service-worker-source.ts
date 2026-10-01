/** The classic loader shared by development, production assembly and source checks. */
export const SERVICE_WORKER_ASSETS_IMPORT = "importScripts('/service-worker-assets.js');";

export function inlineServiceWorkerAssets(bootstrap: string, assets: string): string {
  if (!bootstrap.includes(SERVICE_WORKER_ASSETS_IMPORT)) {
    throw new Error('Service worker does not load its asset manifest.');
  }
  return bootstrap.replace(SERVICE_WORKER_ASSETS_IMPORT, assets);
}

export function readServiceWorkerSource(read: (relative: string) => string): string;
export function readServiceWorkerSource(read: (relative: string) => Promise<string>): Promise<string>;
export function readServiceWorkerSource(read: (relative: string) => string | Promise<string>): string | Promise<string> {
  const bootstrap = read('service-worker.js');
  const join = (source: string): string | Promise<string> => {
    if (!source.includes(SERVICE_WORKER_ASSETS_IMPORT)) return source;
    const assets = read('service-worker-assets.js');
    return typeof assets === 'string'
      ? inlineServiceWorkerAssets(source, assets)
      : assets.then(value => inlineServiceWorkerAssets(source, value));
  };
  return typeof bootstrap === 'string' ? join(bootstrap) : bootstrap.then(join);
}
