# Knowledge Source Endpoint Contract

The Knowledge Source ("lens") protocol is shared between the getbased app's in-chat
Custom Knowledge Source and the [`getbased-mcp`](https://github.com/elkimek/getbased-agents/tree/main/packages/mcp)
server — one server speaking this contract backs both. User-facing setup lives in the
[Interpretive Lens guide](https://docs.getbased.health/guides/interpretive-lens); this
page is the wire spec for rolling your own server.

## Endpoint contract

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

## Example server (FastAPI)

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

## Example server (Express)

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

## Caching

getbased caches each query for 5 minutes (up to 20 entries, scoped per profile). Switching profiles, changing the config, or clicking **Clear cache** in settings flushes the cache.
