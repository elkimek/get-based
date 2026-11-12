# Self-host getbased

The production app can run on your own computer. This source-based setup needs
[Git](https://git-scm.com/downloads), Node.js **24.20 or later within version 24**,
npm and a current browser. Use a terminal on Linux or macOS, or PowerShell on Windows.

## Prebuilt package

`npm run self-host:package -- --artifact dist --output artifacts` packages the
qualified production app and a dependency-free Node server into an npm tarball
and SHA-256 checksum. The package version comes from the artifact's `APP_VERSION`.
Users download that release asset, install it with `npm install --global ./getbased-self-host.tgz`,
and run `getbased`. `--help` and `--version` work without starting the listener.
The same package runs on Linux, macOS and Windows with Node.js 24.20 or later
within version 24. This does not install a startup service.

## Build and start

```bash
git clone https://github.com/elkimek/get-based
cd get-based
npm ci
npm run production:build
npm run self-host
```

Keep the last command running. It serves the assembled app at
`http://127.0.0.1:8000/app`, on the computer where you started it. It listens only
on loopback, serves only public files in `dist/`, and uses the deployed security
headers. It does not expose the source checkout, store health records on the
server, or provide the optional integration APIs.

`npm run self-host` compiles the server's source first; it does not rebuild the
production app. If `dist/` is missing, run `npm run production:build`. If port
8000 is occupied, stop the other server. You can set `GETBASED_SELF_HOST_PORT`
to another fixed port, but changing a browser's URL creates a different storage
origin. Do not switch ports after storing records without exporting them first.

## Use private HTTPS on computers, phones and tablets

1. [Install Tailscale](https://tailscale.com/docs/install) on the host computer
   and each device you want to use. Sign them into your private tailnet.
2. Keep `npm run self-host` running. In a second terminal on the host, run:

   ```bash
   tailscale serve --bg http://127.0.0.1:8000
   ```

3. Follow Tailscale's prompt to enable HTTPS if needed. Open the HTTPS address it
   prints, ending in `.ts.net`, and bookmark it. Use that same full address on
   the host computer, phone and tablet, with `/app` if needed.
4. Check the mapping with `tailscale serve status`. Tailscale Serve keeps this
   proxy configuration in the background. The getbased process still needs to
   be running; this command does not install getbased as a startup service.

[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) provides
private HTTPS for devices allowed by your tailnet's access policy. It requires
Tailscale on those devices. Use Serve for this setup; Funnel would make the
service publicly reachable. Existing Serve configurations may already use port
443, so check the current status before replacing a mapping. To remove this
HTTPS mapping, use `tailscale serve --https=443 off`.

Choose this HTTPS address before importing your data. `http://127.0.0.1:8000`,
`http://localhost:8000` and the Tailscale HTTPS address have separate browser
storage. Keep the host's Tailscale name stable. An exact `getbased.local` address
is not configured by this installer.

The host must be awake and reachable to load new assets and updates. The PWA can
use its cached assets offline after installation, but integrations and sync may
still need connectivity. Tailscale's background proxy does not keep a sleeping
computer awake.

## Move records without losing the original

Use **Settings → Data → Backup & Restore → Start migration** at the original
address, or its same-origin `/app/migration.html` recovery screen. This entry
stays inside the installed app's `/app` scope. Save/remove unsent image originals
before leaving the app; the native action flushes and verifies saved text drafts.

Create and download an encrypted migration file, inspect it at the final
self-hosted HTTPS address, and restore into a fresh browser installation. Install
and open a destination PWA before restoring if that is the intended storage
context. Keep the source browser and passphrase until profiles, dates, notes,
chats, meals, wearable history, Knowledge Base files and wallet have been checked
after a reload. Sync is paused at the destination until explicitly resumed.

The archive carries all recognized application localStorage, IndexedDB stores
and local Knowledge Base OPFS files. Browser-bound data is decrypted locally
and protected by the archive password; the destination generates fresh
non-exportable keys. OAuth logins, Companion pairing and folder permissions
need setup again. Models and regeneratable caches are excluded. Wallet proofs,
counters and recovery journals are retained without making a mint request;
spending should continue from one active installation only.

Saved ordinary snapshots can be prepared and downloaded from the recovery
screen without unlocking or replacing the source. They remain partial backups,
not a complete migration. The current archive format has a 512 MiB decoded limit
and uses in-memory WebCrypto; large installations need additional recovery
qualification before a hosted cutoff. The public
[migration guide](https://docs.getbased.health/guides/move-to-self-hosting)
contains the user steps and recovery table.

## Use more than one device

Serving the app from a computer does not turn that computer into a health-data
server. Each browser keeps its own local data, even when devices open the same
HTTPS address. To keep supported profile records in sync, configure encrypted
Sync using the same recovery identity and relay. The official relay remains an
option during migration; a private relay is optional.

Sync does not transfer every local store. Check the
[sync guide](https://docs.getbased.health/guides/cross-device-sync) and the
[backup guide](https://docs.getbased.health/guides/backup) before relying on it.
Restoring a backup and joining an existing Sync identity are separate actions;
review the destination's restore/sync confirmation before publishing changes.

## Optional services

The static server does not implement `/api/proxy`, sharing, OAuth token exchange,
paid services or the Companion. Normal local tracking works without them. See
[optional integrations](optional-integrations.md) to deploy or configure the
services you choose. Provider OAuth registrations must allow the actual callback
origin; moving to a private hostname can require new provider configuration and
reconnecting. A private HTTPS address alone does not configure these integrations.

## Stop, update and recover

Press **Ctrl+C** in the getbased terminal to stop the server. Restart it with
`npm run self-host` from the same checkout. Keep the same port and HTTPS address.
This source setup does not install a system service or open a firewall port.

Before updating, download a fresh backup and record the current revision with
`git rev-parse HEAD`. Stop the server, then update a clean checkout:

```bash
git pull --ff-only
npm ci
npm run production:build
npm run self-host
```

Use the app's existing update prompt when a new version is available. If the
build fails, keep the source browser data and backup; resolve the build before
restarting. An older application revision may not understand newer stored data,
so switching code revisions is not a substitute for a verified backup restore.

If the HTTPS address fails, check `tailscale status`, `tailscale serve status`,
the running getbased terminal and whether the host is asleep. If records appear
missing, first check the exact address and browser profile. Do not clear site
data as a troubleshooting step before recovering your records.

## Hosted transition requirements

A demo-only hosted deployment requires a complete migration path first. Preserve
the original hosted origin as a recovery surface with direct export and saved
snapshot downloads. Put the demo on a separate origin; do not redirect users
away from their source storage or delete it during an upgrade.

Before restricting personal-data use, qualify a portable archive for every
irreplaceable store, fresh-origin recovery, interrupted exports/restores,
existing destination conflicts, encryption and multi-device setup. Provide a
first-visit notice and a persistent recovery entry, with a separate completion
step after users check the destination. Give users 30 days from the actual published announcement before the cutoff
and keep the official encrypted relay available during migration. The ordinary
backup controls described above do not establish this complete migration path.
