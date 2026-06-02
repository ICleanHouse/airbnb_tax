import sqlite3
import sys
from pathlib import Path


TABLES = [
    "feedback_review",
    "marketplace_assignment",
    "marketplace_cleanerapplication",
    "marketplace_cleaningjob",
    "marketplace_cleaningbatch",
    "marketplace_favouritecleaner",
    "properties_propertyimage",
    "properties_reservation",
    "properties_externalcalendarconnection",
    "properties_property",
    "notifications_notification",
    "accounts_agencymembership",
    "accounts_agencyinvitation",
    "accounts_agencyprofile",
    "accounts_cleanerprofile",
    "accounts_cookieconsent",
    "accounts_hostprofile",
    "accounts_signupemailverification",
    "accounts_user",
]


def truncate_tables(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF;")
        cur.execute("BEGIN;")

        # Ensure we're targeting the expected DB file.
        cur.execute(
            f"SELECT name FROM sqlite_master WHERE type='table' AND name IN ({','.join('?' for _ in TABLES)});",
            TABLES,
        )
        existing = {row[0] for row in cur.fetchall()}

        for table in [name for name in TABLES if name in existing]:
            cur.execute(f"DELETE FROM {table};")

        # Reset AUTOINCREMENT counters only if sqlite_sequence exists.
        cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence';"
        )
        if cur.fetchone():
            existing_tables = [name for name in TABLES if name in existing]
            if existing_tables:
                placeholders = ",".join("?" for _ in existing_tables)
                cur.execute(
                    f"DELETE FROM sqlite_sequence WHERE name IN ({placeholders});", existing_tables
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
    print(f"Truncated tables and reset IDs in {db_file}")
