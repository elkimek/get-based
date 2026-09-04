# Agent-backed chat architecture

## Decision

getbased presents an installed agent as an **AI provider source** alongside
API providers and locally served models. Internally it remains an agent
backend, not a pretend OpenAI-compatible endpoint: a user-owned localhost
companion owns the agent process and its session. getbased remains the
authority for health data and fulfills only explicitly registered semantic
tools.

Settings uses the label **CLI agents**. “Local models” is reserved for local
inference servers such as Ollama, LM Studio, and Jan. “Agent Access” remains a
separate inbound feature for agents that query getbased through the encrypted
Evolu relay.

Codex connects through `codex app-server`. OpenCode, Hermes, and Grok share a
standards-based Agent Client Protocol (ACP) adapter. Claude Code connects
through its non-interactive `stream-json` interface. OpenClaw connects through
its isolated, headless `agent exec` interface because its ACP bridge does not
accept per-session MCP servers. The loopback host
normalizes their sessions, model catalogs, streamed events, cancellation, and
tool calls behind one browser contract. External MCP clients continue to use
the same getbased tool semantics through `getbased-agent-stack`.

```text
getbased PWA
  ├─ direct-model backend ───────────────> existing AI providers
  └─ local-agent backend ── loopback ───> getbased-agent-host
                                             ├─ Codex app-server (stdio)
                                             ├─ ACP: OpenCode, Hermes, Grok
                                             ├─ Claude Code stream-json
                                             └─ OpenClaw agent exec

getbased data authority
  └─ agent tool runtime
       ├─ approved context and typed queries  [read]
       ├─ bounded in-app destinations         [navigate]
       └─ reviewable proposed changes         [draft]
```

The browser cannot safely or portably spawn local executables. The companion
therefore translates loopback HTTP/event streams into each agent runtime's
native protocol. It must bind to loopback only, authenticate a paired browser
session, allow the getbased origin explicitly, and never become a remotely
reachable health-data proxy.

## One tool contract, multiple adapters

`shared/agent-tool-contract.js` is the runtime-neutral catalog and
`js/agent-tool-runtime.js` is its validation and execution boundary. The
browser binds it to getbased data through `js/agent-tool-bindings.js`:

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

The catalog is rendered as Codex app-server `dynamicTools` or as a private,
per-session stdio MCP server for ACP, Claude Code, and OpenClaw. MCP calls cross an
unpublished loopback route protected by a random session credential, then use
the same browser approval loop. Tool handlers receive
injected dependencies rather than arbitrary DOM, storage, database, or network
access. The contract has no profile selector: every call is bound to the
profile active when the turn starts.

The browser binding must use the normal context builder without bypass flags.
This preserves the user's context toggles and prevents a connected agent from
reading data the user excluded from AI context.
Every typed binding also verifies that the profile which started the turn is
still active. If the user switches profiles mid-response, subsequent reads and
navigation fail closed and the user can retry in the intended profile.

## Capability and approval model

Tools are classified before they are implemented:

| Class | Examples | Rule |
| --- | --- | --- |
| `read` | Read approved context or one section | May run during an agent turn. |
| `navigate` | Open a getbased view | May change UI state, never health data. |
| `draft` | Prepare a note or proposed regimen change | Creates a reviewable draft only. |
| `commit` | Apply an approved draft | Performed only by getbased after an explicit in-app approval. It is not exposed to the CLI. |

No tool grants raw DOM control, arbitrary JavaScript, shell access, direct
database access, credential access, or a generic record-update primitive.
Write support consists of narrow draft tools. Drafts are sanitized before chat
storage and rendered as **Apply** / **Discard** proposal cards. Apply validates
the active-profile binding again and uses existing getbased persistence paths
so migrations, encryption, and sync hooks remain intact.

Codex command/file approvals and getbased data approvals are separate. The
host declines every Codex command, file, MCP elicitation, and permission
request. A future capability may render selected requests in chat, but
accepting a Codex sandbox action will never imply permission to mutate
getbased health data.

## Initial turn flow

1. The user selects an installed CLI agent in Settings → AI or during chat onboarding.
2. The local companion supplies the browser with an authenticated connection
   automatically and reports available agents and models.
3. The companion starts or resumes an agent thread and registers the allowed
   getbased tool definitions.
4. The PWA sends the user turn. The companion normalizes streamed events such
   as text deltas, tool activity, approval requests, completion, and errors.
