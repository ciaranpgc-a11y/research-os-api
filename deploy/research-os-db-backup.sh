#!/bin/sh

set -eu

DB_PATH="${DB_PATH:-/var/lib/docker/volumes/research-os-api_api-data/_data/research_os.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/research-os-api}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
HOSTNAME_SHORT="$(hostname -s 2>/dev/null || hostname)"

export DB_PATH BACKUP_DIR RETENTION_DAYS TIMESTAMP HOSTNAME_SHORT

mkdir -p "$BACKUP_DIR"

python3 - <<'PY'
import gzip
import os
import shutil
import sqlite3
import time
from pathlib import Path

db_path = Path(os.environ["DB_PATH"])
backup_dir = Path(os.environ["BACKUP_DIR"])
retention_days = int(os.environ["RETENTION_DAYS"])
timestamp = os.environ["TIMESTAMP"]
hostname_short = os.environ["HOSTNAME_SHORT"]

if not db_path.exists():
    raise SystemExit(f"database not found: {db_path}")

backup_dir.mkdir(parents=True, exist_ok=True)

sqlite_copy = backup_dir / f"{db_path.stem}-{timestamp}-{hostname_short}.sqlite"
archive_path = backup_dir / f"{sqlite_copy.name}.gz"

source = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
destination = sqlite3.connect(sqlite_copy)

try:
    source.backup(destination)
finally:
    destination.close()
    source.close()

with sqlite_copy.open("rb") as source_file, gzip.open(archive_path, "wb", compresslevel=6) as archive_file:
    shutil.copyfileobj(source_file, archive_file)

sqlite_copy.unlink()

cutoff = time.time() - (retention_days * 86400)
for existing in backup_dir.glob("*.gz"):
    try:
        if existing.stat().st_mtime < cutoff:
            existing.unlink()
    except FileNotFoundError:
        pass

print(archive_path)
PY
