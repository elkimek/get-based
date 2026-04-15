"""Lens CLI — typer-based commands.

  lens serve            Start the HTTP server (default if no command)
  lens ingest <path>    Index files into the local store
  lens info             Show config + key + status
  lens key              Print the API key (creates one if missing)

Configuration comes from environment variables — see config.py for the full list.
The Tauri desktop wrapper sets LENS_HOST, LENS_PORT, LENS_DATA_DIR,
LENS_EMBEDDING_MODEL, and LENS_ONNX_PROVIDER for you.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from .api_key import get_or_create_api_key
from .config import LensConfig
from .server import run_server

console = Console()
app = typer.Typer(
    name="lens",
    help="getbased-lens — local RAG knowledge server.",
    no_args_is_help=False,
    add_completion=False,
)


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )


@app.callback(invoke_without_command=True)
def _default(
    ctx: typer.Context,
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging"),
):
    """When invoked with no subcommand, run `serve`."""
    _setup_logging(verbose)
    if ctx.invoked_subcommand is None:
        ctx.invoke(serve)


@app.command()
def serve():
    """Start the HTTP server (uvicorn). Blocking."""
    config = LensConfig.from_env()
    console.print(f"[bold cyan]getbased-lens[/] starting on http://{config.host}:{config.port}")
    console.print(f"  Data dir:    {config.data_dir}")
    console.print(f"  Model:       {config.embedding_model}")
    console.print(f"  Collection:  {config.collection}")
    if config.onnx_provider:
        console.print(f"  ONNX:        {config.onnx_provider}")
    try:
        run_server(config)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped.[/]")


@app.command()
def ingest(
    path: Path = typer.Argument(..., help="File or directory to ingest"),
    json_out: bool = typer.Option(False, "--json", help="Emit machine-parseable JSON"),
):
    """Index documents from a path into the local store."""
    from .ingest import ingest_path  # lazy import (heavy deps)
    import json as _json

    config = LensConfig.from_env()
    if not json_out:
        console.print(f"[bold cyan]Ingesting[/] {path}…")
    try:
        result = ingest_path(config, path)
    except FileNotFoundError as e:
        if json_out:
            print(_json.dumps({"error": str(e)}))
        else:
            console.print(f"[red]Error:[/] {e}")
        raise typer.Exit(1)

    if json_out:
        print(_json.dumps(result))
        return

    table = Table(title="Ingest result", show_header=False, box=None)
    table.add_row("Files scanned", str(result["files_seen"]))
    table.add_row("Chunks indexed", str(result["chunks_indexed"]))
    if result["skipped"]:
        table.add_row("Skipped", str(len(result["skipped"])))
    console.print(table)


@app.command()
def stats(json_out: bool = typer.Option(False, "--json", help="Emit JSON")):
    """List knowledge base contents: per-source chunk counts."""
    import json as _json
    from .store import Store

    config = LensConfig.from_env()
    store = Store(config)
    try:
        docs = store.list_sources()
    except Exception as e:
        if json_out:
            print(_json.dumps({"error": str(e), "total_chunks": 0, "documents": []}))
        else:
            console.print(f"[red]Error:[/] {e}")
        raise typer.Exit(1)

    total_chunks = sum(d["chunks"] for d in docs)
    if json_out:
        print(_json.dumps({"total_chunks": total_chunks, "documents": docs}))
        return
    if not docs:
        console.print("No documents indexed yet. Use [bold]lens ingest <path>[/] to add some.")
        return
    table = Table(title=f"Indexed: {len(docs)} sources, {total_chunks} chunks")
    table.add_column("Source")
    table.add_column("Chunks", justify="right")
    for d in docs:
        table.add_row(d["source"], str(d["chunks"]))
    console.print(table)


@app.command()
def delete(
    source: str = typer.Argument(..., help="Source filename to delete (exact match)"),
    json_out: bool = typer.Option(False, "--json", help="Emit JSON"),
):
    """Delete all chunks belonging to a source from the knowledge base."""
    import json as _json
    from .store import Store

    config = LensConfig.from_env()
    store = Store(config)
    deleted = store.delete_by_source(source)
    if json_out:
        print(_json.dumps({"source": source, "deleted_chunks": deleted}))
        return
    console.print(f"Deleted {deleted} chunks matching source '{source}'")


@app.command()
def info():
    """Show current configuration + status."""
    config = LensConfig.from_env()
    console.print(config.display())
    console.print()
    key = get_or_create_api_key(config.api_key_file)
    console.print(f"  api_key:           {key[:8]}…{key[-4:]} (file: {config.api_key_file})")


@app.command()
def key():
    """Print the API key (generates one on first invocation)."""
    config = LensConfig.from_env()
    print(get_or_create_api_key(config.api_key_file))


def main():
    """Entry point for `python -m lens`."""
    try:
        app()
    except Exception as e:  # noqa: BLE001
        console.print(f"[red]Error:[/] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
