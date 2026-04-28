# Cross-Device Sync

getbased can sync your profiles, lab data, and AI settings across multiple devices using end-to-end encrypted CRDT sync. The relay server only sees ciphertext — your data is encrypted before it leaves your browser.

## How It Works

Sync is powered by [Evolu](https://www.evolu.dev/), a local-first CRDT (Conflict-free Replicated Data Type) engine. When you enable sync:

1. A **24-word mnemonic** is generated — this is your sync identity and encryption key
2. Your data is encrypted with a key derived from this mnemonic and pushed to a relay server
3. Other devices using the same mnemonic can pull and decrypt your data

The relay server stores only encrypted blobs. Without your mnemonic, the data is unreadable.

## Setting Up Sync

The fastest path is the dashboard's **🛡 Protect your data** pill, which opens a small picker that includes Cross-device Sync. Or open **Settings → Data** directly.

### First Device (New Setup)

1. Open **Settings → Data** (or click the dashboard *Protect your data* pill → *Cross-device Sync* card)
2. Toggle **Cross-device sync** on
3. In the setup modal, click **New setup**
4. Your 24-word mnemonic is displayed in cleartext — **write it down and store it offline**
5. Check "I have saved my mnemonic somewhere safe"
6. Click **Done**

Your data is now syncing to the relay. All profiles are pushed automatically.

### Additional Devices (Join Existing)

1. Open **Settings → Data**
2. Toggle **Cross-device sync** on
3. In the setup modal, click **Join existing**
4. Paste your 24-word mnemonic from your first device
5. Click **Restore**

The page reloads and pulls your data from the relay. All profiles and AI settings sync over.

::: warning
Anyone with your mnemonic can access your synced data. Treat it like a password — store it offline, never share it.
:::

## What Syncs

- All profile data (lab entries, context cards, notes, supplements, cycle data, custom markers, EMF assessments)
- Profile metadata (name, sex, DOB, location, tags)
- AI settings (provider, API keys, model selections, Venice E2EE toggle)

- Chat threads, messages, and custom personalities
- Display preferences (unit system, range mode, chart overlays)

Settings such as theme are device-specific and do not sync.

### Wearable data

Wearables follow a deliberate split:

- **The L2 summary syncs.** Latest values, baselines, weekly trends, and anomaly events for every connected metric — about 200 tokens per profile — flow to your other devices alongside everything else. Strip cards on Device B show the right numbers immediately after sync.
- **Raw daily rows stay local.** The full 90-day history (every per-day HRV / sleep / RHR / manual entry) lives in a per-device IndexedDB and is excluded from the sync payload. Detail-modal charts on Device B will be empty until you OAuth-connect each vendor there.
- **OAuth tokens never sync.** Each device has to authorise each wearable independently. By design — a stolen mnemonic shouldn't grant the attacker continuous access to your live wearable feeds.

Profile delete drops the per-device wearable IndexedDB along with the localStorage data. Auto-backup and folder-backup capture the full wearable IDB so a restore round-trips your raw history.

## Profile deletion across devices

When you delete a profile, getbased tombstones the corresponding row on the relay (`isDeleted: 1`). On the next pull, every other paired device sees the tombstone and wipes its local copy automatically — single-profile deletes propagate without prompting.

For batched deletes (≥ 2 profiles tombstoned at once), the receiving device quarantines the wipe and surfaces a confirm UI in **Settings → Sync**. You'll see a row per pending tombstone with **Apply delete** and **Restore** buttons. This is a defence against a leaked mnemonic — an attacker publishing tombstones for every profileId would otherwise silently wipe all paired devices on next pull. The threshold (2) is conservative; bump it in `js/sync.js:TOMBSTONE_BATCH_THRESHOLD` if your workflow legitimately involves frequent multi-profile cleanup.

**To reject a quarantined tombstone**, click **Restore** — getbased re-publishes the local profile data, which beats the tombstone in CRDT last-write-wins on the next pull. To accept, click **Apply delete** — the local wipe runs (localStorage + wearable IDB) and the entry clears.

## Mnemonic Security

Your mnemonic is your encryption key. getbased takes several precautions:

- **Masked by default** — shown as bullet characters in Settings, with a Show/Hide toggle
- **Clipboard auto-clear** — when you copy the mnemonic, the clipboard is cleared after 60 seconds
- **No server storage** — the mnemonic is generated and stored locally by the Evolu engine, never sent to any server

### Regenerating Your Mnemonic

Disabling sync resets your identity — the page reloads to clean up the sync engine. Re-enabling sync generates a fresh mnemonic. Your other devices will need to join with the new mnemonic.

::: danger No recovery
If you lose your mnemonic, there is no way to recover your sync identity. You can still access your local data, but you will need to set up sync again with a new mnemonic on all devices.
:::

## Sync Status Indicator

When sync is enabled, a small colored dot appears in the header (next to the settings gear):

| Dot | Meaning |
|-----|---------|
| 🟢 Green | Synced — relay connected, data confirmed |
| 🔵 Blue (pulsing) | Syncing — push or pull in progress |
| 🟡 Amber | Offline — relay unreachable, changes saved locally |
| 🔴 Red | Error — sync failed |

**Click the dot** to see details: relay connectivity, last push/pull timestamps, and a "Sync now" button for manual retry. The "Settings" link opens the Data tab directly.

The indicator checks relay connectivity every 60 seconds and monitors Evolu's error channel for connection drops.

## Conflict Resolution

Sync uses **last-write-wins** at the profile level, based on timestamps. This is designed for single-user, multi-device use — one person using getbased on their phone and laptop. If you edit the same profile on two devices simultaneously before they sync, the most recent push wins.

## Relay Server

The relay is a blind store-and-forward server — it holds encrypted blobs and broadcasts them to your other devices. It never sees your plaintext data.

By default, sync connects to `wss://sync.getbased.health`. When accessing the app via [Tor](./tor-access.md), the relay automatically switches to the .onion address (`ws://`). You can also change the relay in **Settings → Data → Advanced** to point to your own. A status indicator (green/red dot) shows whether the relay is reachable.

### Running Your Own Relay

The relay is open source ([Evolu relay](https://github.com/evoluhq/evolu/tree/main/apps/relay)). It runs as a single Docker container with an embedded SQLite database — no external dependencies.

**Requirements:** Any Linux VPS (1 CPU, 1GB RAM, $5/mo), Docker, and a domain with TLS.

**1. Start the relay:**

```bash
docker run -d \
  --name evolu-relay \
  --network host \
  --restart unless-stopped \
  evoluhq/relay:latest
```

This starts the relay on port 4000 (WebSocket only, no HTTP).

**2. Add TLS with Caddy:**

Install [Caddy](https://caddyserver.com/) and create `/etc/caddy/Caddyfile`:

```
sync.yourdomain.com {
    reverse_proxy 127.0.0.1:4000 {
        transport http {
            versions h1
        }
    }
}
```

The `versions h1` directive is required — WebSocket upgrades need HTTP/1.1.

```bash
systemctl restart caddy
```

Caddy auto-provisions a TLS certificate via Let's Encrypt.

**3. Point DNS:** Add an A record for `sync.yourdomain.com` → your server's IP.

**4. Use it:** In getbased, go to **Settings → Data → Advanced** and enter `wss://sync.yourdomain.com`. The status dot turns green when connected.

::: tip Security hardening
For a production relay, disable SSH password auth, enable UFW firewall (allow only 22, 80, 443), and enable unattended-upgrades for automatic security patches.
:::

## Relationship to Encryption

Cross-device sync and [local encryption](./encryption.md) are independent systems:

- **Local encryption** (passphrase → AES-256-GCM) protects your localStorage data at rest on each device
- **Sync encryption** (mnemonic → Evolu's key derivation → XChaCha20-Poly1305) protects data in transit and on the relay

You can use either, both, or neither. Enabling local encryption does not affect sync, and vice versa.
