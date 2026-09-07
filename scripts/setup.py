"""
KP Setup — Automated environment setup script.
Run this on a new machine after cloning and configuring .env.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from rich.console import Console
from rich.panel import Panel

ROOT = Path(__file__).parent.parent
console = Console()


def run_step(description: str, cmd: list[str], cwd: Path | None = None) -> bool:
    console.print(f"  [dim]→[/dim] {description}...", end="")
    result = subprocess.run(
        cmd,
        cwd=str(cwd or ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        console.print(" [green]done[/green]")
        return True
    else:
        console.print(f" [red]FAILED[/red]")
        console.print(f"[dim red]  {result.stderr[:300]}[/dim red]")
        return False


def run_setup() -> None:
    console.print()
    console.print(Panel.fit(
        "[bold cyan]KP[/bold cyan] [white]Setup[/white]",
        border_style="cyan",
    ))
    console.print()

    # ── Check .env ───────────────────────────────────────────
    env_file = ROOT / ".env"
    if not env_file.exists():
        console.print("[yellow]⚠ .env not found. Copying from .env.development.example...[/yellow]")
        example = ROOT / ".env.development.example"
        if example.exists():
            import shutil
            shutil.copy(example, env_file)
            console.print("[green]  Created .env from .env.development.example[/green]")
            console.print("[yellow]  ⚠ Review and update .env before starting in production.[/yellow]")
        else:
            console.print("[red]  .env.development.example not found. Cannot create .env.[/red]")

    # ── Create required directories ───────────────────────────
    console.print("\n[bold]1. Directories[/bold]")
    dirs = ["data/storage", "data/storage/raw", "models", "logs", "data/exports", "backups"]
    for d in dirs:
        (ROOT / d).mkdir(parents=True, exist_ok=True)
    console.print("  [green]✓ Data directories created[/green]")

    # ── Python dependencies ───────────────────────────────────
    console.print("\n[bold]2. Python dependencies[/bold]")
    backend_dir = ROOT / "backend"
    if (backend_dir / "pyproject.toml").exists():
        run_step(
            "Installing Python packages via uv",
            [sys.executable, "-m", "uv", "sync"],
            cwd=backend_dir,
        )
    else:
        console.print("  [yellow]⚠ backend/pyproject.toml not found[/yellow]")

    # ── Frontend dependencies ─────────────────────────────────
    console.print("\n[bold]3. Frontend dependencies[/bold]")
    frontend_dir = ROOT / "frontend"
    if (frontend_dir / "package.json").exists():
        run_step("Installing npm packages", ["npm", "install"], cwd=frontend_dir)
    else:
        console.print("  [yellow]⚠ frontend/package.json not found[/yellow]")

    # ── Database check ────────────────────────────────────────
    console.print("\n[bold]4. Database[/bold]")
    console.print("  [dim]PostgreSQL must be running before running migrations.[/dim]")
    console.print("  [dim]Run: python scripts/kp.py doctor  — to check DB connectivity.[/dim]")
    console.print("  [dim]Then: python -m alembic -c alembic.ini upgrade head[/dim]")

    console.print()
    console.print("[bold green]Setup complete.[/bold green]")
    console.print("[dim]Next steps:")
    console.print("  1. Ensure PostgreSQL and Redis are running")
    console.print("  2. Run: python scripts/kp.py doctor")
    console.print("  3. Run: python -m alembic -c alembic.ini upgrade head")
    console.print("  4. Run: python scripts/kp.py start[/dim]")
    console.print()


if __name__ == "__main__":
    run_setup()
