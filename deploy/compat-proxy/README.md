# Compatibility proxy deployment

This image runs the public core's narrow `api/proxy.js` policy on a
maintainer-controlled Node server. It is intended for a single-instance VPS
behind Caddy or another TLS reverse proxy. It does not replace the Evolu relay
and must run as a separate container.

The official hosted mode accepts only the operations classified by
`lib/proxy-policy.js`. It does not provide a generic hosted AI proxy. Request
bodies, wearable credentials, health responses, and OAuth payloads remain
transient in memory and are not written or logged by this service.

## Runtime configuration

Copy `.env.example` to an untracked `.env`, set only the credentials needed by
the enabled official integrations, and keep the file readable only by the VPS
administrator. The composed container is read-only, runs as the Node image's
unprivileged user, binds to host loopback on port 8787, and uses a bounded
single-process rate limiter.

Build and start from the repository root:

```sh
docker compose -f deploy/compat-proxy/docker-compose.yml build
docker compose -f deploy/compat-proxy/docker-compose.yml up -d
```

Example Caddy route when sharing the existing sync hostname:

```caddyfile
sync.example.com {
    handle /compatibility-proxy {
        request_body {
            max_size 8MB
        }
        rewrite * /api/proxy
        reverse_proxy 127.0.0.1:8787
        header -Server
    }

    # Existing Evolu routes follow.
}
```

Caddy supplies and sanitizes the standard `X-Forwarded-*` headers by default.
Do not add an access logger that records request bodies or authorization data.

## Verification and rollback

Before changing a client endpoint, verify all of the following through the
public TLS route:

- `OPTIONS` from every exact allowed app origin returns 204 with the matching
  `Access-Control-Allow-Origin` value.
- an unapproved origin returns 403;
- a generic authenticated AI request returns 403;
- credential-free public-page and configured CAMS operations return 200;
- every configured wearable completes an OAuth exchange/refresh and a data
  read without logging its payload.

Keep the prior client revision and reverse-proxy configuration until those
checks pass. Rollback consists of restoring the prior Caddy configuration and
deploying the prior client revision; the original same-origin function remains
available until a separate removal is reviewed.
