"""Restore a libSQL read snapshot into a NEW isolated SQLite file; never overwrite."""
import base64
import json
import os
from pathlib import Path
import sqlite3
import sys

os.umask(0o077)
source, target = map(Path, sys.argv[1:3])
data = json.loads(source.read_text(encoding='utf-8'))
assert data['format'] == 1
target.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
def quote(value):
    return '"' + value.replace('"', '""') + '"'
def decode(value):
    if isinstance(value, dict):
        if set(value) == {'bigint'}: return int(value['bigint'])
        if set(value) == {'blob'}: return base64.b64decode(value['blob'])
        raise ValueError('Unknown typed value')
    return value
db = sqlite3.connect(target)
try:
    with db:
        for item in data['schema']:
            if item['type'] == 'table': db.execute(item['sql'])
        for table in data['tables']:
            sql = 'INSERT INTO ' + quote(table['name']) + ' (' + ','.join(map(quote, table['columns'])) + ') VALUES (' + ','.join('?' for _ in table['columns']) + ')'
            db.executemany(sql, [tuple(map(decode, row)) for row in table['rows']])
            actual = db.execute('SELECT count(*) FROM ' + quote(table['name'])).fetchone()[0]
            assert actual == len(table['rows']), table['name']
            # Compare all restored values, not just counts.
            restored = db.execute('SELECT ' + ','.join(map(quote, table['columns'])) + ' FROM ' + quote(table['name']) + ' ORDER BY rowid').fetchall()
            assert restored == [tuple(map(decode, row)) for row in table['rows']], table['name']
        for item in data['schema']:
            if item['type'] != 'table': db.execute(item['sql'])
        db.execute('DELETE FROM sqlite_sequence')
        db.executemany('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)', [(s['name'], int(s['seq'])) for s in data['sequences']])
    assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    print(json.dumps({'result': 'PASS', 'integrity': 'ok', 'foreignKeys': 'ok', 'allValuesCompared': True, 'tables': [{'name': t['name'], 'rows': len(t['rows'])} for t in data['tables']]}))
finally:
    db.close()
