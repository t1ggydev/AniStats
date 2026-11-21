import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ held: false, releases: 0, flags: [] as string[] }));
vi.mock('pg', () => ({ default: { Client: class {
  owns = false;
  on() {}
  async connect() {}
  async query() { this.owns = !state.held; if (this.owns) state.held = true; return { rows: [{ acquired: this.owns }] }; }
  async end() { if (this.owns) { state.held = false; state.releases++; } }
} } }));
vi.mock('../utils/prisma', () => ({ prisma: { syncState: {
  upsert: vi.fn(async () => { state.flags.push('1'); }),
  update: vi.fn(async () => { state.flags.push('0'); }),
} } }));
import { withAniListSyncLock } from '../services/anilist/syncLock';
describe('database-owned sync exclusion', () => {
  beforeEach(() => { state.held = false; state.releases = 0; state.flags = []; });
  it('releases the lock and status after a failed sync so a retry works', async () => {
    await expect(withAniListSyncLock(async () => { throw new Error('API unavailable'); })).rejects.toThrow('API unavailable');
    await expect(withAniListSyncLock(async () => 'retry worked')).resolves.toBe('retry worked');
    expect(state.flags).toEqual(['1', '0', '1', '0']);
    expect(state.releases).toBe(2);
  });
  it('rejects a competing sync without changing the current owner status', async () => {
    await withAniListSyncLock(async () => {
      await expect(withAniListSyncLock(async () => 'must not run')).rejects.toMatchObject({ statusCode: 409 });
      expect(state.flags).toEqual(['1']);
    });
    expect(state.flags).toEqual(['1', '0']);
    expect(state.releases).toBe(1);
  });
});
