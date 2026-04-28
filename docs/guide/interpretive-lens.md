# Interpretive Lens

The Interpretive Lens lets you tell the AI which medical experts, researchers, or scientific frameworks to draw on when analyzing your results. Instead of a one-size-fits-all interpretation, the AI considers the perspective of the thinkers and paradigms you care about.

## Where to Find It

The Interpretive Lens appears as a **full-width card with a purple left border** near the top of the dashboard, just above the Focus Card. Click it to open the editor.

## What to Write

The lens is a free-form text field. Write the names of experts, schools of thought, or scientific paradigms you want the AI to keep in mind. Examples:

- Names of specific researchers or clinicians (e.g., practitioners focused on functional medicine, mitochondrial biology, hormesis, or longevity research)
- Scientific frameworks (e.g., circadian biology, evolutionary medicine, ancestral health)
- Dietary or lifestyle philosophies you follow
- Any combination of the above

::: tip
The AI does not need you to explain who these people are. If it knows their published work, it will apply their perspective to your data automatically.
:::

## How It Shapes AI Analysis

Every AI interaction in getbased — the Focus Card, the chat panel, and per-marker explanations — includes your Interpretive Lens in the context. The AI will:

- Frame its analysis through the paradigms you listed
- Draw on the research traditions those experts represent
- Flag where your results align or conflict with those frameworks
- Prioritize the markers and factors those frameworks consider important

## Example

If you write something like *"circadian biology, UV and mitochondrial health, ancestral diet"* in your lens, the AI will consider light exposure, vitamin D, and metabolic markers through that framework rather than giving you a standard conventional-medicine reading.

## Editing and Saving

Click the card to open the editor. Type or paste your lens text, then click **Save**. The card updates immediately on the dashboard.

The Interpretive Lens is included in your [JSON export](/guide/json-export-import) and restored on import.

## Custom Knowledge Base

The lens text above tells the AI *which perspective* to use. A Knowledge Base takes this further by giving the AI *actual passages* to reason from — excerpts from research papers, clinical guides, textbook chapters, or any documents you've collected.

When connected, every chat question and focus card insight triggers a search of your knowledge base. getbased sends the question, receives the most relevant passages, and includes them alongside your lab data. The AI then interprets your results grounded in those sources and cites them back to you.

Under the hood this uses **RAG** (Retrieval-Augmented Generation) — a technique where the AI first searches a curated document set for relevant content, then uses those results to inform its answer.

::: tip
Think of it like a research assistant: you ask a question, they pull the most relevant pages from your library, and the AI reads those pages before answering.
:::

There are two backends to choose from in **the dashboard's "Connect a knowledge base" CTA (or click the 📚 row once configured)**:

### On this device (in-browser)

Runs entirely in your browser. First use downloads an embedding model (22–110 MB depending on your pick) and then works offline. Drop your documents (PDF, Word, Markdown, plain text, or ZIP archives) into the settings panel — they're indexed locally in your browser's storage. Multiple libraries are supported so you can keep research papers, clinical guides, and personal notes in separate collections.

Good for: typical use — a few dozen to a few hundred documents. No install, no server, no external dependencies.

**Model choice per library.** When you create a new library, a small dialog shows four embedding models side by side — MiniLM (22 MB, fast), BGE-small-en (33 MB, better English retrieval), Multilingual-E5 (40 MB, 100+ languages), and BGE-base-en (110 MB, highest English quality). getbased benchmarks your device on first load and pre-selects the strongest model that runs smoothly on your hardware. The model is **locked at library creation** — switching later would mean re-indexing every document, so the decision is made upfront. Existing libraries from before v1.21.4 continue to use MiniLM; no forced migration.

**While indexing:** a small progress pill appears bottom-right. You can close the panel and keep using the app — indexing runs in the background and the pill tracks it from anywhere. Click **Cancel** on the pill to stop at the next excerpt; anything already indexed stays in the library, so a 3-minute run that you cancel early isn't wasted. Large batches (several hundred files) can take 10+ minutes on the in-browser engine; if that's your workflow, consider the external-server backend below.

