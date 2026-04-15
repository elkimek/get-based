"""FastAPI HTTP server implementing the Lens RAG endpoint contract.

Endpoints:
  POST /query   — bearer-auth'd RAG search, returns top-k passages
  GET  /health  — public health probe
  GET  /        — public banner
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .api_key import get_or_create_api_key
from .config import LensConfig
from .embedder import create_embedder
from .store import Store

log = logging.getLogger("lens.server")


class QueryRequest(BaseModel):
    version: int = 1
    query: str
    top_k: int = 5


class Chunk(BaseModel):
    text: str
    source: str = ""
    score: Optional[float] = None


class QueryResponse(BaseModel):
    chunks: list[Chunk]


def create_app(config: LensConfig) -> FastAPI:
    """Build the FastAPI app with config-driven dependencies."""
    config.ensure_dirs()
    api_key = get_or_create_api_key(config.api_key_file)
    embedder_holder: dict = {"obj": None}
    store_holder: dict = {"obj": None}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        log.info("Starting Lens server on %s:%d", config.host, config.port)
        log.info("Data dir: %s", config.data_dir)
        log.info("API key file: %s", config.api_key_file)
        # Lazy-load on first query so /health responds even before model loads
        yield
        # Shutdown — nothing to clean up (Qdrant local closes on GC)

    app = FastAPI(
        title="getbased-lens",
        version="0.2.0",
        lifespan=lifespan,
        # Don't auto-add /docs in production — but useful in dev
    )
    # CORS: allow desktop browser origins. The bearer token gates real access.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    def get_embedder():
        if embedder_holder["obj"] is None:
            log.info("Lazy-loading embedder…")
            embedder_holder["obj"] = create_embedder(config)
        return embedder_holder["obj"]

    def get_store():
        if store_holder["obj"] is None:
            store_holder["obj"] = Store(config)
        return store_holder["obj"]

    def require_auth(authorization: Optional[str]) -> None:
        if not authorization:
            raise HTTPException(401, "Missing Authorization header")
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Authorization must be Bearer scheme")
        token = authorization.removeprefix("Bearer ").strip()
        if token != api_key:
            raise HTTPException(401, "Invalid API key")

    @app.get("/")
    async def root():
        return {"name": "getbased-lens", "version": "0.2.0", "endpoints": ["/health", "/query"]}

    @app.get("/health")
    async def health():
        # Don't force-load the embedder for health — report what we know
        store = get_store()
        try:
            count = store.count()
            rag_ready = count > 0
        except Exception as e:
            log.warning("Health check store query failed: %s", e)
            count = 0
            rag_ready = False
        return {"status": "ok", "rag_ready": rag_ready, "chunks": count}

    @app.post("/query", response_model=QueryResponse)
    async def query_endpoint(
        req: QueryRequest,
        authorization: Optional[str] = Header(default=None),
    ):
        require_auth(authorization)

        if req.version != 1:
            raise HTTPException(400, f"Unsupported version: {req.version}")
        if not req.query or not req.query.strip():
            raise HTTPException(400, "Empty query")

        top_k = max(1, min(config.max_chunks, int(req.top_k)))
        embedder = get_embedder()
        store = get_store()

        # Encode query
        try:
            vectors = embedder.encode([req.query.strip()])
            qvec = vectors[0]
        except Exception as e:
            log.exception("Embedding failed")
            raise HTTPException(500, f"Embedding failed: {e}")

        # Search
        try:
            results = store.search(qvec, top_k=top_k, score_threshold=config.similarity_floor)
        except Exception as e:
            log.exception("Vector search failed")
            raise HTTPException(500, f"Search failed: {e}")

        # Truncate per response constraints
        chunks = [
            Chunk(
                text=r["text"][: config.max_chunk_chars],
                source=r["source"][: config.max_source_chars],
                score=r.get("score"),
            )
            for r in results
        ]
        return QueryResponse(chunks=chunks)

    @app.exception_handler(HTTPException)
    async def http_error_handler(_: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

    return app


def run_server(config: LensConfig) -> None:
    """Blocking entry point — start the uvicorn server with the given config."""
    import uvicorn

    app = create_app(config)
    uvicorn.run(
        app,
        host=config.host,
        port=config.port,
        log_level="info",
        access_log=False,
    )
