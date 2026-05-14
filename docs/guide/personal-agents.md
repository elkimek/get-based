# Personal Agents

A personal agent is an AI assistant that lives outside the getbased browser tab — on your laptop, in your messenger, or on a self-hosted server — and answers questions about your labs using the same context the in-app chat sees. "What's my vitamin D trend?" in Telegram, "summarize my last labs" in Claude Code, or a scheduled "alert me if my hs-CRP goes above 1.0" on Hermes.

Everything runs over [**Agent Access**](./agent-access.md) — a read-only token gates what agents can see. No raw data leaves the browser, no sync mnemonic is shared.

## Supported agents

Any client that speaks the [Model Context Protocol](https://modelcontextprotocol.io) works. Tested & documented with:

- **[Hermes Agent](https://github.com/hermes-agent/hermes-agent)** — self-hosted messenger bot (Matrix, Telegram, Signal, Discord, WhatsApp). Persistent, schedule-aware.
- **[OpenClaw](https://openclaw.ai)** — self-hosted AI assistant you wire into any messenger.
- **[Claude Code](https://claude.ai/code)** — CLI agent for terminal workflows
- **[Claude Desktop](https://claude.ai/download)** — native MacOS/Windows app
- **[Cursor](https://cursor.sh)**, **[Cline](https://cline.bot)**, **[Windsurf](https://codeium.com/windsurf)** — IDE-integrated agents

Any other MCP client works too — the adapter is client-agnostic.

## How it works

```
getbased (browser) ──► Context Gateway ──► your agent (via MCP)
                       (text summary)       (read-only)
```

getbased pushes a text summary of your labs, context cards, supplements, and goals to the context gateway on every save. Your agent uses the `getbased-agent-stack` adapter with your token to read that summary and answer questions — read-only, no raw data, no mnemonic.

## Setup

Setup is covered end-to-end on the [**Agent Access**](./agent-access.md#setup) page: enable the token in **Settings → Data → Agent Access**, install `getbased-agent-stack`, and copy a paste-ready config for your client from the dashboard. That page also has the full [tool reference](./agent-access.md#compatible-tools), the [Hermes Agent example](./agent-access.md#hermes-agent-example), wearable time-series setup, and troubleshooting.

## Running a local knowledge base

`getbased-agent-stack[full]` includes `lens serve` — a local RAG server. `install.sh` already starts it as a systemd user service on Linux; on other platforms, run it manually:

```bash
lens serve                   # starts on 127.0.0.1:8322
# ingest via the dashboard's Knowledge tab, or CLI:
lens ingest ~/Documents/research
```

With `lens serve` running, the `knowledge_search` tool is grounded in your own document corpus (research papers, clinical guides, personal notes).

See [Interpretive Lens](./interpretive-lens.md#external-server) for the full RAG setup — including per-library embedding models (MiniLM for speed, BGE-M3 for quality) and connecting the same server to the in-app AI chat via the External server backend.
