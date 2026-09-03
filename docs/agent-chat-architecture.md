# Agent-backed chat architecture

## Decision

Get-based presents an installed agent as an **AI provider source** alongside
API providers and locally served models. Internally it remains an agent
backend, not a pretend OpenAI-compatible endpoint: a user-owned localhost
companion owns the agent process and its session. Get-based remains the
authority for health data and fulfills only explicitly registered semantic
tools.

Settings uses the label **CLI agents**. “Local models” is reserved for local
inference servers such as Ollama, LM Studio, and Jan. “Agent Access” remains a
separate inbound feature for agents that query Get-based through the encrypted
Evolu relay.

The first agent target is Codex through `codex app-server`. Its JSON-RPC
protocol supplies thread lifecycle, streamed agent events, dynamic tool calls,
and approval requests. The loopback host supplies origin checks and pairing
authentication. Other agent runtimes can be added behind the same
companion contract. External MCP clients continue to use the same Get-based
tool semantics through `getbased-agent-stack`.

```text
Get-based PWA
  ├─ direct-model backend ───────────────> existing AI providers
  └─ local-agent backend ── loopback ───> getbased-agent-host
                                             ├─ Codex app-server (stdio)
                                             └─ future agent adapters

Get-based data authority
  └─ agent tool runtime
       ├─ getbased_lab_context  [read]
       └─ getbased_section      [read]
```

The browser cannot safely or portably spawn local executables. The companion
therefore translates loopback HTTP/event streams into each agent runtime's
native protocol. It must bind to loopback only, authenticate a paired browser
session, allow the Get-based origin explicitly, and never become a remotely
reachable health-data proxy.

## One tool contract, multiple adapters

`js/agent-tool-runtime.js` is the protocol-neutral catalog and execution
boundary. The initial catalog deliberately matches the existing MCP names:

| Tool | Access | Behavior |
| --- | --- | --- |
| `getbased_lab_context` | read | Returns the user-approved context projection for the active/default or requested profile. |
| `getbased_section` | read | Lists projected sections or returns one exact/prefix match. |

The catalog can be rendered as Codex app-server `dynamicTools`; calls are
answered using its `{ success, contentItems }` response shape. An MCP adapter
can expose the same definitions and call behavior. Tool handlers receive a
`readContext` dependency rather than reaching into global state, IndexedDB,
localStorage, or the DOM.

The browser binding must use the normal context builder without bypass flags.
This preserves the user's context toggles and prevents a connected agent from
reading data the user excluded from AI context.

## Capability and approval model

Tools are classified before they are implemented:

| Class | Examples | Rule |
| --- | --- | --- |
| `read` | Read approved context or one section | May run during an agent turn. |
| `navigate` | Open a Get-based view | May change UI state, never health data. |
| `draft` | Prepare a note or proposed regimen change | Creates a reviewable draft only. |
| `commit` | Apply an approved draft | Requires a separate, explicit in-app approval tied to the exact draft. |

No tool grants raw DOM control, arbitrary JavaScript, shell access, direct
database access, credential access, or a generic record-update primitive.
Write support starts with narrow draft tools. The commit tool validates the
draft again and uses existing Get-based persistence paths so migrations,
change history, encryption, and sync hooks remain intact.

Codex command/file approvals and Get-based data approvals are separate. The
read-only milestone declines every Codex command, file, MCP elicitation, and
permission request. A later capability may render selected requests in chat,
but accepting a Codex sandbox action will never imply permission to mutate
Get-based health data.

## Initial turn flow

1. The user selects an installed CLI agent in Settings → AI or during chat onboarding.
2. The local companion supplies the browser with an authenticated connection
   automatically and reports available agents and models.
3. The companion starts or resumes an agent thread and registers the allowed
   Get-based tool definitions.
4. The PWA sends the user turn. The companion normalizes streamed events such
   as text deltas, tool activity, approval requests, completion, and errors.
5. When the agent calls a Get-based tool, the companion forwards the bounded
   call to the paired PWA. The PWA executes the registered handler and returns
   only the result projection.
6. The Get-based chat stores its own messages plus the external agent/thread
   identifier needed to resume later.

The first end-to-end milestone remains read-only. Navigation, drafts, and
commits are added only after the agent stream, reconnect behavior, pairing,
and activity display are working reliably.

## Current development workflow

1. Install and sign in to Codex CLI on the machine running Get-based.
2. From the repository, run the normal `npm run dev-server` command.
3. Open **Settings → AI → CLI agents** and enable **Codex**. Get-based detects
   the CLI, starts its local bridge, and reuses its existing sign-in.

The Codex row reads the CLI model catalog and lets the user choose the model
and supported reasoning effort without leaving Get-based. Transport URLs and
pairing credentials are intentionally not part of the normal user interface.
The standalone `npm run agent-host` command and its environment variables
remain an advanced development/self-hosting escape hatch, not an onboarding
requirement.

## Hosted Linux companion

A hosted browser cannot start an operating-system process. The production
build therefore emits a single dependency-free `getbased-companion.mjs`
download. When no companion is detected, **Settings → AI → CLI agents** shows
one copyable Linux command that downloads this file from the current Get-based
origin and runs its installer. Local development shows the equivalent
`npm run companion:install` command.