### Query rewriting (recall booster)

When you have an AI provider configured, the Knowledge Base optionally rephrases each chat question into 3 variants before searching, then merges the results. This closes the vocabulary gap between how you write your notes and how you ask questions later — a search for *"Black Seed Oil"* will also find notes titled *"Nigella Sativa"*; *"insulin sensitivity"* pulls in *"metabolic flexibility"*.

The toggle lives in the Knowledge Base panel as **"Improve recall with query rewriting"** (default ON). It uses your configured AI provider for the rewrite step, so the cost is whatever your provider charges for ~100 tokens per question. Repeat questions in the same session use cached rewrites. Turn it off if you want pure local search or want to skip the small first-question latency cost.

### External server

Connect to a knowledge server you run (or one run by someone you trust). Useful for larger corpora, shared libraries, or when you want hardware-accelerated retrieval that your browser can't match.

**One command on Linux** — the [**getbased-agent-stack**](https://github.com/elkimek/getbased-agents) bundles the RAG server, the browser dashboard, and the MCP adapter:

```bash
curl -sSL https://getbased.health/install.sh | bash
```

The script auto-detects `uv` or `pipx` (install one first if you have neither), pulls `getbased-agent-stack[full]`, and starts the RAG server (`:8322`) and dashboard (`:8323`) as systemd user services. On non-systemd hosts (macOS, Docker, WSL1) the install succeeds but the services don't auto-start — see the manual alternative below.

**Linux only for auto-start.** macOS and Windows users can install the package, but need to run the services manually (or wait for launchd / Windows Service support).

#### Cautious? Review or verify first

```bash
# Read the script
curl -sSL https://getbased.health/install.sh | less

# Or download and verify against the published hash
curl -sSL https://getbased.health/install.sh       -o install.sh
curl -sSL https://getbased.health/install.sh.sha256 | sha256sum -c
bash install.sh
```

Source: [github.com/elkimek/get-based-site/blob/main/install.sh](https://github.com/elkimek/get-based-site/blob/main/install.sh).

#### Manual install (macOS, Windows, WSL1, or if you'd rather not run a shell script from the internet)

```bash
# pipx — --include-deps exposes lens + getbased-dashboard on PATH
pipx install --include-deps "getbased-agent-stack[full]"

# or uv
uv tool install \
  --with-executables-from getbased-rag \
  --with-executables-from getbased-dashboard \
  --with-executables-from getbased-mcp \
  "getbased-agent-stack[full]"

# One-shot configuration (non-interactive)
getbased-stack init --yes

# On non-systemd hosts, run the services in two terminals
lens serve                # RAG engine → http://127.0.0.1:8322
getbased-dashboard serve  # web UI     → http://127.0.0.1:8323
```

The dashboard handles library management, drag-drop ingest, embedding-model selection, MCP config generation, and agent-activity inspection. Any server speaking the same `POST /query` protocol also works — see the endpoint contract below to roll your own.

#### One-click login {#one-click-login}

When `getbased-dashboard serve` starts, it prints a magic URL tagged `[LOGIN-URL]`:

```
[LOGIN-URL] http://127.0.0.1:8323/?key=aSNUTKG4…6GW4
```

Click it — the dashboard auto-authenticates using the `?key=` query parameter (same convention as Jupyter Lab, Open WebUI, and code-server). The bearer key is stripped from the URL after capture so it doesn't linger in browser history.

Lost the URL?

- `getbased-dashboard login-url` re-prints it on demand
- Under systemd: `journalctl --user -u getbased-dashboard | grep LOGIN-URL`
- Or just visit `http://127.0.0.1:8323` directly — the "I don't have my key" help block on the sign-in page shows the exact commands for your install.

### Setup (external server)

After the installer (or manual install) finishes, open the dashboard — the installer prints a one-click login URL at the end. Then:

1. Dashboard → **Knowledge** tab — create a library, drop your files in, wait for indexing.
2. Dashboard → **MCP** → **Environment** → copy the `LENS_API_KEY`.
3. In the app: **the dashboard's "Connect a knowledge base" CTA (or click the 📚 row once configured) → External server**.
4. Toggle **Enable Knowledge Source**, enter a display name (e.g., *Functional Medicine Library*), paste the API key.
5. Endpoint URL defaults to `http://127.0.0.1:8322/query` — leave it alone for a local install, or point at an HTTPS endpoint if you're hosting the server elsewhere.
6. Set how many passages to retrieve per query (1–10, default 5).
7. Click **Save + connect** — a test query runs to confirm the connection works.

When active, a **badge** appears in the chat header showing the knowledge source is being used.

### What leaves your browser

Each AI question (the user message in chat, or a compact summary of your focus card state) is sent to your server with authentication. No lab values, profile details, or other private data go to the knowledge source — only the question itself. Choose a server you control or trust.

### Disabling

Toggle **Enable Knowledge Source** off to pause without losing your config. The badge disappears from the chat header, and subsequent AI calls use only the lens text above.

### For developers: endpoint contract

If you're setting up your own knowledge source server, it must implement a single `POST` route returning relevant passages.

**Request:**
```http
POST /your-endpoint
Authorization: Bearer ***
Content-Type: application/json

{ "version": 1, "query": "what could drive a rising ferritin?", "top_k": 5 }
```

**Response (200):**
```json
{
  "chunks": [
    { "text": "Elevated ferritin in the absence of anemia often...", "source": "Clinical Guide p.142" },
    { "text": "Inflammatory ferritin elevation is typically...", "source": "Case study #47" }
  ]
}
```

**Error response (non-200):**
```json
{ "error": "rate limit exceeded" }
```

**Constraints:**
- **HTTPS required** for public hosts. Plain `http://` is accepted for hosts that can't leak your Bearer token over the public internet: loopback (`localhost`, `127.0.0.1`, `[::1]`), RFC1918 LAN (`10.x`, `172.16–31.x`, `192.168.x`), link-local (`169.254.x`), Tailscale CGNAT (`100.64–127.x`), and mDNS (`*.local`). Anything else must be `https://`.
- **Max response size**: 32 KB (larger responses are rejected)
- **Max passages**: 10 (client truncates)
- **CORS**: your server must send `Access-Control-Allow-Origin: *` (or the getbased origin)
- **Timeout**: 30 seconds — slower responses fall back to unenriched AI
- **No redirects**: 3xx responses are rejected (prevents Bearer header leaking)

### Example server (FastAPI)

```python
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["POST"], allow_headers=["*"])

API_KEY = "your-secret"

class Query(BaseModel):
    version: int = 1
    query: str
    top_k: int = 5

@app.post("/query")
def query(q: Query, authorization: str = Header(None)):
    if authorization != f"Bearer {API_KEY}":
        raise HTTPException(401, "unauthorized")
    # Your retrieval logic here — embed q.query, search your vector DB, return top_k
    chunks = [{"text": "...", "source": "..."}]
    return {"chunks": chunks[:q.top_k]}
```

### Example server (Express)

```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*', methods: ['POST'] }));
app.use(express.json());

const API_KEY = 'your-secret';

app.post('/query', (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${API_KEY}`) return res.status(401).json({ error: 'unauthorized' });
  const { query, top_k = 5 } = req.body;
  // Your retrieval logic here
  const chunks = [{ text: '...', source: '...' }];
  res.json({ chunks: chunks.slice(0, top_k) });
});

app.listen(8000);
```

### Caching

getbased caches each query for 5 minutes (up to 20 entries, scoped per profile). Switching profiles, changing the config, or clicking **Clear cache** in settings flushes the cache.
