# Settings

Open Settings by clicking the gear icon in the header. Settings are organized into six sections: Profile, Display, AI Provider, PDF Import Privacy, Security, and Data.

## Profile

### Biological Sex

Select male or female. This affects:

- Reference ranges for sex-specific markers (testosterone, estradiol, hematology values)
- PhenoAge calculation (biological age)
- Menstrual cycle tracking, which is only available for female profiles

### Date of Birth

Required for PhenoAge (biological age calculation). PhenoAge uses a validated formula from Levine et al. 2018 that computes biological age from 9 biomarkers compared against your chronological age. Without a date of birth, PhenoAge cannot be calculated.

### Location (Country and Postal Code)

Your location is used to auto-detect a latitude band for the **Light & Circadian** context card. Latitude influences UV exposure availability, seasonal light patterns, and how the AI interprets your circadian context. getbased maps your country and postal code to one of five latitude bands — no precise location is stored or transmitted.

## Display

### Units (EU / US)

Toggle between EU (SI) units and US units:

- **EU mode**: mmol/L for glucose and cholesterol, µmol/L for creatinine, etc.
- **US mode**: mg/dL for glucose, mg/dL for cholesterol, mg/dL for creatinine, etc.

The toggle converts all displayed values and reference ranges simultaneously. Your stored data always uses SI units internally.

### Date Range Filter

Control how much history is shown in charts and trend analysis:

- **All time** — show every data point ever imported
- **Last year**, **Last 6 months**, **Last 3 months** — zoom into recent history

The selected range applies to charts, trend alerts, and the flagged markers section.

### Theme

Switch between **dark** (default) and **light** mode. The preference is stored locally and applied on every visit.

### Time Format

Choose between **24-hour** and **12-hour** (AM/PM) time display. This affects how meal times appear in the Diet context card.

### Guided Tour

Click **Take a Tour** to replay the 7-step spotlight walkthrough. The tour highlights the drop zone, sidebar navigation, lifestyle context cards, settings, feedback button, and AI chat panel. The tour auto-triggers after your first data import.

### AI Features Toggle

At the top of the AI Provider tab, a toggle slider lets you **pause all AI features** globally. When paused, PDF import hints show "AI features are paused," the chat panel displays a message with an "Enable AI" button, and no automatic AI calls (health dots, focus card) are made. Your API keys and settings are preserved — flip the toggle back to resume.

## AI Provider

Choose and configure one of five AI backends:

| Provider | Best for |
|---|---|
| **OpenRouter** | 200+ models, pay with card or crypto |
| **Routstr** | Decentralized Bitcoin AI, built-in Cashu wallet, no account needed |
| **PPQ** | Pay-per-query, 300+ models, crypto or gift card topup |
| **Venice** | Privacy-first, nothing logged on their end |
| **Local** | Fully local, completely offline, free — Ollama, LM Studio, Jan, etc. |

Each provider has its own panel:

- **OpenRouter, PPQ, Venice**: Paste your API key, select a model from the dropdown. OpenRouter also has a custom model input for any model ID not in the curated list — a health check indicator (✓/✗) confirms connectivity. The app fetches available models from the provider automatically when you open Settings.
- **Routstr**: Fund the built-in Cashu wallet (Lightning or Cashu token), browse online nodes discovered via Nostr, deposit sats to connect. A 12-word seed phrase is generated on first deposit for wallet recovery.
- **Local**: Enter your server URL (default `http://localhost:11434`), optionally add an API key, and choose from your locally available models. Works with any OpenAI-compatible server. When connected to Ollama, a **Model Advisor** panel appears showing your GPU, each model's fitness for lab analysis (★ Recommended / Capable / Underpowered / Inadequate), and VRAM fit. If you don't have a recommended model, it suggests the best one to pull.

See [AI Providers](./ai-providers.md) for full setup instructions.

## PDF Import Privacy

Shows the current status of PII obfuscation — whether a local AI server is connected and being used, or whether the regex fallback is active.

Expand the **Configure Local AI** panel to:

- Set the server URL for PII stripping (can be different from the main AI server)
- Select a dedicated model for PII stripping
- Enable debug mode to view a before/after diff of what was replaced in your PDF text

All options in the Privacy section use toggle sliders for quick on/off switching.

See [PII Obfuscation](./pii-obfuscation.md) for a full explanation of how this works.

## Security

### Encryption

Enable AES-256-GCM encryption at rest with a passphrase. When enabled, all health data is encrypted before being written to localStorage. See [Encryption](./encryption.md) for details.

Passphrases must meet strength requirements: at least 8 characters, with mixed case and a special character. A live strength meter shows progress as you type.

### Change / Disable

You can change your passphrase or disable encryption from this section. Disabling encryption decrypts all data back to plaintext.

## Data

### Backup & Restore

View and restore IndexedDB auto-backup snapshots (up to 5 rolling copies). See [Encryption](./encryption.md#automatic-backups) for how auto-backup works.

### Folder Backup

Pick a local folder (Proton Drive, Dropbox, NAS) to auto-save backups using the File System Access API. See [Folder Backup](./folder-backup.md) for details.

### Import History

Lists all imported data entries by date, showing marker count, source filename(s), and the AI model used. When multiple PDFs are imported on the same date, it shows "2 files" — hover to see all filenames. Each entry can be removed individually.

### Export & Import

Quick access to JSON export (current profile) and data clearing. For full export options including per-client and database bundles, see [JSON Export & Import](./json-export-import.md).

### Agent Access

Let AI agents query your labs via [getbased-mcp](https://github.com/elkimek/getbased-mcp). Works with [Hermes Agent](https://github.com/hermes-agent/hermes-agent), [OpenClaw](https://openclaw.ai), and any MCP-compatible agent. Toggle on to generate a read-only token, then paste it into your agent's config. See [Agent Access](./agent-access.md) for full details.

### Recommendations

Toggle supplement and lifestyle recommendations on or off. When enabled, flagged markers show contextual suggestions in the detail modal, chat, and context card health dots.

::: tip Settings are stored locally
All settings — API keys, unit preferences, theme, provider choice — are stored in your browser's localStorage. They never leave your device.
:::
