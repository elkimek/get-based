---
name: getbased-health-data
description: Connect to a user's getbased health data and query their blood work, biomarkers, genome, wearables, and personal research library via the getbased MCP server. Use when a user asks about their lab results, health trends, or wants AI reasoning grounded in their own health data.
---

# getbased Health Data

[getbased](https://getbased.health) is a free, open-source Personal Health Intelligence app that runs in the user's browser. It connects five lenses on a person's biology — labs, genome, body, lifestyle, and environment — and exposes a read-only summary to AI agents through the [`getbased-mcp`](https://github.com/elkimek/getbased-agents/tree/main/packages/mcp) server.

The user's raw data and sync mnemonic never leave their device. The browser encrypts a pre-built context summary, pushes only ciphertext to the relay, and the local MCP process decrypts it with the separate Agent Context key. The relay token is not the encryption key.

## When to use this skill

Use this skill when the user wants you to reason about *their own* health data: "how's my vitamin D", "what markers are out of range", "summarize my latest blood work", "what does my research library say about X". Do not use it for general medical questions unconnected to the user's data.

## Setup

The MCP server is installed and run locally by the user — there is no hosted endpoint.

1. Install the bundled stack: `curl -sSL https://getbased.health/install.sh | bash` (recommended) or install only the adapter with `pipx install "getbased-mcp>=0.2.6"`.
2. The user enables **Settings > Agent Access** in the getbased app and copies both generated values.
3. Provide both env vars to the MCP server:
   - `GETBASED_TOKEN` — authorizes the relay fetch.
   - `GETBASED_AGENT_CONTEXT_KEY` — decrypts the encrypted context locally. The relay never receives it.
4. Add `getbased` to the MCP client config pointing at the `getbased-mcp` command.

If the token works but tools return ciphertext, empty sections, or a decryption error, the context key is missing, stale, or copied incorrectly. Update both env vars and restart the MCP client; token-only access must fail closed for current encrypted v2 contexts.

Full configuration details: https://docs.getbased.health/guides/agent-access

## Tools

| Tool | Use it for |
|---|---|
| `getbased_lab_context` | Full lab summary — biomarkers, ranges, trends, context cards, supplements, goals |
| `getbased_section` | One section (e.g. hormones, lipids) instead of the full dump — token-efficient |
| `getbased_wearables_series` | Daily wearable time-series (HRV, resting HR, sleep score, readiness, steps, weight…) over the 7/30/90-day window the user opted into |
| `getbased_list_profiles` | List profiles by name and ID; pass `profile` to any tool to target one |
| `knowledge_search` | Semantic search over the user's own research library (requires the optional RAG server) |
| `knowledge_list_libraries` / `knowledge_activate_library` / `knowledge_stats` | Manage which research library `knowledge_search` targets |
| `getbased_lens_config` | Show the Custom Knowledge Source endpoint configuration |

Start with `getbased_section()` (no args) to see the section index, then pull only what you need. Knowledge tools degrade gracefully — if the RAG server is down, the lab tools still work.

## Responsible use

- You are not a clinician. Interpret data, surface patterns and out-of-range markers, and cite reference/optimal ranges — but recommend the user confirm anything actionable with a healthcare provider.
- Ground claims in the user's actual data and, where available, their research library via `knowledge_search`. Prefer cited passages over training-data recall for health claims.
- The context is a summary, not raw records. Don't infer precision the data doesn't support.
- Respect multi-profile boundaries — never mix data across profiles unless the user asks.
