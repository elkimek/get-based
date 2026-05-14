---
name: getbased-health-data
description: Connect to a user's getbased health data and query their blood work, biomarkers, genome, wearables, and personal research library via the getbased MCP server. Use when a user asks about their lab results, health trends, or wants AI reasoning grounded in their own health data.
---

# getbased Health Data

[getbased](https://getbased.health) is a free, open-source Personal Health Intelligence app that runs in the user's browser. It connects five lenses on a person's biology — labs, genome, body, lifestyle, and environment — and exposes a read-only summary to AI agents through the [`getbased-mcp`](https://github.com/elkimek/getbased-agents/tree/main/packages/mcp) server.

The user's raw data and encryption keys never leave their device. The MCP server reads the same pre-built context text the in-app AI chat uses — not the underlying database.

## When to use this skill

Use this skill when the user wants you to reason about *their own* health data: "how's my vitamin D", "what markers are out of range", "summarize my latest blood work", "what does my research library say about X". Do not use it for general medical questions unconnected to the user's data.

## Setup

The MCP server is installed and run locally by the user — there is no hosted endpoint.

1. Install: `pip install getbased-mcp` (or the `getbased-agent-stack` bundle).
2. The user enables **Settings > Data > Agent Access** in the getbased app and copies the read-only token.
3. The token is provided to the MCP server via the `GETBASED_TOKEN` environment variable. It grants access to lab-context text only, no raw data, and is revocable.
4. Add `getbased` to the MCP client config pointing at the `getbased-mcp` command.

Full configuration details: https://app.getbased.health/docs/guide/agent-access

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
