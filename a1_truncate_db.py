import sqlite3
import sys
from pathlib import Path


PRESERVED_TABLES = {
    # Keep migration history because this script truncates rows, not schemas.
    # Emptying django_migrations would make Django think existing tables still
    # need to be created on the next migrate.
    "django_migrations",
}

SQLITE_INTERNAL_TABLE_PREFIXES = ("sqlite_",)


def quote_identifier(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) * 2)}"'


def discover_truncatable_tables(cur: sqlite3.Cursor) -> list[str]:
    cur.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name;
        """
    )
    table_names = [row[0] for row in cur.fetchall()]
    return [
        name
        for name in table_names
        if name not in PRESERVED_TABLES
        and not any(name.startswith(prefix) for prefix in SQLITE_INTERNAL_TABLE_PREFIXES)
    ]


def truncate_tables(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF;")
        cur.execute("BEGIN;")

        truncatable_tables = discover_truncatable_tables(cur)

        for table in truncatable_tables:
            cur.execute(f"DELETE FROM {quote_identifier(table)};")

        # Reset AUTOINCREMENT counters only if sqlite_sequence exists.
        cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence';"
        )
        if cur.fetchone():
            if truncatable_tables:
                placeholders = ",".join("?" for _ in truncatable_tables)
                cur.execute(
                    f"DELETE FROM sqlite_sequence WHERE name IN ({placeholders});",
                    truncatable_tables,
                )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.close()


def resolve_db_path() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1]).resolve()

    base = Path(__file__).resolve().parent
    preferred = base / "backend" / "db.sqlite3"
    fallback = base / "db.sqlite3"
    return preferred if preferred.exists() else fallback


if __name__ == "__main__":
    db_file = resolve_db_path()
    truncate_tables(db_file)
    print(f"Truncated data tables and reset IDs in {db_file}")
