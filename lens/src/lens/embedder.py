"""Embedding backends — ONNX Runtime, sentence-transformers, or Qdrant Cloud Inference.

ABC design with lazy-loading, caching, and a factory function.
The ONNX backend is preferred when available (set via LENS_ONNX_PROVIDER env var)
because it's lighter than PyTorch and supports GPU acceleration directly.
"""

from __future__ import annotations

import logging
import os
import sys
from abc import ABC, abstractmethod
from pathlib import Path

from .config import LensConfig

log = logging.getLogger("lens.embedder")


def _platform_getbased_data_dirs() -> list[Path]:
    """Default getbased data directories per platform — matches what Tauri uses.
    Returns multiple candidates to handle dev (XDG) and bundled (platform-default) layouts.
    """
    home = Path.home()
    paths = []
    if sys.platform == "darwin":
        # Tauri's dirs::data_dir() on macOS = ~/Library/Application Support
        paths.append(home / "Library" / "Application Support" / "getbased" / "lens" / "models")
    elif sys.platform.startswith("win"):
        # Tauri's dirs::data_dir() on Windows = %APPDATA% (Roaming)
        appdata = os.environ.get("APPDATA")
        if appdata:
            paths.append(Path(appdata) / "getbased" / "lens" / "models")
    else:
        # Linux: dirs::data_dir() = $XDG_DATA_HOME or ~/.local/share
        xdg = os.environ.get("XDG_DATA_HOME")
        if xdg:
            paths.append(Path(xdg) / "getbased" / "lens" / "models")
        paths.append(home / ".local" / "share" / "getbased" / "lens" / "models")
    # Always include the legacy ~/.getbased/lens/models for back-compat
    paths.append(home / ".getbased" / "lens" / "models")
    return paths

# ── ABC ────────────────────────────────────────────────────────────

class Embedder(ABC):
    """Abstract embedding interface."""

    @abstractmethod
    def encode(self, texts: list[str]) -> list[list[float]]:
        """Encode a batch of texts into normalized vectors."""
        ...

    @abstractmethod
    def dimension(self) -> int:
        """Return the embedding dimensionality."""
        ...


# ── Known model dimensions ────────────────────────────────────────

_MODEL_DIMS: dict[str, int] = {
    "all-MiniLM-L6-v2": 384,
    "all-MiniLM-L12-v2": 384,
    "BAAI/bge-m3": 1024,
    "BAAI/bge-small-en-v1.5": 384,
    "BAAI/bge-base-en-v1.5": 768,
    "BAAI/bge-large-en-v1.5": 1024,
}


# ── ONNX Runtime (preferred) ─────────────────────────────────────

