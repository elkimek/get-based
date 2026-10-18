# Optional integrations and deployment boundaries

The core getbased app runs locally without an account or AI connection. This
guide covers the optional paths that leave the browser or require another
process. Read [SECURITY.md](../SECURITY.md) and the
[architecture contract](../ARCHITECTURE.md) for implementation ownership.

## Storage, sync and remote data

Profile data lives in localStorage and IndexedDB by default. Optional passphrase
protection encrypts browser storage. Supported provider credentials use local
device-bound encryption, or passphrase protection when configured. Maintain
backups independently of the browser.

- **Sync:** Evolu replicates end-to-end encrypted profile payloads. Pausing a
  browser retains its identity and queues edits; disconnect/reset is a separate
  Advanced action.
- **Sharing:** the browser encrypts a password-protected export. The official
  isolated Czech VPS service, hosted by SecurityNet.cz/Hukot, receives network
  metadata, the opaque envelope and expiry/deletion/abuse metadata, never the
  password or decrypted profile. Temporary copies are not backed up and may be
  lost after service failure; the source profile stays in the sender's browser.
- **Wearables:** connections are user-initiated. Official Oura, Withings, Polar
  and existing legacy Fitbit requests use a separate compatibility relay. It
  intentionally neither stores nor logs payloads, but can read forwarded
  credentials and responses. These requests do not pass through the static
  Vercel app host. WHOOP, Ultrahuman and Google Health are self-host-only and use
  the deployment operator's infrastructure and OAuth credentials. Confidential
  exchange/refresh uses that deployment's same-origin proxy; WHOOP/Google Health
  data uses it too, while Ultrahuman resource data is browser-direct through CORS.
  OAuth credentials are device-key encrypted. WHOOP/Google Health daily rows are
  device-protected and excluded from raw-data backups; WHOOP connection metadata
  and derived local values are also split into device-encrypted storage. Each
  browser connects separately; only the compact derived summary participates in
  optional encrypted sync or enabled AI/agent context.
- **Sun/UV:** official CAMS requests are rounded to a 0.1° grid in both browser
  and compatibility relay, then sent by authenticated POST to the operated
  local-grid lookup. That route does not forward/cache individual coordinates
  at Copernicus or Open-Meteo. Missing weather fields fall back browser-direct
  to Open-Meteo with the same rounded location. This is limited plaintext
  processing, not end-to-end encryption.
- **Hosted analytics:** cookieless pageview and outbound affiliate-click counts
  are on by default, disclosed at first use and switchable in Settings → Privacy.
  They contain no health records, identity or health context.

For a strictly local setup, disable analytics, leave network features off and
use same-device inference if needed. An external Knowledge Base or local/LAN
server is still a separate recipient of whatever is sent to it.

## AI activation and providers

Normal tracking works without AI. Select a provider in Settings:

| Path | Capabilities and setup |
|---|---|
| PPQ | Private TEE mode or regular hosted models, with in-app balance/top-up. |
| Routstr | Nostr-discovered Bitcoin AI nodes and the built-in Cashu wallet, with mint-specific balances and recoverable funding/transfers. |
| OpenRouter | Hosted model marketplace with OAuth or manual API key. |
| Venice AI | Hosted models; encrypted mode requires the attestation checks below. |
| Local AI | An OpenAI-compatible server such as Ollama, LM Studio, Jan or llama.cpp. |
| CLI agents | Supported capabilities through the local Companion; setup below. |
| Custom API | Your OpenAI-compatible endpoint or proxy. |

The first remote activation presents the provider-neutral AI notice and
recipient-specific approval together, but stores them separately. Enabled
automatic insights may request new analysis after relevant profile/data changes.
Same-device inference needs only the AI notice; a private/LAN endpoint is
confirmed by origin. Each remote provider/endpoint requires browser-local
sensitive-data approval before data-bearing AI requests.

A user-triggered connection check can run first without profile, chat, image
or voice content; a custom endpoint may receive a fixed synthetic compatibility
probe. The activation prompt identifies the recipient and links known Privacy
and Terms documents. Reviewing them does not accept terms on the provider's
behalf. Custom endpoints use their origin; personal/local endpoints need no
operator policy metadata.

Text imports can use deterministic identifier detection and an optional trusted
self-hosted model before AI submission. Detection can miss unusual layouts;
review the text. Image imports cannot be scrubbed and show a separate warning.

### Companion and CLI agents

The local getbased Companion supports installed Codex, OpenCode, Hermes, Grok
and OpenClaw accounts or configured model providers on Linux, macOS and Windows.
Capabilities determine supported features; health-data changes remain reviewable
drafts. Hermes/OpenClaw can route chat through a detected personal gateway or
profile; supported Hermes gateways also provide text-only explanations.

Settings supplies an OS-specific bootstrap command for temporary use. It downloads
the auditable single-file `getbased-companion.mjs` emitted by the production
build. Temporary mode stops with its Terminal/PowerShell session. Once connected,
Settings can register automatic startup, pause/resume AI work, restart Codex,
update the installed bundle or uninstall it. A recovery start command remains
available if the process has stopped completely.

