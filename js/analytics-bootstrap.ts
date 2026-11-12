// Cookieless Umami analytics — opt-out via Settings → Privacy. Skips on
// all self-hosted origins (including private HTTPS), file exports, Tor and
// explicit opt-outs. An offline PWA waits for its first reconnect.
(() => {
  // Classic bootstrap stays import-free. Match the official host boundary in
  // url-safety.ts; private/self-hosted origins never load official telemetry.
  const hostname = location.hostname.toLowerCase().replace(/\.$/, '');
  const officialHost = hostname === 'getbased.health' || hostname.endsWith('.getbased.health')
    || hostname === 'get-based.vercel.app' || hostname === 'get-based-managed-subscription-v2.vercel.app';
  const canUseUmami = location.protocol === 'https:' && officialHost;
  let scriptAdded = false;
  function loadUmami() {
    if (!canUseUmami
        || scriptAdded
        || localStorage.getItem('labcharts-analytics-disabled') === 'true') return;
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://umami-iota-olive.vercel.app/script.js';
    script.integrity = 'sha384-6PHtXKae10+dZuA/fcmjkSTDco+NPBE5fZ4eS/Em2lVIsS6FdDZIgs06MBJLEcSW';
    script.crossOrigin = 'anonymous';
    script.dataset.websiteId = '6272072c-97a9-47b0-99e7-c52e7a4ca481';
    // OAuth callbacks and future link fragments can contain transient secrets.
    // Pageview counts do not need either part of the URL.
    script.dataset.excludeSearch = 'true';
    script.dataset.excludeHash = 'true';
    document.head.appendChild(script);
    scriptAdded = true;
  }
  if (canUseUmami) {
    if (navigator.onLine === false) {
      globalThis.addEventListener('online', loadUmami, { once: true });
    } else {
      loadUmami();
    }
  }
})();