5. When the agent calls a getbased tool, the companion forwards the bounded
   call to the paired PWA. The PWA executes the registered handler and returns
   only the result projection.
6. The getbased chat stores its own messages plus the external agent/thread
   identifier needed to resume later. Its context receipt lists only successful
   data-returning tool calls; failed calls and draft-only calls are excluded.

Navigation and draft tools use the same streamed call flow. The agent can
propose, but cannot perform, a health-data write. Only the user's **Apply**
action inside getbased crosses the persistence boundary.

## Current development workflow

1. Install and sign in to Codex, Claude Code, OpenCode, Hermes, Grok, or OpenClaw on the machine running getbased.
2. From the repository, run the normal `npm run dev-server` command.
3. Open **Settings → AI → CLI agents** and enable a ready agent. getbased detects
   the CLI, starts its local bridge, and reuses its existing sign-in.

The npm development command rebuilds the ignored single-file companion first,
so the in-app **Start automatically** control installs exactly the source being
tested. Production performs the same bundle step during its normal build.

The selected row reads that CLI's model catalog and lets the user choose the model
and supported reasoning effort without leaving getbased. Transport URLs and
pairing credentials are intentionally not part of the normal user interface.
Model and reasoning selections are stored per CLI, so switching agents and
returning restores that agent's last compatible choices.
The standalone `npm run agent-host` command and its environment variables
remain an advanced development/self-hosting escape hatch, not an onboarding
requirement.

The same compact picker also follows the selected direct provider. Reasoning
controls are capability-driven rather than inferred for every model:
OpenRouter uses its per-model effort catalogue; Venice uses its reasoning
capability flags; PPQ, Routstr, and Custom API retain compatible metadata from
their model endpoints; Ollama and LM Studio use their native thinking
catalogues. Jan, llama.cpp, Unsloth Studio, and other OpenAI-compatible local
servers receive a control when their catalogue advertises one (with a narrow
GPT-OSS fallback). A model with built-in but non-configurable reasoning, or a
server that publishes only model IDs, keeps its native default and does not
show a misleading effort slider. Encrypted PPQ, Routstr, and Venice requests
carry the same selected effort inside their already-attested transport.

## Hosted desktop companion

A hosted browser cannot start an operating-system process. The production
build therefore emits a single dependency-free `getbased-companion.mjs`
download. When no companion is detected, **Settings → AI → CLI agents** shows
one bootstrap command for the detected operating system. It runs the bundle for
the current Terminal or PowerShell session. Once that authenticated loopback
connection exists, the page can register or remove automatic startup directly;
there is no second installation command in the normal flow. Linux and macOS use
a POSIX-shell command and Windows uses PowerShell. The command downloads the
bundle from the same getbased origin the user has open, so it does not require a
repository checkout or npm. A separate start command remains available for
recovery when an installed companion is completely stopped, because a webpage
cannot start a missing operating-system process.

Temporary mode writes only the downloaded bundle to the operating system's
temporary directory and stops when its terminal closes. Installed mode copies
the bundle into user-owned application data and records absolute Node and
detected-agent paths so it does not depend on an interactive shell PATH. Linux
uses a systemd user service, macOS uses `~/Library/LaunchAgents`, and Windows
uses a least-privilege current-user scheduled task with a hidden WScript
launcher. No root/administrator access, desktop package, or platform signing is
required.

The companion source stays in this repository for now. Its browser protocol,
tool contract, security policy, and generated PWA download can therefore ship
atomically with the UI that consumes them. A separate repository becomes
useful only if the companion gains an independent release cadence or supports
several products; splitting it earlier would add version and security-policy
drift. The production bundle is generated from the committed `bin/`, `server/`,
`lib/`, and `shared/` sources by `scripts/build-companion-bundle.mjs`.

The headless single-file companion cannot create a native tray icon using Node
standard-library APIs. A real cross-platform tray requires a GUI runtime such
as Electron or Tauri and platform-specific icon/application packaging. That is
an optional desktop shell, not part of the headless companion: making it the
only distribution would reintroduce unsigned-app warnings and a much larger
download. Companion state and lifecycle controls should first be exposed in
getbased Settings; a tray shell can consume the same local control protocol
later without changing the health-data or agent boundaries.

