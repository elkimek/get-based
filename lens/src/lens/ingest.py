"""Document ingestion — read files from disk, chunk, embed, store."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator
from uuid import uuid4

from .config import LensConfig
from .embedder import create_embedder
from .store import Store, chunk_text

log = logging.getLogger("lens.ingest")

# File loaders — heavy deps are imported lazily so the lens core doesn't pull them
SUPPORTED_EXTS = {".txt", ".md", ".markdown", ".rst", ".json", ".pdf", ".docx"}


def _read_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md", ".markdown", ".rst", ".json"):
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix == ".pdf":
        try:
            from PyPDF2 import PdfReader  # type: ignore
        except ImportError:
            raise RuntimeError(
                "PDF ingest requires PyPDF2. Install lens with: pip install 'getbased-lens[pdf]'"
            )
        reader = PdfReader(str(path))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix == ".docx":
        try:
            import docx  # type: ignore
        except ImportError:
            raise RuntimeError(
                "DOCX ingest requires python-docx. Install lens with: pip install 'getbased-lens[docx]'"
            )
        doc = docx.Document(str(path))
        return "\n\n".join(p.text for p in doc.paragraphs)
    raise RuntimeError(f"Unsupported file type: {suffix}")


def _walk(root: Path) -> Iterator[Path]:
    if root.is_file():
        yield root
        return
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS:
            yield p


def ingest_path(config: LensConfig, source: Path) -> dict:
    """Ingest a file or directory into the lens store. Returns summary stats."""
    if not source.exists():
        raise FileNotFoundError(f"No such path: {source}")

    embedder = create_embedder(config)
    store = Store(config)
    store.ensure_collection(embedder.dimension())

    files_seen = 0
    chunks_indexed = 0
    skipped = []

    BATCH = 32
    batch: list[dict] = []

    def flush(batch: list[dict]) -> int:
        if not batch:
            return 0
        texts = [b["text"] for b in batch]
        vectors = embedder.encode(texts)
        for b, v in zip(batch, vectors):
            b["vector"] = v
        store.upsert(batch)
        return len(batch)

    for file_path in _walk(source):
        files_seen += 1
        try:
            text = _read_text(file_path)
        except Exception as e:
            log.warning("Skipping %s: %s", file_path, e)
            skipped.append(str(file_path))
            continue
        if not text.strip():
            continue
        rel_source = str(file_path.relative_to(source.parent if source.is_file() else source))
        for chunk in chunk_text(text, max_size=config.chunk_max_size,
                                overlap=config.chunk_overlap, min_size=config.chunk_min_size):
            batch.append({
                "id": str(uuid4()),
                "text": chunk,
                "source": rel_source,
            })
            if len(batch) >= BATCH:
                chunks_indexed += flush(batch)
                batch = []

    chunks_indexed += flush(batch)

    return {
        "files_seen": files_seen,
        "chunks_indexed": chunks_indexed,
        "skipped": skipped,
    }