class OnnxEmbedder(Embedder):
    """Embedding via ONNX Runtime — light, fast, GPU-accelerated.

    Uses optimum (HuggingFace) to load ONNX-exported models with
    provider selection: CUDA, ROCm, OpenVINO, CoreML, or CPU.

    Provider is set via LENS_ONNX_PROVIDER env var (by Tauri wrapper).
    Falls back to CPU if the requested provider isn't available.
    """

    # Map our provider names to onnxruntime provider strings
    _PROVIDER_MAP: dict[str, list[str]] = {
        "cuda": ["CUDAExecutionProvider", "CPUExecutionProvider"],
        "rocm": ["ROCmExecutionProvider", "CPUExecutionProvider"],
        "openvino": ["OpenVINOExecutionProvider", "CPUExecutionProvider"],
        "coreml": ["CoreMLExecutionProvider", "CPUExecutionProvider"],
        "cpu": ["CPUExecutionProvider"],
    }

    def __init__(self, model_name: str = "BAAI/bge-m3", provider: str = ""):
        self._model_name = model_name
        self._provider_name = provider
        self._session = None
        self._tokenizer = None
        self._dim: int | None = None

    # lazy init --------------------------------------------------------

    def _load(self) -> None:
        if self._session is not None:
            return

        import onnxruntime as ort

        # Resolve provider
        providers = self._resolve_providers(ort)
        log.info(
            "Loading ONNX model: %s (providers=%s)",
            self._model_name, providers,
        )

        # Find or download ONNX model files
        model_dir = self._resolve_model_dir()

        # Look for ONNX files
        onnx_file = model_dir / "model.onnx"
        if not onnx_file.exists():
            onnx_file = model_dir / "model_optimized.onnx"
        if not onnx_file.exists():
            # Try any .onnx file
            onnx_files = list(model_dir.glob("*.onnx"))
            if onnx_files:
                onnx_file = onnx_files[0]
            else:
                raise FileNotFoundError(
                    f"No ONNX model files found in {model_dir}. "
                    "Run setup or download model manually."
                )

        # Create session
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self._session = ort.InferenceSession(
            str(onnx_file),
            sess_options=sess_options,
            providers=providers,
        )

        # Log actual provider
        active = self._session.get_providers()
        log.info("ONNX session active providers: %s", active)

        # Load tokenizer
        self._load_tokenizer(model_dir)

        # Detect dimension from model output
        self._dim = self._detect_dimension()
        log.info("ONNX model ready (dim=%d, provider=%s)", self._dim, active[0])

    def _resolve_providers(self, ort) -> list[str]:
        """Resolve the ONNX provider chain from config + available providers."""
        available = ort.get_available_providers()
        log.debug("Available ONNX providers: %s", available)

        if self._provider_name and self._provider_name in self._PROVIDER_MAP:
            requested = self._PROVIDER_MAP[self._provider_name]
            # Filter to only what's actually available
            resolved = [p for p in requested if p in available]
            if resolved:
                return resolved
            log.warning(
                "Requested provider '%s' not available (have: %s), falling back to CPU",
                self._provider_name, available,
            )

        # Auto-detect: pick best available
        for provider_key in ("cuda", "rocm", "openvino", "coreml"):
            chain = self._PROVIDER_MAP[provider_key]
            if any(p in available for p in chain):
                return [p for p in chain if p in available]

        return ["CPUExecutionProvider"]

    def _resolve_model_dir(self) -> Path:
        """Find the ONNX model directory.

        Checks (in order):
        1. LENS_DATA_DIR env var (set by Tauri wrapper) — most reliable
        2. Platform-correct getbased data dir (Linux/Mac/Windows)
        3. HuggingFace hub cache (~/.cache/huggingface)
        4. Optimum auto-download as last resort
        """
        # 1. Tauri wrapper sets LENS_DATA_DIR explicitly — trust it
        env_dir = os.environ.get("LENS_DATA_DIR")
        candidates_to_search = []
        if env_dir:
            candidates_to_search.append(Path(env_dir) / "models")

        # 2. Fallback to platform-correct default getbased data dir
        candidates_to_search.extend(_platform_getbased_data_dirs())

        for tauri_models in candidates_to_search:
            if not tauri_models.exists():
                continue
            # huggingface_hub snapshot_download creates models--{slug}/snapshots/{rev}/
            for cached_model in tauri_models.glob("models--*"):
                snapshots = cached_model / "snapshots"
                if not snapshots.exists():
                    continue
                snap_dirs = sorted(snapshots.iterdir(), reverse=True)
                for snap in snap_dirs:
                    if (snap / "model.onnx").exists() or list(snap.glob("*.onnx")):
                        return snap

        # Check HuggingFace cache
        hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
        if hf_cache.exists():
            # Normalize model name: BAAI/bge-m3 → models--BAAI--bge-m3
            model_slug = self._model_name.replace("/", "--")
            model_hub_dir = hf_cache / f"models--{model_slug}"
            if model_hub_dir.exists():
                snapshots = model_hub_dir / "snapshots"
                if snapshots.exists():
                    snap_dirs = sorted(snapshots.iterdir(), reverse=True)
                    for snap in snap_dirs:
                        if list(snap.glob("*.onnx")):
                            return snap

        # Fallback: try loading via optimum which handles download
        return self._download_via_optimum()

    def _download_via_optimum(self) -> Path:
        """Download model via optimum if not found locally."""
        try:
            from optimum.onnxruntime import ORTModelForFeatureExtraction
            from transformers import AutoTokenizer

            log.info("Downloading ONNX model via optimum: %s", self._model_name)
            model = ORTModelForFeatureExtraction.from_pretrained(
                self._model_name, export=True
            )
            tokenizer = AutoTokenizer.from_pretrained(self._model_name)

            # Save to a local cache
            cache_dir = (
                Path.home() / ".cache" / "getbased" / "onnx_models" / self._model_name.replace("/", "--")
            )
            cache_dir.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(cache_dir)
            tokenizer.save_pretrained(cache_dir)
            log.info("ONNX model cached to %s", cache_dir)
            return cache_dir
        except ImportError:
            raise ImportError(
                "optimum not installed. Install with: pip install optimum[onnxruntime]"
            )

    def _load_tokenizer(self, model_dir: Path) -> None:
        """Load the tokenizer for the model."""
        from transformers import AutoTokenizer
        self._tokenizer = AutoTokenizer.from_pretrained(str(model_dir))

    def _detect_dimension(self) -> int:
        """Detect embedding dimension from model output shape."""
        # Try known dimensions first
        if self._model_name in _MODEL_DIMS:
            return _MODEL_DIMS[self._model_name]

        # Probe with a dummy input
        import numpy as np

        encoded = self._tokenizer("test", padding=True, truncation=True, return_tensors="np")
        outputs = self._session.run(None, dict(encoded))
        # Last hidden state shape: [batch, seq_len, dim]
        return outputs[0].shape[-1]

    # public API -------------------------------------------------------

    def encode(self, texts: list[str]) -> list[list[float]]:
        self._load()
        import numpy as np

        # Per-model max_length: BGE-M3 supports 8192; most others top at 512.
        # Truncating BGE-M3 at 512 throws away its main long-context advantage.
        max_len = 8192 if "bge-m3" in self._model_name.lower() else 512

        encoded = self._tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=max_len,
            return_tensors="np",
        )

        outputs = self._session.run(None, dict(encoded))
        # outputs[0] = last_hidden_state: [batch, seq_len, dim]
        embeddings = outputs[0]

        # Pooling: BGE-M3 + most modern embedding models use mean pooling.
        # CLS pooling is correct for original BERT but produces wrong vectors here.
        if len(embeddings.shape) == 3:
            mask = encoded.get("attention_mask")
            if mask is not None:
                # Masked mean: only average non-padding tokens
                mask_expanded = np.expand_dims(mask, -1).astype(embeddings.dtype)
                summed = (embeddings * mask_expanded).sum(axis=1)
                counts = np.clip(mask_expanded.sum(axis=1), a_min=1e-9, a_max=None)
                embeddings = summed / counts
            else:
                embeddings = embeddings.mean(axis=1)

        # L2 normalize for cosine similarity
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        embeddings = embeddings / norms

        return embeddings.tolist()

    def dimension(self) -> int:
        if self._dim is not None:
            return self._dim
        if self._model_name in _MODEL_DIMS:
            return _MODEL_DIMS[self._model_name]
        self._load()
        return self._dim  # type: ignore[return-value]


