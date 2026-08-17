// Cookieless Umami analytics — opt-out via Settings → Privacy. Skips on
// file:// (offline export), .onion (Tor), local dev hosts, and when explicitly
// disabled. An offline PWA waits for its first reconnect.
(() => {
  const isDevHost = location.hostname === 'localhost'
    || location.hostname === '127.0.0.1'
    || location.hostname.endsWith('.local')
    || location.hostname.endsWith('.localhost');
  const canUseUmami = location.protocol !== 'file:'
    && !location.hostname.endsWith('.onion')
    && !isDevHost;
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