The installer performs only user-scoped operations: it copies the bundle to
the XDG user data directory, writes `getbased-companion.service` under the XDG
user configuration directory, creates a launcher in `~/.local/bin`, and calls
`systemctl --user enable --now`. It records the absolute Node and Codex
executables plus the existing Codex auth directory, so the background service
does not depend on an interactive shell PATH. No root access, desktop package,
or platform signing is required.

After installation, the service starts at login and the hosted PWA discovers
it through the same origin-gated loopback protocol. The CLI supports `status`,
`restart`, and `uninstall`; uninstall removes only the service/runtime and
retains separate private pairing state for a recoverable reinstall.

The same entry point is exposed as `npm run companion` for an independently
running local companion. Without an explicit port it tries only the bounded
range `8324`–`8331`; the browser probes that same range and obtains the private
session credential through an origin-checked loopback discovery response. The
credential, endpoint, and protocol details remain hidden from normal settings.
An explicit `GETBASED_AGENT_HOST_PORT` remains strict for operators who need a
fixed port.

Behind the UI, the host binds to `127.0.0.1:8324`; the development server
detects installed CLIs and owns the host lifecycle. Its pairing token is stable
across restarts and stored with private file permissions in the Agent Host data
directory. Advanced self-hosting can override the port and token with
`GETBASED_AGENT_HOST_PORT` and `GETBASED_AGENT_HOST_TOKEN`. Official Get-based
origins and loopback development origins are allowed. A self-hosted HTTPS
origin must be explicitly listed in the comma-separated
`GETBASED_AGENT_HOST_ALLOWED_ORIGINS` environment variable.

## Companion protocol and upgrades

The companion advertises a numeric protocol version and named capabilities
from `shared/agent-host-protocol.js`. Authenticated status and origin-checked
discovery report the same values. A feature turn verifies its required
capabilities before sending health data; an older process produces a specific
restart message instead of a generic HTTP error. If a saved endpoint is stale,
Get-based re-runs bounded loopback discovery and switches to a compatible
companion automatically.

Development-owned companions run under Node watch mode, so changes to the host
and its imported protocol modules restart the child without restarting the PWA
server. The parent uses a strict requested port, while a standalone companion
can move to the next free port in the bounded range and remain discoverable.

At startup the host creates a private Codex home with an MCP-free config and a
separate thread store. It copies only Codex CLI login state from the user's
normal Codex home, disables Codex's shell, browser, computer-use, plugin, hook,
skill, workspace, image, and multi-agent features, and passes only a small
environment allowlist to the Codex process. API keys supplied only through
environment variables are intentionally not forwarded. Codex's hosted cached
web search remains available; it is separate from browser control and command
network access. Agent instructions prohibit putting user-specific health data
in search queries.

This milestone supports text and image chat, hosted cached web research, the
two read-only context tools for the profile active when the turn starts, and
structured meal-photo / nutrition-label analysis when the selected CLI model
declares image input. Images are uploaded to the authenticated loopback host,
validated, written only to its private temporary workspace, consumed as
`localImage` turn inputs, and deleted after completion or cancellation. Voice,
navigation, drafts, data writes, and interactive Codex shell/file approvals
remain deliberately unavailable.

## Product capability coverage

CLI agents are a chat provider in this milestone, not yet a universal
replacement for every existing AI call:

| Get-based capability | CLI agent today | Next contract |
| --- | --- | --- |
| Text chat over approved profile context | Yes | Add richer bounded query tools. |
| Hosted web research | Codex cached search; activity is recorded on the answer | Add an explicit user control and richer activity display. |
| Model and reasoning selection | Codex | Implement adapter-specific catalogs for other CLIs. |
| Lab PDF/photo import | No | Add a structured extraction adapter; keep the existing review before save. |
| Meal-photo analysis | Codex models that declare image input, with structured output and normal review-before-save | Extend the capability router to other CLI adapters. |
| Context-card, marker, EMF, light, and report insights | No | Route provider-agnostic inference through one capability-aware dispatcher. |
| Voice | No | Keep transcription/speech providers separate until an adapter declares audio support. |
| Navigation | No | Add narrow UI navigation tools. |
| Health-data writes | No | Add draft tools first, then exact in-app approval and validated commit tools. |

The current two tools are sufficient for broad read-only chat analysis but do
not cover the full application. The next read layer should add typed tools for
profile discovery, marker history/comparison, bounded wearable and biometric
series, nutrition summaries, and source metadata. It should then add narrow
navigation tools and reviewable draft tools. Raw DOM control, raw IndexedDB
access, arbitrary record updates, and shell access remain outside the contract.

## Adapter roadmap

Each CLI adapter must provide a small common contract: discovery, account
status, model catalog, reasoning/variant catalog, start/resume turn, streaming,
tool calls, cancellation, usage, and declared input modalities. The UI renders
only capabilities an adapter reports.

- **Codex:** app-server supplies account status and ChatGPT login, model and
  reasoning catalogs, threads, streamed events, and dynamic tools.
- **OpenCode:** use its server/SDK session APIs and its provider-backed model
  and variant catalog instead of scraping terminal output.
- **Claude Code:** reuse an installed authenticated CLI initially; add an
  embedded sign-in only if Anthropic exposes a supported third-party client
  flow for that adapter.
- **Hermes / Grok:** keep detection informational until an adapter has a stable
  machine-readable session and tool protocol. Detection alone must not imply
  compatibility.
