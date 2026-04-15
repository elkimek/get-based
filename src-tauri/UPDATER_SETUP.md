# Auto-updater setup

The Tauri app has the auto-updater plugin wired in but **needs three things from you** before it actually verifies + installs updates:

## 1. Generate a signing keypair

```bash
# Install the Tauri CLI if you don't have it
cargo install tauri-cli --locked

# Generate a key pair (writes ~/.tauri/getbased.key + .key.pub)
cargo tauri signer generate -w ~/.tauri/getbased.key
```

You'll be prompted for a password — store that securely. The CLI prints both keys at the end.

## 2. Put the public key in `tauri.conf.json`

Replace the placeholder in `src-tauri/tauri.conf.json`:

```json
"updater": {
  "active": true,
  "endpoints": [
    "https://github.com/elkimek/get-based/releases/latest/download/latest.json"
  ],
  "dialog": false,
  "pubkey": "YOUR_PUBLIC_KEY_HERE"
}
```

The public key is the long string in `~/.tauri/getbased.key.pub`.

## 3. Configure CI to sign + publish releases

Store the **private key** + password as GitHub secrets:
- `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/getbased.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you set

Then a GitHub Actions workflow like this builds + signs per platform and uploads to a release:

```yaml
# .github/workflows/release.yml
name: Release Desktop

on:
  push:
    tags: ['v*']

jobs:
  release:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - name: Install Linux deps
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'getbased ${{ github.ref_name }}'
          releaseBody: 'See the release notes.'
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: true
```

`includeUpdaterJson: true` makes `tauri-action` generate the `latest.json` manifest the updater fetches.

## 4. Optional: code signing for OS-level trust

Without code signing, macOS Gatekeeper and Windows SmartScreen show "unidentified developer" warnings on first launch. Auto-update still works, but the warning is bad UX.

- **macOS**: Apple Developer cert ($99/yr) — set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` as GitHub secrets, and `tauri-action` will sign + notarize.
- **Windows**: EV cert (~$300/yr) — set `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD`.

These are optional — the updater itself uses its own Tauri-managed signing keys to verify updates regardless.

## How the user-facing flow works

1. App launches → `js/updater.js` waits 30s, calls `check_for_update`
2. Tauri fetches `latest.json` from the configured endpoint
3. If a newer version exists: a banner appears in the bottom-right corner with release notes
4. User clicks **Install & Restart** → updater downloads the platform-specific binary, verifies its signature against the embedded pubkey, applies it, and restarts the app
5. **Skip this version** dismisses + remembers the user's choice (per-version, in localStorage)

Background re-checks every 6 hours.

## Until you set this up

The plugin is wired but the placeholder pubkey means signature verification will fail on any actual update. The check itself just silently no-ops in console (no broken UX). Once you put a real pubkey + endpoint in place and ship a release, it just works.
