# getbased — Health intelligence that's actually yours

**getbased** is a personal health dashboard organized around five lenses: Labs, Genome, Body, Light, and Insight. It helps you read lab results alongside DNA, wearables, light exposure, lifestyle context, notes, and optional AI analysis. Free, open-source, private by default, and usable without an account.

## Five lenses

- **🩸 Labs** — biomarkers, ranges, trends, biological age across 287+ markers
- **🧬 Genome** — 47 curated SNPs, APOE haplotype, 39 mtDNA haplogroups, DNA-aware insights
- **⌚ Body** — wearables (Oura, Fitbit, Withings, Polar, Apple Health, plus WHOOP + Ultrahuman gated on partner credentials), biometrics, recovery, cycle
- **☀ Light** — sun exposure with CAMS-fed atmospheric data, photobiology devices, indoor light environment, 8 measurement tools
- **🧠 Insight** — AI chat, custom knowledge base, correlations, recommendations

**[Live app](https://app.getbased.health)** · **[Documentation](https://docs.getbased.health)** · **[Discord](https://discord.gg/zJdVB9zgQB)** · **[Nostr](https://njump.me/npub13xgjkyve82xesxxzvy52vz99z5fcuusda4cytekct2tw800kepas498nt2)**

![getbased Dashboard](dashboard.png)

---

## What it does

- **AI-powered PDF import** — drop any lab report (any format, language, or country) and AI extracts and maps results to 287+ known biomarkers automatically. Batch import, direct image import (JPG/PNG/WebP), auto image mode for scanned PDFs
- **Biomarker trend charts** — interactive line charts with proportional time scale, reference bands, optimal ranges, and trend detection across 17 standard categories
- **AI chat** — ask questions about your results with full health context, image attachments, multiple personalities, conversation threads
- **DNA import** — upload raw data from AncestryDNA, 23andMe, MyHeritage, FTDNA, Living DNA, or Illumina GenomeStudio (DNAEra and other clinical labs). 47 curated SNPs across 13 categories (methylation, iron, lipids, vitamin D, alcohol, caffeine, body composition, etc.) with APOE haplotype resolution and 39 mtDNA haplogroups including 11 sub-clades. Genetic factors shown on dashboard, detail modals, and in AI context
- **Wearable integrations** — connect Oura, Fitbit, Withings, Polar, or Apple Health (file import). HRV, resting heart rate, sleep score, readiness, activity, steps, weight, BP, body composition (Withings Body Scan: body fat %, muscle mass, vascular age, PWV, nerve health), SpO₂, body temperature, sleep architecture, and more — surfaced on the dashboard alongside your lab results. Multi-vendor source picker per metric. Manual entry first-class for weight / BP / RHR (no wearable required). Raw daily samples stay on-device; OAuth tokens never sync; only a compact ~200-token L2 summary propagates via Evolu CRDT. WHOOP and Ultrahuman gated to "waiting on partner credentials" until vendor approval lands. See [docs.getbased.health/guides/wearables](https://docs.getbased.health/guides/wearables)
- **Specialty lab adapters** — OAT (165 markers), fatty acids (Spadia, ZinZino, OmegaQuant), Metabolomix+. Any other specialty test imports through the custom marker pipeline
- **Biological age** — PhenoAge (Levine 2018) + Bortz Age (Bortz 2023) combined into a unified Biological Age marker with component breakdown
- **Calculated markers** — HOMA-IR, BUN/Creatinine ratio, free water deficit, lipid ratios (TG/HDL, LDL/HDL, ApoB/ApoA-I), NLR, PLR, De Ritis ratio, hs-CRP/HDL cardiovascular risk ratio
- **Trend alerts** — sudden changes and linear regression flagged on the dashboard
- **Correlation viewer** — compare any two markers, heatmap view
- **Compare dates** — side-by-side comparison of any two lab dates
- **Manual entry** — add results without a PDF, create custom biomarkers
- **Interpretive lens** — frame AI analysis through specific scientific paradigms or experts
- **Custom Knowledge Source** — connect your own document collection (research papers, clinical guides, any texts) to ground AI analysis in real sources. The AI searches your knowledge base for relevant passages before interpreting your labs, and cites them back to you
- **9 lifestyle context cards** — diet & digestion, sleep, exercise, stress, light & circadian, environment, EMF assessment (Baubiologie SBM-2015), and more — each gets an AI health rating and enriches all interpretations
- **Menstrual cycle tracking** — phase-aware reference ranges, cycle phase bands on charts, perimenopause detection, symptom tracking
- **Supplement & medication timeline** — overlaid on charts to correlate with biomarker changes
- **PDF reports** — export a full health report as PDF
- **Multi-profile** — track multiple people, client list with search/sort/filter

## Privacy and data ownership

- No account or sign-up required.
- By default, profile data is stored in your browser using localStorage and IndexedDB.
- Optional network features exist: AI providers, encrypted cross-device sync, password-protected profile sharing, and Agent Access.
- Personal info can be stripped from PDFs before AI processing using regex checks and optional local AI obfuscation.
- Optional AES-256-GCM encryption at rest protects browser storage with a passphrase-derived key.
- Automatic backups are available through IndexedDB snapshots and folder backup via the File System Access API.
- Venice E2EE and PPQ Private TEE modes encrypt prompts in the browser and send them to attested private runtimes.
- A local AI server keeps chat and import processing on your own machine.
- Anonymous usage stats are optional and can be disabled in Settings.

## Agent Access

Opt-in feature that lets external AI assistants query your encrypted getbased context — coding agents, terminal assistants, messenger bots, or any MCP-compatible tool you configure.

- Enable Cross-device Sync first, then enable **Settings → Agent Access**.
- Choose a setup target: Hermes Agent, OpenClaw, Claude Code, Claude Desktop, Cursor, Cline, or Codex CLI.
- Copy the private setup command from getbased. It installs or upgrades the agent stack and connects the selected client in one paste.
- Agent Access storage is bound to your Sync identity for relay quota; generating more tokens does not create more storage namespaces
- Encrypted context is pushed to a lightweight gateway on every save and profile switch; the gateway stores ciphertext only
- Per-profile: each profile's encrypted context is stored separately; agents can query any profile by ID
- Public install path: `curl -sSL https://getbased.health/install.sh | bash` (`pipx install --include-deps "getbased-agent-stack[full]"` for manual / cross-platform installs). This installs software only; private access requires the setup command copied from getbased.
- The Agent Access token authorizes relay fetches (`GETBASED_TOKEN`); the separate Agent Context key decrypts context locally inside your self-hosted MCP (`GETBASED_AGENT_CONTEXT_KEY`). Your mnemonic and raw lab data never leave the browser
- Token and context key are revocable/regenerable from the same settings panel

## AI providers

| Provider | Description |
|---|---|
| **PPQ** | 300+ models, no KYC. Bitcoin, Lightning, Monero, Litecoin. Top up directly in the app. |
| **Routstr** | Decentralized Bitcoin AI. Built-in Cashu wallet, Nostr node discovery. Fund with Lightning, pick any node. |
| **OpenRouter** | 200+ models (Claude, GPT, Gemini, Grok). Pay with card or USDC. One-click OAuth. |
| **Venice AI** | Uncensored models with optional E2EE. No-log policy. |
| **Local AI** | Any OpenAI-compatible server — Ollama, LM Studio, Jan, llama.cpp. Fully offline. Free forever. |
| **Custom API** | Bring your own OpenAI-compatible endpoint — corporate proxies, self-hosted gateways, any provider with a `/v1/chat/completions` route. Base URL + API key. |

Switch providers anytime. All non-AI features work without a provider configured.

## How it compares

| | getbased | Typical health apps |
|---|---|---|
| Scope | Five integrated lenses (Labs / Genome / Body / Light / Insight) | One data class only |
| Open source | AGPL-3.0 | Closed source |
| Cost | Free | Free tier + paid upsell |
| Data storage | Local browser, encrypted | Cloud (their servers) |
| AI providers | Several provider paths, including local AI and bring-your-own endpoints | Locked to one |
| Lab import | Any PDF, any format, any language | Specific labs/formats only |
| Biomarkers | 287+ standard + unlimited custom | Limited set |
| Specialty labs | OAT, fatty acids + custom marker pipeline for any test | Blood only |
| DNA raw data | 47 curated SNPs, APOE, 39 mtDNA haplogroups, 6 providers | No |
| Lifestyle context | 9 cards inform all AI analysis | None or basic |
| Custom knowledge base | Bring-your-own knowledge source endpoint, any documents | No |
| Account required | No | Yes |

---

## Quick start

```bash
git clone https://github.com/elkimek/get-based
cd get-based
node dev-server.js
```

Open `http://localhost:8000`. You need an AI provider API key or local AI server for PDF import and chat. All other features work without one.

## Tech stack

Native ES-module web app. There is no app bundler for the browser source, but the repo does use npm tooling for tests, Playwright, type checks, helper scripts, and deployment tasks.

- Chart.js for interactive charts
- pdf.js for PDF text extraction
- transformers.js + OPFS for the browser-local Lens (Custom Knowledge Source)
- Evolu for optional CRDT sync (E2E encrypted)
- Most runtime dependencies vendored in `vendor/`
- Installable as a PWA (works offline for non-AI features)

## Repo structure

```
get-based/
├── index.html styles.css css/  # The product shell and split feature CSS
├── js/                         # Native ES modules, runs in any browser
│   ├── lens.js                  #   Custom Knowledge Source dispatcher
│   └── lens-local*.js           #   Browser-local lens — per-library embedding model, OPFS vectors
├── tests/                      # Vitest helpers + Playwright browser assertions
├── .github/workflows/          # Tests on every PR / push
└── dev-docs/                   # Pointer to canonical developer docs in getbased-docs
```

Open `index.html` (or start `node dev-server.js` for development) and the dashboard runs. User and developer documentation live in the separate Mintlify docs repo at [docs.getbased.health](https://docs.getbased.health); `dev-docs/` is only a pointer so docs are not maintained twice.

### Related repos

- [**getbased-relay**](https://github.com/elkimek/getbased-relay) — Evolu sync relay for opt-in cross-device sync.
- [**getbased-agents**](https://github.com/elkimek/getbased-agents) — the MCP adapter for AI clients, a local knowledge server backing the "External server" Knowledge Base, and a browser setup dashboard. Install on Linux with `curl -sSL https://getbased.health/install.sh | bash`, or manually with `pipx install --include-deps "getbased-agent-stack[full]"` on any platform.

## Testing

Node-side helpers plus Playwright-driven browser assertions, all run headlessly:

```bash
./run-tests.sh
```

Starts a local server, runs Vitest, the dev-server origin guard, and Playwright. Exits 0/1.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Project board: [planned features](https://github.com/users/elkimek/projects/2).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=elkimek/get-based&type=Date)](https://star-history.com/#elkimek/get-based&Date)

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

If you run a modified version as a network service, AGPLv3 §13 requires you to offer your users the corresponding source. Vendored third-party libraries are listed under their own licenses in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