After installation, the service starts at login and the hosted PWA discovers
it through the same origin-gated loopback protocol. Authenticated Settings
controls can pause or resume new AI work, restart agent subprocesses,
register automatic startup, update the installed bundle from the active
getbased HTTPS origin, and remove automatic startup. Destructive lifecycle
actions are rejected while an agent turn is active. Updates are bounded and
validated as companion bundles before replacing the installed copy; they take
effect on the next companion start. The CLI also supports `start`, `stop`,
`status`, `restart`, and `uninstall` for recovery. Uninstall retains separate
private pairing state for a recoverable reinstall.

The same entry point is exposed as `npm run companion` for an independently
running local companion. Without an explicit port it tries only the bounded
range `8324`–`8331`; the browser probes that same range and obtains the private
session credential through an origin-checked loopback discovery response. The
credential, endpoint, and protocol details remain hidden from normal settings.
An explicit `GETBASED_AGENT_HOST_PORT` remains strict for operators who need a
fixed port. Development and standalone discovery also honor the per-adapter
`GETBASED_CODEX_COMMAND`, `GETBASED_CLAUDE_COMMAND`,
`GETBASED_OPENCODE_COMMAND`, `GETBASED_HERMES_COMMAND`, and
`GETBASED_GROK_COMMAND` executable overrides.

Behind the UI, the host binds only to loopback; the development server detects
installed CLIs and owns the host lifecycle. Hosted-origin discovery issues a
short-lived, origin-bound session credential. The global discovery-session
pool is bounded, and only an exact allowlist of official getbased hostnames is
accepted. A stable install credential is limited to originless or loopback
development use. Advanced self-hosting can override the port and token with
`GETBASED_AGENT_HOST_PORT` and `GETBASED_AGENT_HOST_TOKEN`. Official getbased
origins and loopback development origins are allowed. A self-hosted HTTPS
origin must be explicitly listed in the comma-separated
`GETBASED_AGENT_HOST_ALLOWED_ORIGINS` environment variable.

## Companion protocol and upgrades

The companion advertises a numeric protocol version, companion version,
runtime mode, and named capabilities
from `shared/agent-host-protocol.js`. Authenticated status and origin-checked
discovery report the same values. A feature turn verifies its required
capabilities before sending health data; an older process produces a specific
restart message instead of a generic HTTP error. If a saved endpoint is stale,
getbased re-runs bounded loopback discovery and switches to a compatible
companion automatically.

Development-owned companions run under Node watch mode, so changes to the host
and its imported protocol modules restart the child without restarting the PWA
server. The parent uses a strict requested port, while a standalone companion
can move to the next free port in the bounded range and remain discoverable.
If the PWA port itself is already occupied, the development server closes its
companion child before reporting the startup error so a failed command cannot
leave a stale bridge behind.

At startup the host creates a private Codex home with an MCP-free config and a
separate thread store. It copies only Codex CLI login state from the user's
normal Codex home, disables Codex's shell, browser, computer-use, plugin, hook,
skill, workspace, image, and multi-agent features, and passes only a small
environment allowlist to the Codex process. API keys supplied only through
environment variables are intentionally not forwarded. Standard HTTP proxy
variables are preserved so signed-in agents can work on managed networks.
On Windows, standard npm `.cmd` launchers are resolved to their JavaScript
entry point and started with the current Node executable; unknown command-file
wrappers are rejected rather than executed through a shell. Codex's hosted cached
web search remains available; it is separate from browser control and command
network access. Agent instructions prohibit putting user-specific health data
in search queries.

Claude Code receives its private MCP credential and per-turn instructions
through mode-0600 temporary files rather than process arguments. Those files
are removed after the one-shot process exits, including error and cancellation
paths.

OpenClaw uses its official `agent exec` headless path and the model catalog,
model-harness mapping, and stored login already configured by the user.
getbased overlays each turn with a mode-0600 temporary config whose final tool
allowlist exposes only web search/fetch and the private getbased MCP server;
OpenClaw's shell, filesystem, messaging, browser-control, session, automation,
and unrelated plugin surfaces are not enabled. The prompt and MCP
credential are kept out of process arguments and the temporary files are
removed on every exit path. Because this safe entry point is one-shot, getbased
replays the browser-visible conversation instead of persisting an OpenClaw
session. It currently declares text input only.

