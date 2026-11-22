// Credentials arrive only on stdin. Production is accessed through a read transaction.
// No migrations, sync, schema changes or writes are performed against the source.
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const env = JSON.parse(Buffer.concat(input).toString('utf8').replace(/^\uFEFF/, ''));
if (!env.DATABASE_URL?.startsWith('libsql://') || !env.DATABASE_AUTH_TOKEN) {
  throw new Error('Expected remote libSQL source credentials on stdin');
}
const destination = resolve(process.argv[2] || 'artifacts/database-export.json');
const source = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
const transaction = await source.transaction('read');
const encode = value => typeof value === 'bigint' ? { bigint: String(value) }
  : value instanceof ArrayBuffer ? { blob: Buffer.from(value).toString('base64') } : value;
try {
  const schema = await transaction.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name");
  const tables = [];
  for (const definition of schema.rows.filter(row => row.type === 'table')) {
    const quoted = '"' + definition.name.replaceAll('"', '""') + '"';
    const result = await transaction.execute(`SELECT * FROM ${quoted} ORDER BY rowid`);
    const rows = result.rows.map(row => result.columns.map(column => encode(row[column])));
    tables.push({ name: definition.name, columns: result.columns, rows });
  }
  const sequences = await transaction.execute('SELECT name,seq FROM sqlite_sequence');
  await transaction.commit();
  const payload = JSON.stringify({ format: 1, capturedAt: new Date().toISOString(),
    schema: schema.rows.map(row => Object.fromEntries(Object.entries(row))), tables,
    sequences: sequences.rows.map(row => ({ name: row.name, seq: String(row.seq) })) });
  await mkdir(resolve(destination, '..'), { recursive: true });
  await writeFile(destination, payload, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ result: 'PASS', sourceReadOnly: true,
    sha256: createHash('sha256').update(payload).digest('hex'),
    tables: tables.map(table => ({ name: table.name, rows: table.rows.length })) }));
} finally {
  if (!transaction.closed) await transaction.rollback();
  source.close();
}