# ── Local (sentence-transformers, fallback) ──────────────────────

class LocalEmbedder(Embedder):
    """Local embedding via sentence-transformers.

    Model is lazy-loaded on first ``encode()`` / ``dimension()`` call
    and cached for the lifetime of the instance.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self._model_name = model_name
        self._model = None
        self._dim: int | None = None

    # lazy init --------------------------------------------------------

    def _load(self) -> None:
        if self._model is not None:
            return
        from sentence_transformers import SentenceTransformer

        log.info("Loading embedding model: %s …", self._model_name)
        self._model = SentenceTransformer(self._model_name)
        self._model.eval()
        self._dim = self._model.get_sentence_embedding_dimension()
        log.info("Model ready (dim=%d)", self._dim)

    # public API -------------------------------------------------------

    def encode(self, texts: list[str]) -> list[list[float]]:
        self._load()
        embeddings = self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return embeddings.tolist()

    def dimension(self) -> int:
        if self._dim is not None:
            return self._dim
        if self._model_name in _MODEL_DIMS:
            return _MODEL_DIMS[self._model_name]
        self._load()
        return self._dim  # type: ignore[return-value]


# ── Cloud Inference (Qdrant Cloud) ────────────────────────────────

class CloudInferenceEmbedder(Embedder):
    """Delegates embedding to Qdrant Cloud's built-in inference API.

    No local model is loaded — vectors come from the cloud endpoint.
    """

    def __init__(self, url: str, api_key: str, model_name: str = "all-MiniLM-L6-v2"):
        self._url = url
        self._api_key = api_key
        self._model_name = model_name
        self._client = None
        self._dim: int = _MODEL_DIMS.get(model_name, 384)

    def _ensure_client(self):
        if self._client is not None:
            return
        from qdrant_client import QdrantClient

        self._client = QdrantClient(url=self._url, api_key=self._api_key)
        log.info("Cloud inference client ready via %s", self._url)

    def encode(self, texts: list[str]) -> list[list[float]]:
        self._ensure_client()
        from qdrant_client.models import Document

        vectors: list[list[float]] = []
        batch_size = 32
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            docs = [
                Document(text=t, model=self._model_name) for t in batch
            ]
            result = self._client.infer("", docs)
            vectors.extend([list(v) for v in result])
        return vectors

    def dimension(self) -> int:
        return self._dim


# ── Factory ────────────────────────────────────────────────────────

def create_embedder(config: LensConfig) -> Embedder:
    """Create the appropriate embedder from a LensConfig.

    Priority:
    1. Cloud inference (if enabled) — no local model needed
    2. ONNX Runtime (if onnx_provider set or optimum available) — GPU-accelerated
    3. sentence-transformers (fallback) — always works
    """
    if config.cloud_inference:
        if not config.qdrant_cloud_url:
            raise ValueError(
                "LENS_QDRANT_CLOUD_URL required when cloud_inference=True"
            )
        return CloudInferenceEmbedder(
            url=config.qdrant_cloud_url,
            api_key=config.qdrant_cloud_key,
            model_name=config.embedding_model,
        )

    # Try ONNX backend if provider is set or optimum is available
    if config.onnx_provider or _onnx_available():
        log.info(
            "Using ONNX backend (provider=%s)",
            config.onnx_provider or "auto",
        )
        return OnnxEmbedder(
            model_name=config.embedding_model,
            provider=config.onnx_provider,
        )

    # Fallback to sentence-transformers
    log.info("ONNX not available, falling back to sentence-transformers")
    return LocalEmbedder(model_name=config.embedding_model)


def _onnx_available() -> bool:
    """Check if onnxruntime is importable."""
    try:
        import onnxruntime  # noqa: F401
        return True
    except ImportError:
        return False
