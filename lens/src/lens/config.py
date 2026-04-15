"""Configuration for getbased Lens."""

import os
from pathlib import Path
from dataclasses import dataclass, field


def _default_data_dir() -> Path:
    """Default data directory — ~/.getbased/lens/"""
    return Path.home() / ".getbased" / "lens"


@dataclass
class LensConfig:
    """All Lens configuration, loaded from environment variables."""

    # Server. Default to loopback only — exposing RAG to LAN by default would
    # leak knowledge-base queries to anyone on the local network. Override via
    # LENS_HOST=0.0.0.0 if you explicitly want LAN access.
    host: str = "127.0.0.1"
    port: int = 8321

    # Data
    data_dir: Path = field(default_factory=_default_data_dir)
    api_key_file: Path = field(default_factory=lambda: _default_data_dir() / "api_key")

    # Collection
    collection: str = "knowledge"

    # Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"  # ~90MB, 384d, fast on CPU
    similarity_floor: float = 0.55

    # Qdrant backend
    qdrant_mode: str = "local"  # "local" or "cloud"
    qdrant_cloud_url: str = ""
    qdrant_cloud_key: str = ""

    # Cloud inference (Qdrant Cloud embeds for you — no local model needed)
    cloud_inference: bool = False

    # ONNX Runtime acceleration (set by Tauri wrapper)
    onnx_provider: str = ""  # "cuda", "rocm", "openvino", "coreml", "cpu", or "" (auto)

    # Reranker (optional, heavy on CPU)
    reranker: bool = False
    reranker_candidates: int = 30

    # Response constraints
    max_chunks: int = 10
    max_chunk_chars: int = 4000
    max_source_chars: int = 200
    max_response_bytes: int = 32768

    # Chunking
    chunk_max_size: int = 800
    chunk_min_size: int = 50
    chunk_overlap: int = 50

    @classmethod
    def from_env(cls) -> "LensConfig":
        """Load config from environment variables."""
        data_dir = Path(os.environ.get("LENS_DATA_DIR", str(_default_data_dir())))

        return cls(
            host=os.environ.get("LENS_HOST", "127.0.0.1"),
            port=int(os.environ.get("LENS_PORT", "8321")),
            data_dir=data_dir,
            api_key_file=Path(os.environ.get("LENS_API_KEY_FILE", str(data_dir / "api_key"))),
            collection=os.environ.get("LENS_COLLECTION", "knowledge"),
            embedding_model=os.environ.get("LENS_EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
            similarity_floor=float(os.environ.get("LENS_SIMILARITY_FLOOR", "0.55")),
            qdrant_mode=os.environ.get("LENS_QDRANT_MODE", "local"),
            qdrant_cloud_url=os.environ.get("LENS_QDRANT_CLOUD_URL", ""),
            qdrant_cloud_key=os.environ.get("LENS_QDRANT_CLOUD_KEY", ""),
            cloud_inference=os.environ.get("LENS_CLOUD_INFERENCE", "").lower() in ("1", "true", "yes"),
            onnx_provider=os.environ.get("LENS_ONNX_PROVIDER", ""),
            reranker=os.environ.get("LENS_RERANKER", "").lower() in ("1", "true", "yes"),
            reranker_candidates=int(os.environ.get("LENS_RERANKER_CANDIDATES", "30")),
            chunk_max_size=int(os.environ.get("LENS_CHUNK_MAX_SIZE", "800")),
            chunk_min_size=int(os.environ.get("LENS_CHUNK_MIN_SIZE", "50")),
            chunk_overlap=int(os.environ.get("LENS_CHUNK_OVERLAP", "50")),
        )

    @property
    def qdrant_path(self) -> Path:
        """Local Qdrant storage path."""
        return self.data_dir / "qdrant"

    @property
    def is_cloud(self) -> bool:
        return self.qdrant_mode == "cloud"

    def ensure_dirs(self):
        """Create data directories if they don't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.api_key_file.parent.mkdir(parents=True, exist_ok=True)

    def display(self) -> str:
        """Human-readable config display."""
        lines = [
            f"  host:              {self.host}",
            f"  port:              {self.port}",
            f"  data_dir:          {self.data_dir}",
            f"  collection:        {self.collection}",
            f"  embedding_model:   {self.embedding_model}",
            f"  similarity_floor:  {self.similarity_floor}",
            f"  qdrant_mode:       {self.qdrant_mode}",
        ]
        if self.is_cloud:
            lines.append(f"  qdrant_cloud_url:  {self.qdrant_cloud_url}")
            lines.append(f"  cloud_inference:   {self.cloud_inference}")
        else:
            lines.append(f"  qdrant_path:       {self.qdrant_path}")
        lines.append(f"  reranker:          {self.reranker}")
        return "getbased Lens Configuration:\n" + "\n".join(lines)
