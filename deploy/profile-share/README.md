# Encrypted profile-share service

This deployment moves the public app's opaque profile-share envelopes to a
dedicated SQLite service. The browser encrypts before upload; this service does
not receive the share password or decrypted profile.

It is deliberately independent from subscription recovery, Evolu, UV data, and
the wearable compatibility relay. Do not combine their containers, databases,
credentials, writable volumes, or rollback procedures.

## Installation

1. Copy this repository revision to `/opt/getbased-profile-share`.
2. Create `deploy/profile-share/data` as UID/GID 1000 with mode `0700`.
3. Copy `.env.example` to `.env`, set a freshly generated
   `PROFILE_SHARE_RATE_LIMIT_KEY`, and set the file mode to `0600`.
4. Build and start with Docker Compose from `deploy/profile-share`.
5. Point `shares.getbased.health` at the VPS, then expose only the loopback
   listener through that dedicated HTTPS origin and exact API path:

   ```caddy
   shares.getbased.health {
       handle /api/share {
           request_body {
               max_size 4MB
           }
           reverse_proxy 127.0.0.1:8790
           header -Server
       }

       respond 404
   }
   ```

Do not enable request-body or query-string access logging for this route. The
application client must remain on its prior same-origin `/api/share` endpoint until
synthetic create/read/delete/expiry tests, the bounded existing-link transition,
privacy disclosures, and rollback checks are complete.

## Existing-link transition

Existing Blob records are not migrated. New clients namespace VPS-owned ids as
`vps1_…` and send them directly to this service. The transition Vercel adapter
keeps older clients compatible without creating new Blob records:

- `GETBASED_PROFILE_SHARE_UPSTREAM_URL` is the exact HTTPS service URL;
- `GETBASED_PROFILE_SHARE_TRANSITION_STARTED_AT` is the cutover instant;
- `GETBASED_PROFILE_SHARE_LEGACY_BLOB_UNTIL` is no more than 31 days later.

Before the start time, `/api/share` retains its existing Blob behavior. During
the bounded window it redirects new writes to the VPS, serves still-live legacy
Blob reads/deletions, and redirects Blob misses to the VPS. After the deadline
it stops reading Blob and redirects every supported request. Remove the Blob
credential only after the deadline and an aggregate-only confirmation that no
still-live legacy record remains. Do not copy record bodies or identifiers into
logs, receipts, or migration tooling.

## Persistent state

The bind-mounted `data` directory contains the SQLite database plus its WAL and
shared-memory files. The service enforces a 512 MiB database ceiling and leaves
a host-disk reserve. Share envelopes are limited to 3.75 MB and 30 days by the
shared public request handler. Cleanup runs after link creation, at service
startup, hourly while the service is running, and when an expired link is read.

The initial operated-service policy is intentionally **no retained backup** for
this database. Share links last at most 30 days, retain no authoritative source
profile, and can be recreated by the sender. Avoiding backups also prevents a
restore from resurrecting a link that its creator stopped or that cleanup
expired. A disk or database loss can therefore invalidate outstanding links;
the client disclosure says so and the source profile remains in its browser.

Before cutover, confirm that provider snapshots are disabled for this volume or
document any unavoidable encrypted snapshot location and retention. If a
future availability requirement changes this policy, first add durable deletion
tombstones and a tested restore procedure. Any SQLite copy must use SQLite's
backup mechanism or a transactionally safe snapshot while WAL mode is active;
never copy only the main database file.

## Rollback

Before client cutover, stop this isolated service and remove only its exact
Caddy handler. After a cutover, first restore the preceding verified client so
new requests return to the old `/api/share` implementation. Remove the VPS
route only after smoke confirms the rollback. Preserve the SQLite volume until
the rollback is accepted and every `vps1_` link created before it has expired,
unless an explicit deletion decision is recorded sooner.
