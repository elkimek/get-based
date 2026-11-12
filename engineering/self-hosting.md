# Self-host getbased

The production app can run on your own computer. This source-based setup needs
[Git](https://git-scm.com/downloads), Node.js **24.20 or later within version 24**,
npm and a current browser. Use a terminal on Linux or macOS, or PowerShell on Windows.

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

Open the original getbased address in the browser profile or installed PWA
where your records live. A new address cannot read another address's browser
storage.

1. In **Settings → Data → Backup & Restore**, choose **Download Backup**.
   Keep the file and the passphrase if the backup is encrypted.
2. To recover an older saved backup, expand **Recent snapshots** and choose
   **Download** beside that snapshot. This does not restore it over your current
   records. A snapshot only contains the data saved at its displayed time.
3. Open your chosen self-hosted HTTPS address and use **Restore Backup**.
   Read the confirmation, particularly if the destination already has records.
4. Check every profile, important dates, notes, sent chats and supported wearable
   history. Reload and unlock again if applicable. Keep the original browser
   storage and the backup file until you have checked the recovered records.

Ordinary backups are not complete device migrations. Unsent chat drafts,
WHOOP/Google Health raw histories, local Knowledge Base libraries, downloaded
models, wallet funds and wearable authentication need separate recovery or
setup. Do not erase the source on the strength of a successful ordinary restore.
Use the wallet's own export/recovery controls for funds; reconnect wearable
providers and reselect any automatic backup folder on the new origin.

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
step after users check the destination. Announce the change before the cutoff
and keep the official encrypted relay available during migration. The ordinary
backup controls described above do not establish this complete migration path.
