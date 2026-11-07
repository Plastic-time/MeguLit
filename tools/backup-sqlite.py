"""Consistent SQLite backup, including committed WAL, without modifying the source."""
import pathlib
import sqlite3
import sys
import shutil
import tempfile

source_path, target_path = map(pathlib.Path, sys.argv[1:3])
def stamps():
    result = []
    for item in [source_path, pathlib.Path(str(source_path) + '-wal')]:
        try:
            stat = item.stat()
            result.append((str(item), stat.st_size, stat.st_mtime_ns))
        except FileNotFoundError:
            result.append((str(item), None, None))
    return result

# SQLite cannot create a source -shm in the read-only legacy directory.
# First checkpoint bytes without SQLite access there, validating both files
# stayed unchanged during the copy. WAL recovery happens only in our folder.
with tempfile.TemporaryDirectory(prefix='sqlite-copy-', dir=target_path.parent) as work:
    copied = pathlib.Path(work) / 'source.sqlite'
    for attempt in range(5):
        before = stamps()
        shutil.copyfile(source_path, copied)
        wal = pathlib.Path(str(source_path) + '-wal')
        copied_wal = pathlib.Path(str(copied) + '-wal')
        if wal.exists():
            shutil.copyfile(wal, copied_wal)
        elif copied_wal.exists():
            copied_wal.unlink()
        if stamps() == before:
            break
    else:
        raise RuntimeError('Source changed throughout snapshot attempts; no consistent snapshot saved')
    source = sqlite3.connect(str(copied), timeout=5)
    target = sqlite3.connect(str(target_path))
    try:
        source.backup(target, pages=128, sleep=0.05)
        if target.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite snapshot integrity check failed')
    finally:
        target.close()
        source.close()
