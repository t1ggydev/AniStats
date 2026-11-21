import pg from 'pg';
import { createError } from 'h3';
import { prisma } from '../../utils/prisma';

// Session locks are database-local and automatically released after a crash.
// The legacy SyncState flag remains informative; it no longer controls admission.
export async function withAniListSyncLock<T>(work: (assertHeld: () => void) => Promise<T>): Promise<T> {
  const connection = new pg.Client({ connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000, application_name: 'anistats-sync-lock' });
  let connectionLost = false;
  let acquired = false;
  connection.on('error', () => { connectionLost = true; });
  const assertHeld = () => { if (connectionLost) throw new Error('Sync lock connection lost'); };
  try {
    await connection.connect();
    const result = await connection.query('SELECT pg_try_advisory_lock(734102617, 1) AS acquired');
    acquired = result.rows[0].acquired === true;
    if (!acquired) throw createError({ statusCode: 409, statusMessage: 'AniList sync already running' });
    await prisma.syncState.upsert({ where: { key: 'anilist_sync_running' },
      update: { value: '1' }, create: { key: 'anilist_sync_running', value: '1' } });
    try { return await work(assertHeld); }
    finally {
      await prisma.syncState.update({ where: { key: 'anilist_sync_running' }, data: { value: '0' } });
    }
  } finally {
    // Closing this dedicated connection releases the session lock, including on errors.
    await connection.end();
  }
}
