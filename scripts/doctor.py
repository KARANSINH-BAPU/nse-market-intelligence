"""
KP Doctor — Environment Health Checker
Runs all environment checks and reports real results.
Never fabricates a passing status.
"""

from __future__ import annotations

import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

ROOT = Path(__file__).parent.parent
console = Console(force_terminal=True, highlight=False)


# ── Check helpers ────────────────────────────────────────────
def check(name: str, fn: Callable[[], tuple[bool, str]]) -> tuple[bool, str, str]:
    try:
        ok, detail = fn()
        return ok, name, detail
    except Exception as exc:
        return False, name, f"Exception: {exc}"


def _check_python() -> tuple[bool, str]:
    v = sys.version_info
    ver = f"{v.major}.{v.minor}.{v.micro}"
    if v.major >= 3 and v.minor >= 12:
        return True, f"Python {ver} at {sys.executable}"
    return False, f"Python {ver} — need >= 3.12"


def _check_node() -> tuple[bool, str]:
    node = shutil.which("node")
    if not node:
        return False, "Node.js not found in PATH"
    result = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10)
    if result.returncode == 0:
        ver = result.stdout.strip()
        return True, f"Node.js {ver}"
    return False, "Node.js not found"


def _check_npm() -> tuple[bool, str]:
    npm = shutil.which("npm")
    if not npm:
        return False, "npm not found in PATH"
    result = subprocess.run([npm, "--version"], capture_output=True, text=True, timeout=10)
    if result.returncode == 0:
        return True, f"npm {result.stdout.strip()}"
    return False, "npm not found or execution policy blocking"


def _check_git() -> tuple[bool, str]:
    git = shutil.which("git")
    if not git:
        return False, "Git not found in PATH"
    result = subprocess.run([git, "--version"], capture_output=True, text=True, timeout=10)
    if result.returncode == 0:
        return True, result.stdout.strip()
    return False, "Git not found"


def _check_uv() -> tuple[bool, str]:
    result = subprocess.run(
        [sys.executable, "-m", "uv", "--version"],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode == 0:
        return True, result.stdout.strip()
    return False, "uv not found — install with: pip install uv"


def _check_env_file() -> tuple[bool, str]:
    env_file = ROOT / ".env"
    example = ROOT / ".env.example"
    if env_file.exists():
        return True, f".env found at {env_file}"
    if example.exists():
        return False, f".env NOT found. Copy .env.example to .env and configure it."
    return False, ".env and .env.example both missing"


def _check_database() -> tuple[bool, str]:
    """Try to TCP-connect to the configured DB host."""
    try:
        sys.path.insert(0, str(ROOT / "backend"))
        from app.core.config import settings
        url = settings.DATABASE_URL
        # Extract host:port from URL
        # postgresql+asyncpg://user:pass@host:port/db
        parts = url.split("@")[-1].split("/")[0]
        host, _, port_str = parts.partition(":")
        port = int(port_str) if port_str else 5432
        sock = socket.create_connection((host, port), timeout=3)
        sock.close()
        return True, f"PostgreSQL reachable at {host}:{port}"
    except Exception as exc:
        return False, f"PostgreSQL unreachable: {exc}"


def _check_redis() -> tuple[bool, str]:
    """Try to TCP-connect to Redis."""
    try:
        sys.path.insert(0, str(ROOT / "backend"))
        from app.core.config import settings
        url = settings.REDIS_URL
        # redis://host:port/db
        parts = url.replace("redis://", "").split("/")[0]
        host, _, port_str = parts.partition(":")
        port = int(port_str) if port_str else 6379
        sock = socket.create_connection((host, port), timeout=3)
        sock.close()
        return True, f"Redis reachable at {host}:{port}"
    except Exception as exc:
        return False, f"Redis unreachable: {exc}"


def _check_dirs() -> tuple[bool, str]:
    required = ["backend", "frontend", "migrations", "scripts", "docs", "tests"]
    missing = [d for d in required if not (ROOT / d).is_dir()]
    if not missing:
        return True, "All required directories present"
    return False, f"Missing: {', '.join(missing)}"


def _check_port(port: int, name: str) -> tuple[bool, str]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    result = sock.connect_ex(("127.0.0.1", port))
    sock.close()
    if result == 0:
        return True, f"Port {port} ({name}) is listening"
    return False, f"Port {port} ({name}) not listening — service may be stopped"


def _check_backend_port() -> tuple[bool, str]:
    return _check_port(8000, "KP Backend")


def _check_frontend_port() -> tuple[bool, str]:
    return _check_port(3000, "KP Frontend")


def _check_disk() -> tuple[bool, str]:
    usage = shutil.disk_usage(ROOT)
    free_gb = usage.free / 1e9
    if free_gb >= 5:
        return True, f"{free_gb:.1f} GB free on {ROOT.drive}"
    return False, f"Only {free_gb:.1f} GB free — recommend >= 5 GB"


# ── Main doctor ──────────────────────────────────────────────
def run_doctor() -> None:
    console.print()
    console.print(Panel.fit(
        "[bold cyan]KP[/bold cyan] [white]Environment Health Check[/white]",
        border_style="cyan",
    ))
    console.print()

    checks = [
        ("Python >= 3.12", _check_python),
        ("Node.js", _check_node),
        ("npm", _check_npm),
        ("Git", _check_git),
        ("uv package manager", _check_uv),
        (".env file", _check_env_file),
        ("Directory structure", _check_dirs),
        ("Disk space", _check_disk),
        ("PostgreSQL (TCP)", _check_database),
        ("Redis (TCP)", _check_redis),
        ("Backend server :8000", _check_backend_port),
        ("Frontend server :3000", _check_frontend_port),
    ]

    table = Table(
        box=box.ROUNDED,
        show_header=True,
        header_style="bold dim",
        border_style="dim",
        expand=True,
    )
    table.add_column("Component", style="white", width=30)
    table.add_column("Status", width=8)
    table.add_column("Detail", style="dim")

    passed = 0
    failed = 0
    warnings = 0

    for name, fn in checks:
        ok, _, detail = check(name, fn)
        if ok:
            status_str = "[bold green]  OK[/bold green]"
            passed += 1
        else:
            # Some checks are warnings, not failures
            if name in ("Backend server :8000", "Frontend server :3000"):
                status_str = "[bold yellow]STOP[/bold yellow]"
                warnings += 1
            else:
                status_str = "[bold red]FAIL[/bold red]"
                failed += 1
        table.add_row(name, status_str, detail)

    console.print(table)
    console.print()

    total = passed + failed + warnings
    if failed == 0:
        console.print(f"[bold green]PASS {passed}/{total} checks passed[/bold green]", end="")
        if warnings > 0:
            console.print(f" [yellow]({warnings} services not running)[/yellow]")
        else:
            console.print()
        console.print("[dim]KP environment looks healthy.[/dim]")
    else:
        console.print(
            f"[bold red]FAIL {failed} check(s) failed[/bold red] "
            f"[dim]({passed} passed, {warnings} warnings)[/dim]"
        )
        console.print("[dim]Fix the failed items above, then run [cyan]kp doctor[/cyan] again.[/dim]")
    console.print()


if __name__ == "__main__":
    run_doctor()
