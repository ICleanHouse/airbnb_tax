#!/usr/bin/env python
"""Django command-line utility."""

import os
import sys
from pathlib import Path


def load_dotenv() -> None:
    """Load .env from the repo root (one level above this file) if present."""
    try:
        from dotenv import load_dotenv as _load
        env_path = Path(__file__).resolve().parent.parent / ".env"
        _load(env_path, override=False)
    except ImportError:
        pass  # python-dotenv not installed — rely on the shell environment


def main() -> None:
    load_dotenv()
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()

