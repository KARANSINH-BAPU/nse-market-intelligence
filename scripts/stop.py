"""
KP Stop — Terminate all running KP service processes.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from rich.console import Console

console = Console()
ROOT = Path(__file__).parent.parent


def run_stop() -> None:
    console.print("[yellow]Stopping KP services...[/yellow]")

    # Kill processes using known KP ports
    ports = [8000, 3000]
    for port in ports:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if f":{port} " in line and "LISTENING" in line:
                parts = line.strip().split()
                pid = parts[-1]
                if pid and pid.isdigit():
                    subprocess.run(["taskkill", "/PID", pid, "/F"],
                                   capture_output=True)
                    console.print(f"  [dim]Stopped process on port {port} (PID {pid})[/dim]")
                    break

    console.print("[green]Done.[/green]")


if __name__ == "__main__":
    run_stop()
