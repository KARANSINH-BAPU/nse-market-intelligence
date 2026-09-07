"""
KP Start — Launch all services.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

from rich.console import Console
from rich.panel import Panel

ROOT = Path(__file__).parent.parent
console = Console()

_BACKEND_PROCESS = None
_FRONTEND_PROCESS = None


def run_start(backend: bool = True, frontend: bool = True) -> None:
    global _BACKEND_PROCESS, _FRONTEND_PROCESS

    console.print()
    console.print(Panel.fit(
        "[bold cyan]KP[/bold cyan] [white]Starting services...[/white]",
        border_style="cyan",
    ))
    console.print()

    processes = []

    if backend:
        console.print("[bold]Starting KP Backend (FastAPI)[/bold]")
        backend_dir = ROOT / "backend"
        proc = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn",
                "app.main:app",
                "--host", "0.0.0.0",
                "--port", "8000",
                "--reload",
                "--log-level", "info",
            ],
            cwd=str(backend_dir),
        )
        processes.append(("Backend", proc, "http://localhost:8000/health"))
        console.print("  [green]✓ Backend starting at http://localhost:8000[/green]")
        console.print("  [dim]  API docs: http://localhost:8000/docs[/dim]")
        console.print("  [dim]  Health:   http://localhost:8000/health[/dim]")

    time.sleep(1)

    if frontend:
        console.print("\n[bold]Starting KP Frontend (Next.js)[/bold]")
        frontend_dir = ROOT / "frontend"
        if (frontend_dir / "package.json").exists():
            proc = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=str(frontend_dir),
            )
            processes.append(("Frontend", proc, "http://localhost:3000"))
            console.print("  [green]✓ Frontend starting at http://localhost:3000[/green]")
        else:
            console.print("  [yellow]⚠ frontend/package.json not found. Run: python scripts/kp.py setup[/yellow]")

    if processes:
        console.print()
        console.print("[dim]Press Ctrl+C to stop all services.[/dim]")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            console.print("\n[yellow]Stopping services...[/yellow]")
            for name, proc, _ in processes:
                proc.terminate()
                console.print(f"  [dim]Stopped {name}[/dim]")
            console.print("[green]All services stopped.[/green]")


if __name__ == "__main__":
    run_start()
