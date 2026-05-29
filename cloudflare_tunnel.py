import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / ".cloudflare_tunnel_state.json"
COMPOSE_FILES = ["-f", "docker-compose.yml", "-f", "docker-compose.tunnel.yml"]
TUNNEL_URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com", re.IGNORECASE)


def docker_compose_base() -> list[str]:
    docker = shutil.which("docker")
    if docker:
        return [docker, "compose"]
    docker_compose = shutil.which("docker-compose")
    if docker_compose:
        return [docker_compose]
    raise RuntimeError("Docker Compose was not found. Install Docker Desktop and make sure docker is on PATH.")


def compose_command(*args: str) -> list[str]:
    return [*docker_compose_base(), *COMPOSE_FILES, *args]


def run_compose(*args: str, capture: bool = False) -> subprocess.CompletedProcess:
    command = compose_command(*args)
    return subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        check=False,
    )


def read_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def write_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def tunnel_logs() -> str:
    result = run_compose("logs", "--no-color", "tunnel", capture=True)
    return result.stdout or ""


def find_tunnel_url(timeout: int = 90) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        logs = tunnel_logs()
        match = TUNNEL_URL_RE.search(logs)
        if match:
            return match.group(0)
        time.sleep(2)
    raise RuntimeError("Cloudflare tunnel URL was not found in the tunnel container logs.")


def start(args: argparse.Namespace) -> None:
    if read_state() and not args.force:
        raise RuntimeError("A tunnel state file already exists. Run stop first or pass --force.")
    if args.force:
        stop(argparse.Namespace(volumes=False))

    up_args = ["up", "-d"]
    if args.build:
        up_args.append("--build")
    result = run_compose(*up_args)
    if result.returncode != 0:
        raise RuntimeError("docker compose up failed.")

    print("Waiting for Cloudflare tunnel URL...")
    url = find_tunnel_url()
    write_state({"url": url, "started_at": time.strftime("%Y-%m-%d %H:%M:%S")})
    print("\nTunnel is running:")
    print(url)
    print(f"\nStop it with: {sys.executable} {Path(__file__).name} stop")


def stop(args: argparse.Namespace) -> None:
    down_args = ["down"]
    if getattr(args, "volumes", False):
        down_args.append("--volumes")
    result = run_compose(*down_args)
    if result.returncode != 0:
        raise RuntimeError("docker compose down failed.")
    STATE_FILE.unlink(missing_ok=True)
    print("Stopped Docker tunnel stack.")


def status(_: argparse.Namespace) -> None:
    state = read_state()
    if state:
        print(f"URL: {state.get('url', 'unknown')}")
        print(f"Started: {state.get('started_at', 'unknown')}")
    result = run_compose("ps", capture=True)
    if result.stdout:
        print(result.stdout.rstrip())
    logs = tunnel_logs()
    match = TUNNEL_URL_RE.search(logs)
    if match and (not state or state.get("url") != match.group(0)):
        print(f"Tunnel URL from logs: {match.group(0)}")


def logs(_: argparse.Namespace) -> None:
    result = run_compose("logs", "--tail", "200", "--no-color", capture=True)
    if result.stdout:
        print(result.stdout.rstrip())


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Docker app stack through a Cloudflare testing tunnel.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    start_parser = subparsers.add_parser("start")
    start_parser.add_argument("--build", action="store_true", help="Build images before starting.")
    start_parser.add_argument("--force", action="store_true", help="Stop any recorded stack before starting again.")
    start_parser.set_defaults(func=start)

    stop_parser = subparsers.add_parser("stop")
    stop_parser.add_argument("--volumes", action="store_true", help="Also remove Docker volumes.")
    stop_parser.set_defaults(func=stop)

    status_parser = subparsers.add_parser("status")
    status_parser.set_defaults(func=status)

    logs_parser = subparsers.add_parser("logs")
    logs_parser.set_defaults(func=logs)

    args = parser.parse_args()
    try:
        args.func(args)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
