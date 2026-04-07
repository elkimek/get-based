# AI Providers

getbased supports five AI backends for PDF import, chat, and dashboard AI features. You can switch between them at any time in **Settings → AI**.

## Which Features Need an AI Provider?

| Feature | Requires AI? |
|---|---|
| PDF import | Yes |
| AI chat panel | Yes |
| Focus card (dashboard insight) | Yes |
| Health status dots on context cards | Yes |
| AI-generated card tips | Yes |
| Web search in chat | Yes (OpenRouter, PPQ, Venice) |
| Charts, tables, trend alerts | No |
| Manual entry | No |
| JSON export / import | No |
| Correlations, compare dates | No |
| Marker glossary | No |

All non-AI features work fully without any provider configured.

## The Five Providers

### PPQ (Anonymous, crypto)

A pay-per-query AI aggregator with 300+ models. No subscription, no KYC. Top up with Bitcoin, Lightning, Monero, Litecoin, Aqua, or Bitrefill gift cards — directly in the app. Balance displayed in settings. Supports [web search](/guide/ai-chat#web-search) in chat.

**Setup:**
1. In Settings, select **PPQ**
2. Click **Create Account** — instant, no signup
3. **Save your API key** — PPQ accounts are anonymous with no recovery
4. Top up via the **Top Up** button (Lightning, Bitcoin, Monero, Litecoin, Aqua)
5. Choose a model from the curated dropdown

**Or** paste an existing API key from [ppq.ai](https://ppq.ai).

::: tip In-app topup
After creating an account, click Top Up to fund it with crypto. Your balance is shown with color coding — the app walks you through the payment flow with QR codes and payment polling.
:::

### Routstr (Decentralized Bitcoin AI)

Decentralized AI using Bitcoin micropayments. No account, no sign-up, no subscription. getbased has a built-in Cashu eCash wallet — fund it with Lightning, then connect to any Routstr node discovered via Nostr relays. Your prompts go directly from your browser to the node you choose.

**Setup:**
1. In Settings, select **Routstr**
2. **Fund your wallet** — click Deposit and pay the Lightning QR code (or paste a Cashu token)
3. **Pick a node** — the app discovers online nodes via Nostr. Click Connect on any node
4. **Deposit sats** — choose how much to deposit to the node. You get a session key
5. Start chatting — your wallet balance and node session balance are shown separately

**Wallet features:**
- **Seed phrase** — 12-word BIP-39 mnemonic generated on first deposit. Write it down — it's the only way to recover your wallet
- **Lightning withdraw** — send sats to a Lightning address or pay a BOLT11 invoice
- **Cashu token send/receive** — withdraw as a shareable Cashu token, or deposit one from an external wallet
- **Node withdraw** — pull remaining sats back from a node into your wallet
- **Mint selection** — change the Cashu mint (the app auto-switches when a node requires a specific mint)
- **Recovery** — if a deposit or withdrawal fails mid-operation, a recovery banner appears with your token

::: tip Wallet vs Node balance
Your **wallet balance** is sats you hold locally (Cashu proofs in your browser). Your **node session balance** is sats deposited to a specific Routstr node for API calls. You can move sats between them freely.
:::

::: warning Back up your seed phrase
The seed phrase is shown once when you first deposit. You can view it again in the wallet menu (Seed & Restore). Without it, your wallet cannot be recovered on another device.
:::

### OpenRouter (Most models, card/USDC)

A model marketplace with 200+ models — Claude, GPT, Gemini, DeepSeek, Grok, Qwen, and more. Pay with card or USDC. Balance displayed in settings. Supports [web search](/guide/ai-chat#web-search) in chat.

**Setup — OAuth (easiest):**
1. In Settings, select **OpenRouter**
2. Click **Connect with OpenRouter**
3. Authorize getbased on the OpenRouter site
4. You're connected — no API key needed

**Setup — API key:**
1. Get an API key at [openrouter.ai](https://openrouter.ai)
2. In Settings, select **OpenRouter**
3. Paste your API key
4. Choose a model from the curated dropdown, or type any model ID into the custom input field

::: tip One-click connect
The OAuth button also appears in the chat setup guide when no provider is configured.
:::

### Venice AI (Best for privacy)

A privacy-focused cloud provider where your conversations and data are not stored or logged on their servers. Venice also proxies access to GPT, Grok, and DeepSeek models. Supports [web search](/guide/ai-chat#web-search) in chat with any model.

**Setup:**
1. Get an API key at [venice.ai](https://venice.ai)
2. In Settings → AI Provider, select **Venice**
3. Paste your API key
4. Choose a model from the dropdown

::: tip End-to-End Encryption
Venice offers E2EE models where your prompts are encrypted in your browser and only decrypted inside a verified Intel TDX Trusted Execution Environment — not even Venice can read them. Enable the **End-to-End Encryption** toggle in Venice settings to switch to E2EE models. The TEE attestation is verified client-side on every session (nonce binding, signing key binding, debug mode rejection). A 🔒✓ (green checkmark) in the chat header confirms verification passed. Web search and image attachments are disabled in E2EE mode.
:::

### Local AI (Fully local)

Run a language model entirely on your own machine. Nothing is sent over the network — not even for PDF import. Local AI connects via the standard OpenAI-compatible API (`/v1/chat/completions`), which is supported by all major local servers:

- [Ollama](https://ollama.com) — easiest setup, pull models from the command line
- [LM Studio](https://lmstudio.ai) — GUI-based, drag-and-drop model loading
- [Jan](https://jan.ai) — open-source desktop app
- llama.cpp, LocalAI, and others

**Setup:**
1. Install and start any local AI server
2. Load a model (e.g., in Ollama: `ollama pull llama3.2`)
3. In Settings → AI Provider, select **Local**
4. Enter your server URL (default: `http://localhost:11434`)
5. Click **Test** — the app auto-discovers available models
6. Add an API key if your server requires one (most don't)

::: warning Ollama Cloud models are not local
Ollama supports `:cloud` models that run on Ollama's servers, not your machine. These appear in the model dropdown if you've pulled them, but your data leaves your device when using them. If privacy is why you chose Local AI, stick with locally-running models. The Model Advisor marks cloud models with a ☁ badge so you can tell them apart.
:::

::: tip Local AI also handles PII stripping
When enabled in Settings → Privacy, your local server is used to intelligently strip personal information from PDFs before analysis. See [PII Obfuscation](./pii-obfuscation.md) for details.
:::

::: tip Cross-origin (CORS) access
Local AI servers block requests from web pages by default. The app detects this and shows OS-specific instructions, but here's the quick reference:

**Ollama:**
- **Linux**: `OLLAMA_ORIGINS=* ollama serve`
- **macOS**: `launchctl setenv OLLAMA_ORIGINS "*"` then restart Ollama.app
- **Windows**: Add `OLLAMA_ORIGINS` = `*` as a system environment variable, then restart Ollama

**LM Studio:** Settings → Enable CORS

**Jan:** Settings → Advanced → Enable CORS
:::

::: warning HTTPS limits Local AI to localhost
The hosted app at `app.getbased.health` is served over HTTPS. Browsers block HTTPS pages from making requests to plain HTTP servers on your LAN (mixed content). This means **Local AI must run on the same machine** — only `localhost` / `127.0.0.1` will work. If you need to reach a server on another device, use the local dev server (`node dev-server.js`) which runs over HTTP.
:::

::: tip Model Advisor
When connected to Ollama, the app detects your GPU and shows a **Model Advisor** panel below the model dropdown. Each installed model gets a fitness rating for lab analysis (★ Recommended, Capable, Underpowered, or Inadequate) and a VRAM fit check. If none of your models are recommended, it suggests the best one to pull for your hardware. For remote Ollama servers, enter the server's VRAM manually to get accurate recommendations.
:::

::: warning Use a capable model
Models under 14B parameters struggle with accurate marker extraction from complex lab PDFs. The Model Advisor in Settings will tell you exactly which of your installed models are suitable — look for the ★ Recommended badge. When in doubt, `ollama pull qwen2.5:14b` is the best value for reliable local lab parsing.
:::

## Recommended Models

All providers show a tiered model dropdown with two groups:

- **★ Recommended** — the latest, most capable models for lab interpretation (sorted first)
- **Other** — all remaining available models

Recommended models are chosen for accuracy with medical/scientific data. You can use any model, but recommended ones produce the most reliable results.

## Model Consistency

::: warning Use the same model across imports
When you import lab PDFs, the AI generates marker keys (like `biochemistry.glucose`) to map results. Different models may generate slightly different keys for the same marker. Switching models between imports can cause the same marker to appear as two separate entries.

For best results, pick a model and stick with it for all your imports. If you do switch, getbased runs a pre-flight check before each import and warns you if your model has changed since the last import.
:::

## How Much Does It Cost?

AI providers charge you based on how much text you send and receive — but the amounts are tiny. getbased shows the exact cost of every interaction in the chat panel, so you always know what you're spending.

Here's what real usage costs with the recommended models:

| Model | Provider | Import a lab PDF | Chat message | First-time setup\* | Ongoing month\*\* |
|---|---|---|---|---|---|
| Claude Sonnet 4.6 | OpenRouter / Routstr / PPQ | ~$0.04 | ~$0.02 | **~$1.00** | **~$0.50** |
| GPT 5.4 | OpenRouter / Venice / Routstr / PPQ | ~$0.03 | ~$0.02 | **~$0.80** | **~$0.45** |
| Gemini 3.1 Pro | OpenRouter / Venice / Routstr / PPQ | ~$0.03 | ~$0.01 | **~$0.60** | **~$0.35** |
| Grok 4 | OpenRouter / Venice / Routstr / PPQ | ~$0.01 | ~$0.005 | **~$0.25** | **~$0.15** |
| Any local model | Local AI (Ollama, LM Studio) | Free | Free | **Free** | **Free** |

\* _First-time setup: importing your first labs + setting up your profile through chat (health goals, context cards, interpretive lens) — typically 3–5 imports and 30+ chat messages._

\*\* _Ongoing month: 2–3 lab imports, 20–30 chat messages, dashboard AI features (focus card, health dots). Heavy users who chat daily may spend 2–3x more._

::: tip No surprises
Every AI response in getbased shows its cost right below the message. You can see exactly what each import and chat message costs as you use the app. Most users spend **well under $1/month**. If your credits run out, getbased shows a clear message with a link to add more.
:::

::: tip Free option
Run a local model with [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), or [Jan](https://jan.ai) and pay nothing. You'll need 8GB+ VRAM (or a Mac with 16GB+ unified memory) for capable models. The Model Advisor in Settings shows exactly what fits your hardware.
:::

## Switching Providers

You can switch providers at any time in Settings without losing any data. Your API keys are stored locally in your browser and are never sent to getbased servers.