The current Codex adapter supports text and image chat, hosted cached web
research, all structured tools listed above, and structured feature inference
when the selected CLI model declares the required modality. Images are
uploaded to the authenticated loopback host, validated, written only to its
private temporary workspace, consumed as `localImage` turn inputs, and deleted
after completion or cancellation. CLI adapters do not currently expose a
standardized audio transport. Dictation and spoken replies remain available
through getbased's independent on-device, local-server, or configured cloud
voice providers. Automatic voice stays on-device during CLI chat; a cloud or
local-server voice provider is used only when the user selects it explicitly.
Only the resulting text crosses the CLI chat boundary.
Interactive Codex shell/file approvals remain deliberately unavailable.
Health-data writes remain under getbased's proposal-card approval boundary.

## Product capability coverage

The selected CLI agent now participates in chat and supported product features
through one capability-aware dispatcher:

| getbased capability | CLI agents today | Remaining boundary |
| --- | --- | --- |
| Text chat over approved profile context | Yes | Add typed queries only when a real product need appears. |
| Hosted web research | Agent-dependent; normalized activity is recorded when the protocol reports it | Add an explicit user control and richer activity display. |
| Model and reasoning selection | Codex catalogs; OpenCode provider/model catalogs and model-specific effort variants; Hermes provider/model catalogs; Claude Code aliases and effort levels; OpenClaw configured provider/model catalog and thinking levels | Hermes ACP does not yet expose a session-scoped reasoning control, so it inherits the user's Hermes setting. Keep every control capability-driven as CLIs evolve. |
| Lab PDF/photo import | Yes when the selected adapter/model declares image input, with existing review-before-save | Keep the extraction schema provider-neutral. |
| Meal-photo and nutrition-label analysis | Yes when the selected adapter/model declares image input, with normal review-before-save | Verify new adapter modalities before routing. |
| Context cards, marker explanations, biology scores, supplements, EMF, light/sun, reports, summaries, and Lens query rewriting | Yes | Preserve feature-specific schemas and consent labels. |
| Knowledge Base search and bounded health queries | Yes, through active-profile tools | Add only privacy-preserving aggregate queries. |
| Navigation | Yes, for allowlisted views and marker detail | Add destinations deliberately rather than exposing generic UI control. |
| Proposed health-data changes | Notes, meals, biometrics, supplements, and medications | Add new draft types only with an exact review and apply path. |
| Voice | Yes, through getbased's independent STT/TTS service | Keep raw audio out of CLI adapters until one declares a secure, standardized audio capability. |

Raw DOM control, raw IndexedDB access, arbitrary record updates, credentials,
and shell access remain outside the contract. **Follow chat assistant** resolves
to the selected CLI model for feature-model labels and capability checks; it
does not silently fall back to the previously selected direct provider. Global
**Pause AI** pauses both direct-provider and CLI-agent routes.

## Adapter roadmap

Each CLI adapter must provide a small common contract: discovery, account
status, model catalog, reasoning/variant catalog, start/resume turn, streaming,
tool calls, cancellation, usage, and declared input modalities. The UI renders
only capabilities an adapter reports.

- **Codex:** app-server supplies account status and ChatGPT login, model and
  reasoning catalogs, threads, streamed events, and dynamic tools.
- **OpenCode / Hermes / Grok:** one ACP v1 transport handles initialization,
  resumable sessions, streaming, declared image support, cancellation, and the
  private getbased MCP server. OpenCode exposes its connected provider catalogs
  and model-specific effort variants as session configuration options. Hermes
  exposes provider/model state through `session/set_model`, but currently leaves
  reasoning to the user's Hermes configuration because its ACP server does not
  advertise a session-scoped reasoning option. Client terminal and filesystem
  capabilities are not advertised; permission requests are denied.
- **Claude Code:** the adapter uses `--print` with `stream-json`, restricted
  mode, no interactive permissions, an exact MCP configuration, resumable
  sessions, model aliases, reasoning effort, images, and JSON Schema output.
  Authentication remains owned by the official CLI; getbased reports
  “sign-in required” rather than pretending an installed binary is ready.
- **OpenClaw:** the adapter discovers PATH installs and the official
  self-contained `~/.openclaw/bin/openclaw` installation, reads the configured
  model catalog, and runs one isolated `agent exec` turn with explicit model and
  thinking choices. Its temporary tool policy permits only hosted web helpers
  and getbased's turn-scoped MCP server. The headless interface currently has
  no image flag or resumable-session flag, so the adapter declares text-only
  input and replays visible conversation history.