Installed mode uses a systemd user service, macOS LaunchAgent or current-user
Windows scheduled task, without root/administrator access. The browser does not
expose a port or pairing token. Sources for the entry point, host, installers,
protocol and bundle are in [`bin/`](../bin/), [`server/`](../server/),
[`lib/`](../lib/), [`shared/`](../shared/) and [`scripts/`](../scripts/).

The dormant Claude adapter is not advertised or detected in normal builds.
Consumer claude.ai Free/Pro/Max credentials are not permitted for this path
without Anthropic's prior approval. Operators using Anthropic Console/API billing
may expose **Claude Agent** by starting/installing the Companion with
`GETBASED_ENABLE_CLAUDE_AGENT=api-console`, then signing in with
`claude auth login --console`. This does not authorize consumer-subscription use.

### Operator and provider metadata

Independent operators identify their own deployment in `index.html`:

```html
<meta name="getbased-operator-name" content="Example Health Cooperative">
<meta name="getbased-operator-privacy-url" content="https://example.org/privacy">
<meta name="getbased-operator-terms-url" content="https://example.org/terms">
```

Empty values do not fall back to getbased policies. Official hosts supply their
own supplementary operator links; the selected AI recipient's policies remain
primary. Additional provider metadata can be set before the main module loads
through `GETBASED_DEPLOYMENT_CONFIG.aiProviders[providerId]`, using `label`,
`privacyUrl` and `termsUrl`. See the [environment example](../.env.local.example),
[compatibility relay](../deploy/compat-proxy/README.md) and
[profile-share service](../deploy/profile-share/README.md) for service configuration.

### Venice encrypted-mode verification

Encrypted mode fails closed unless the Intel TDX quote and NVIDIA GPU evidence
both verify. The fixed NVIDIA NRAS request uses `integrations.getbased.health`
on official hosts and the deployment's same-origin `/api/proxy` elsewhere,
because NRAS does not allow browser POSTs. The policy permits only NVIDIA's
exact attestation endpoint for this operation and receives no encrypted inference
messages. Signed NRAS tokens are verified in-browser against NVIDIA's published
keys. Evidence contains no message content; a shared nonce does not prove GPU
and TDX workload co-location.

## Voice and Knowledge Base

Settings → Voice uses one service by default; an advanced toggle can select
separate dictation and reply services.

- **Automatic** reuses a connected OpenRouter, PPQ or Venice account if it
  supports the operation, otherwise browser-local models. During CLI chat it
  stays on-device unless another voice service is explicitly selected; the CLI
  agent receives transcribed text, not recordings.
- **On this device** uses quantized multilingual Whisper Small by default,
  with Medium and Large v3 Turbo options, plus Kokoro speech. CPU/WASM and
  validated WebGPU run in dedicated workers. Automatic processing tries WebGPU
  first on capable mobile browsers, CPU elsewhere, falls back safely and uses
  normalized timings to select the fastest tested backend. Each required CPU/GPU
  model variant downloads only with confirmation. Slow transcription shows
  elapsed time and can be cancelled; stalled processing stops after three
  minutes. Kokoro buffers opening segments; built-in voices are English US/UK,
  and Markdown tables are skipped with a spoken notice.
- **Local server** uses compatible `/v1/audio/transcriptions` and
  `/v1/audio/speech` endpoints, including configured LocalAI/Speaches servers.
- **Cloud voice** sends only the selected recording or reply text to the chosen
  OpenRouter, PPQ, Venice, xAI or ElevenLabs endpoint. The first three reuse AI
  settings credentials; xAI/ElevenLabs require a user API key, without delegated
  account sign-in. Keys remain device-key encrypted without passphrase protection.
  Private chat mode does not automatically extend to voice.

Microphone audio is retained only for active transcription. Dictation inserts
text at the composer cursor without sending a message. Listen controls play
assistant replies; recording/playback stops when chat closes or switches.

The Knowledge Base indexes documents locally or queries an external knowledge
server, adding relevant cited passages to chat and Current Focus. An interpretive
lens changes analysis framing; it is distinct from the document source.

## Agent Access

Agent Access gives external MCP-compatible tools only the context you enable,
through an encrypted relay and a local decryption key. Enable Cross-device Sync,
then Settings → Agent Access, choose a target client and copy its private setup
command into that agent's terminal.

The public Linux installer sets up the local agent stack:

```bash
curl -fsSL https://getbased.health/install.sh | bash
```

It does not grant private profile access. Use the app's private setup command:

```bash
curl -fsSL https://getbased.health/install.sh | bash -s -- connect <target> --setup 'gbsetup_v1_...'
```

The payload contains a read-only relay token and local Agent Context key.
**Never paste real setup values into logs, issues or public documentation.**
The systemd installer does not configure macOS, Windows or WSL1; use the
[manual setup guide](https://docs.getbased.health/guides/agent-access) there.
Agent Access and the AI Companion are separate integration paths.
