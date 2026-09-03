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
       ├─ approved context and typed queries  [read]
       ├─ bounded in-app destinations         [navigate]
       └─ reviewable proposed changes         [draft]
```

The browser cannot safely or portably spawn local executables. The companion
therefore translates loopback HTTP/event streams into each agent runtime's
native protocol. It must bind to loopback only, authenticate a paired browser
session, allow the Get-based origin explicitly, and never become a remotely
reachable health-data proxy.

## One tool contract, multiple adapters

`shared/agent-tool-contract.js` is the runtime-neutral catalog and
`js/agent-tool-runtime.js` is its validation and execution boundary. The
browser binds it to Get-based data through `js/agent-tool-bindings.js`:

| Tool | Access | Behavior |
| --- | --- | --- |
| `getbased_lab_context` | read | Returns the user-approved context projection for the profile active when the turn starts. |
| `getbased_section` | read | Lists projected sections or returns one exact/prefix match. |
| `getbased_search_markers` | read | Resolves markers with recorded values by name, category, or stable key. |
| `getbased_marker_history` | read | Returns bounded, dated values and ranges for one resolved marker. |
| `getbased_nutrition_summary` | read | Returns aggregate nutrient coverage without meal names, notes, or photos. |
| `getbased_wearable_series` | read | Returns enabled daily wearable series for a bounded window. |
| `getbased_search_knowledge` | read | Searches the active profile's user-provided Knowledge Base. |
| `getbased_navigate` | navigate | Opens an allowlisted view or marker detail without editing data. |
| `getbased_draft_note` | draft | Proposes an active-profile or marker note. |
| `getbased_draft_meal` | draft | Proposes a manual meal entry. |
| `getbased_draft_biometric` | draft | Proposes a weight, blood-pressure, or resting-pulse entry. |
| `getbased_draft_supplement` | draft | Proposes a supplement or medication entry. |

The catalog can be rendered as Codex app-server `dynamicTools`; calls are
answered using its `{ success, contentItems }` response shape. An MCP adapter
can expose the same definitions and call behavior. Tool handlers receive
injected dependencies rather than arbitrary DOM, storage, database, or network
access. The contract has no profile selector: every call is bound to the
profile active when the turn starts.

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
| `commit` | Apply an approved draft | Performed only by Get-based after an explicit in-app approval. It is not exposed to the CLI. |

No tool grants raw DOM control, arbitrary JavaScript, shell access, direct
database access, credential access, or a generic record-update primitive.
Write support consists of narrow draft tools. Drafts are sanitized before chat
storage and rendered as **Apply** / **Discard** proposal cards. Apply validates
the active-profile binding again and uses existing Get-based persistence paths
so migrations, encryption, and sync hooks remain intact.

Codex command/file approvals and Get-based data approvals are separate. The
host declines every Codex command, file, MCP elicitation, and permission
request. A future capability may render selected requests in chat, but
accepting a Codex sandbox action will never imply permission to mutate
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

Navigation and draft tools use the same streamed call flow. The agent can
propose, but cannot perform, a health-data write. Only the user's **Apply**
action inside Get-based crosses the persistence boundary.

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
two copyable Linux commands: run the bundle for the current terminal session,
or install it for automatic startup. Local development shows the equivalent
`npm run companion` and `npm run companion:install` commands.

Temporary mode writes only the downloaded bundle to `/tmp` and stops when its
terminal closes. The installer performs only user-scoped operations: it copies
the bundle to the XDG user data directory, writes `getbased-companion.service`
under the XDG user configuration directory, creates a launcher in
`~/.local/bin`, and calls `systemctl --user enable --now`. It records the
absolute Node and Codex
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

Behind the UI, the host binds only to loopback; the development server detects
installed CLIs and owns the host lifecycle. Hosted-origin discovery issues a
short-lived, origin-bound session credential. The global discovery-session
pool is bounded, and only an exact allowlist of official Get-based hostnames is
accepted. A stable install credential is limited to originless or loopback
development use. Advanced self-hosting can override the port and token with
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

The current Codex adapter supports text and image chat, hosted cached web
research, all structured tools listed above, and structured feature inference
when the selected CLI model declares the required modality. Images are
uploaded to the authenticated loopback host, validated, written only to its
private temporary workspace, consumed as `localImage` turn inputs, and deleted
after completion or cancellation. Voice and interactive Codex shell/file
approvals remain deliberately unavailable. Health-data writes remain under
Get-based's proposal-card approval boundary.

## Product capability coverage

The selected CLI agent now participates in chat and supported product features
through one capability-aware dispatcher:

| Get-based capability | Codex CLI today | Remaining boundary |
| --- | --- | --- |
| Text chat over approved profile context | Yes | Add typed queries only when a real product need appears. |
| Hosted web research | Codex cached search; activity is recorded on the answer | Add an explicit user control and richer activity display. |
| Model and reasoning selection | Yes | Implement adapter-specific catalogs for other CLIs. |
| Lab PDF/photo import | Yes, with a vision-capable selected model and existing review-before-save | Keep the extraction schema provider-neutral. |
| Meal-photo and nutrition-label analysis | Yes, with a vision-capable selected model and normal review-before-save | Extend the capability router to other CLI adapters. |
| Context cards, marker explanations, biology scores, supplements, EMF, light/sun, reports, summaries, and Lens query rewriting | Yes | Preserve feature-specific schemas and consent labels. |
| Knowledge Base search and bounded health queries | Yes, through active-profile tools | Add only privacy-preserving aggregate queries. |
| Navigation | Yes, for allowlisted views and marker detail | Add destinations deliberately rather than exposing generic UI control. |
| Proposed health-data changes | Notes, meals, biometrics, supplements, and medications | Add new draft types only with an exact review and apply path. |
| Voice | No | Keep transcription/speech providers separate until an adapter declares audio support. |

Raw DOM control, raw IndexedDB access, arbitrary record updates, credentials,
and shell access remain outside the contract. **Follow chat assistant** resolves
to the selected Codex model for feature-model labels and capability checks; it
does not silently fall back to the previously selected direct provider. Global
**Pause AI** pauses both direct-provider and CLI-agent routes.

## Adapter roadmap

Each CLI adapter must provide a small common contract: discovery, account
status, model catalog, reasoning/variant catalog, start/resume turn, streaming,
tool calls, cancellation, usage, and declared input modalities. The UI renders
only capabilities an adapter reports.

- **Codex:** app-server supplies account status and ChatGPT login, model and
  reasoning catalogs, threads, streamed events, and dynamic tools.
- **OpenCode:** detection is implemented, but selection remains disabled until
  a constrained adapter can supply the same tool contract through an isolated
  MCP/session bridge. Use its machine-readable session and model APIs rather
  than scraping terminal output.
- **Claude Code:** reuse an installed authenticated CLI initially; add an
  embedded sign-in only if Anthropic exposes a supported third-party client
  flow for that adapter.
- **Hermes / Grok:** detection is informational. Each needs an isolated MCP
  bridge, model/reasoning catalog, streaming normalization, and the same denial
  of shell/file/browser capabilities before it can be selected. Detection alone
  must not imply compatibility.
