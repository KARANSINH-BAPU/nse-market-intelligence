"""
KP CLI — Main Entry Point
Usage:
  python scripts/kp.py doctor
  python scripts/kp.py setup
  python scripts/kp.py start
  python scripts/kp.py stop
  python scripts/kp.py backup
"""

from __future__ import annotations

import sys
from pathlib import Path

# ── Add project root to path ─────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

import click
from rich.console import Console

console = Console()


@click.group()
@click.version_option("0.1.0", prog_name="KP")
def cli() -> None:
    """KP — NSE Market Intelligence Platform CLI"""
    pass


@cli.command()
def doctor() -> None:
    """Run KP environment health checks."""
    from scripts.doctor import run_doctor
    run_doctor()


@cli.command()
def setup() -> None:
    """Set up the KP environment (dirs, deps, migrations)."""
    from scripts.setup import run_setup
    run_setup()


@cli.command()
@click.option("--backend/--no-backend", default=True, help="Start backend server")
@click.option("--frontend/--no-frontend", default=True, help="Start frontend server")
def start(backend: bool, frontend: bool) -> None:
    """Start KP services."""
    from scripts.start import run_start
    run_start(backend=backend, frontend=frontend)


@cli.command()
def stop() -> None:
    """Stop all KP services."""
    from scripts.stop import run_stop
    run_stop()


@cli.command()
@click.argument("output_dir", default="./backups", required=False)
def backup(output_dir: str) -> None:
    """Create a backup of KP data."""
    console.print(f"[yellow]Backup to {output_dir} — not yet implemented (Phase 1)[/yellow]")
    console.print("[dim]Database backup will be available after DB is configured.[/dim]")


@cli.command()
def version() -> None:
    """Show KP version."""
    version_file = ROOT / "VERSION"
    v = version_file.read_text().strip() if version_file.exists() else "unknown"
    console.print(f"[bold cyan]KP[/bold cyan] v{v}")


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
