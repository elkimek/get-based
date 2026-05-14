# Deployment

getbased is deployed on Vercel. The app is static — no server-side code, no API routes, no backend. Vercel serves the files directly and injects security headers.

## Vercel configuration

`vercel.json` uses the legacy `routes` array (not `rewrites` or `headers`):

```json
{
  "routes": [
    {
      "src": "/(.*)",
      "headers": { "...CSP and security headers..." },
      "continue": true
    },
    { "src": "^/docs/?$",  "dest": "/dist-docs/index.html" },
    { "src": "^/docs/(.*)", "dest": "/dist-docs/$1" }
  ]
}
```

| Route | Destination |
|---|---|
| `/` | `index.html` — the application (served by Vercel filesystem default) |
| `/docs` | `dist-docs/index.html` — VitePress documentation |
| `/docs/*` | `dist-docs/*` — VitePress documentation assets and pages |
| Everything else | Served as-is from the filesystem (JS, CSS, images, manifest) |

## Domain layout

The app and landing page are deployed as two separate Vercel projects on the same domain:

| Subdomain | Vercel project | Repo |
|---|---|---|
| `getbased.health` | `get-based-site` | [elkimek/get-based-site](https://github.com/elkimek/get-based-site) |
| `app.getbased.health` | `get-based` | [elkimek/get-based](https://github.com/elkimek/get-based) |

DNS (Namecheap): A record `@` → `76.76.21.21` (Vercel), CNAME `app` → `cname.vercel-dns.com`, CNAME `www` → `cname.vercel-dns.com`.

The landing page is self-contained (all CSS/JS inline) and depends only on three icon files. CTA links point to `https://app.getbased.health`. A small inline script rewrites these to `/app` on `localhost` for local development.

### Local dev server

`node dev-server.js` mirrors the production layout. If the site repo is cloned as a sibling (`../get-based-site`), the server routes:

| Path | Destination |
|---|---|
| `/` | Landing page from `../get-based-site/index.html` |
| `/app` | App from `index.html` |
| `/docs/*` | VitePress docs from `dist-docs/` |

Without the sibling repo, `/` serves the app directly. Override the site path with `SITE_DIR=/path/to/site node dev-server.js`.

VitePress builds to `dist-docs/` (configured via `outDir` in `docs/.vitepress/config.mjs`). The output is separate from the `docs/` source directory to avoid Vercel serving the source files as a directory listing.

## CSP headers

The Content-Security-Policy allows exactly what the app needs:

```
default-src 'self'
script-src  'self' 'unsafe-inline' https://cloud.umami.is
style-src   'self' 'unsafe-inline'
font-src    'self'
connect-src 'self'
            https://openrouter.ai
            https://api.venice.ai
            https://api.github.com
            https://cloud.umami.is
            https://api-gateway.umami.dev
            http://localhost:*
            http://127.0.0.1:*
img-src     'self' data: blob:
worker-src  'self' blob:
manifest-src 'self'
frame-src   'none'
object-src  'none'
base-uri    'self'
```

`'unsafe-inline'` is required for scripts because `index.html` has inline `onclick` attributes (by design — the architecture relies on window-exported functions called from HTML).

All JS libraries (Chart.js, pdf.js) and fonts are bundled locally in `vendor/`. No external CDN calls. Run `./update-vendor.sh` to re-download when bumping versions.

`localhost:*` and `127.0.0.1:*` in `connect-src` allow local AI servers (Ollama, LM Studio, Jan, etc.) running on the same machine. LAN IPs (e.g. `192.168.x.x`) are not supported from the hosted HTTPS app due to browser mixed-content blocking — this is a browser security fundamental, not a CSP limitation.

If a new AI provider is added, its hostname must be added to `connect-src` in `vercel.json`.

## Service worker

The service worker (`service-worker.js`) manages PWA caching. The cache name includes a version number:

```js
const CACHE_NAME = 'labcharts-v55';
```

**When to bump the version:** Any time you change an app file — JS, CSS, HTML, manifest, images. Incrementing the version busts the cache for existing users, who will download fresh files on next visit.

The service worker uses three caching strategies:

| Resource type | Strategy |
|---|---|
| AI API calls (OpenRouter, Routstr, PPQ, Venice, Local AI) | **Bypass** — `return` without `event.respondWith`. Streaming ReadableStreams must go directly to the page without SW IPC buffering |
| App shell (HTML, CSS, JS, vendor libs, fonts, images) | **Stale-while-revalidate** — serve cached, update in background |

The API bypass is critical for streaming. If the service worker intercepts a streaming SSE response, the IPC pipe between the SW and the page buffers the chunks, breaking the streaming experience. The bypass (returning without calling `event.respondWith`) routes requests directly to the network.

## PWA manifest

`manifest.json` makes the app installable as a native app on desktop and mobile:

```json
{
  "name": "getbased",
  "short_name": "getbased",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f1117",
  "theme_color": "#0f1117",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon.svg",     "sizes": "any",     "type": "image/svg+xml" }
  ]
}
```

## Vendor dependencies

Chart.js, pdf.js, and Google Fonts are bundled locally in `vendor/`. To update:

1. Edit the version pins at the top of `update-vendor.sh`
2. Run `./update-vendor.sh`
3. Bump `version.js` to bust the SW cache
4. Commit the updated `vendor/` directory
