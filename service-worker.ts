importScripts('/version.js');
importScripts('/service-worker-runtime.js');
// Build output pins the deployment identity.
const BUILD_ID = ''; // Replaced by the production builder.
const PROD_HOSTS = new Set(['app.getbased.health', 'getbased.health', 'www.getbased.health']);
const IS_PROD = PROD_HOSTS.has(self.location.hostname);
let _cacheNamePromise: Promise<string> | null = null;
async function resolveCacheName() {
  if (BUILD_ID) return `labcharts-vbuild-${BUILD_ID}`;
  const base = `labcharts-v${self.APP_VERSION}`;
  if (IS_PROD) return base;
  if (!_cacheNamePromise) {
    _cacheNamePromise = fetch('/api/commit', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { cacheKey?: unknown; sha?: unknown } | null) => {
        const requestedRevision = j?.cacheKey || j?.sha || '';
        const revision = String(requestedRevision).replace(/[^a-z0-9_-]/gi, '')
          .slice(0, j?.cacheKey ? 32 : 8);
        return revision ? `${base}-${revision}` : base;
      })
      .catch(() => base);
  }
  return _cacheNamePromise;
}
importScripts('/service-worker-assets.js');

const NETWORK_ONLY_HOSTS = new Set(['openrouter.ai', 'api.venice.ai', 'nras.attestation.nvidia.com', 'api.routstr.com', 'api.ppq.ai', 'api.github.com', 'umami-iota-olive.vercel.app', 'sync.getbased.health', 'free.evoluhq.com']);
function isLocalOrPrivateHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
    || hostname.startsWith('192.168.') || hostname.startsWith('10.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}
function shouldUseNetworkOnly(url: URL, sameOrigin: boolean) {
  const h = url.hostname;
  return NETWORK_ONLY_HOSTS.has(h) || (!sameOrigin && isLocalOrPrivateHost(h));
}
const serviceWorkerScope = self as ServiceWorkerGlobalScope & typeof globalThis;
serviceWorkerScope.GetBasedServiceWorkerRuntime!.install({
  scope: serviceWorkerScope,
  buildId: BUILD_ID,
  appShell: serviceWorkerScope.GetBasedServiceWorkerAssets!,
  isProduction: IS_PROD || !!BUILD_ID,
  resolveCacheName,
  shouldUseNetworkOnly,
});
