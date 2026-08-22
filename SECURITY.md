# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in getbased, please report it privately via [GitHub Security Advisories](https://github.com/elkimek/get-based/security/advisories/new).

Do **not** open a public issue for security vulnerabilities.

I'll acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Scope

- Application code (HTML, CSS, JavaScript)
- Data handling (localStorage, encryption, PII obfuscation)
- AI API key management
- Cross-device sync (Evolu relay)
- PDF import pipeline

## Out of Scope

- Third-party AI provider APIs (report directly to the provider)
- Self-hosted relay infrastructure (report to the relay operator)
- Browser vulnerabilities

## Data Architecture

getbased is local-first. Health data stays in browser storage by default;
optional network features activate only when the user chooses them. Cross-device
sync uses end-to-end encrypted CRDT replication, so its relay sees ciphertext.
Profile sharing encrypts a selected export in the browser before upload. The
operated profile-share service stores only the opaque envelope and minimal
expiry, deletion, and keyed abuse-control metadata in an isolated SQLite
database; it never receives the share password or decrypted profile. The
initial operated service keeps no retained database backup so a restore cannot
resurrect stopped or expired links; an infrastructure loss may invalidate these
temporary copies without affecting the browser-held source profile. Existing
Blob records are served only through a fixed, at-most-31-day transition window
and are not copied into the new database.

API keys are stored in the browser via `encryptedSetItem` (AES-256-GCM) when encryption is enabled.

## Dependency Monitoring

`vendor/components.json` is the machine-readable inventory for browser
libraries and assets committed under `vendor/`. `npm run supply-chain:check`
fails when a vendored file is unowned, multiply owned, or missing the package
metadata required for its monitoring mode.

`npm run sbom` combines that inventory with `package-lock.json` into
`artifacts/getbased.cdx.json` in CycloneDX 1.5 format. The Supply chain GitHub
Actions workflow uploads the SBOM and submits the ten versioned npm vendor
components to GitHub's dependency graph, where supported packages receive
Dependabot vulnerability alerts. Non-npm components such as SQLite and
venice-e2ee remain visible in the SBOM; unversioned font assets are inventory
checked but are not eligible for version-based advisory matching.
