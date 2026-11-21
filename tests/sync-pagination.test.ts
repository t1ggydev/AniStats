import { beforeEach, describe, expect, it, vi } from 'vitest';
const discover = vi.hoisted(() => vi.fn());
const sync = vi.hoisted(() => vi.fn());
const checkpoint = vi.hoisted(() => vi.fn());
vi.mock('../services/anilist/discoverNewAnime', () => ({ discoverNewAnime: discover }));
vi.mock('../services/anilist/syncAnime', () => ({ syncAnime: sync }));
vi.mock('../services/anilist/syncLock', () => ({ withAniListSyncLock: (work: any) => work(() => {}) }));
vi.mock('../utils/prisma', () => ({ prisma: { syncState: { findUnique: async () => ({ value: '100' }), upsert: checkpoint } } }));
import { runHourlyAniListSync } from '../services/anilist/hourlySync.service';
describe('incremental sync pagination', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('continues after an unchanged page and saves the newest completed checkpoint', async () => {
    discover.mockResolvedValueOnce([{ id: 1, updatedAt: 300 }])
      .mockResolvedValueOnce([{ id: 2, updatedAt: 200 }, { id: 3, updatedAt: 90 }]);
    sync.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const out = await runHourlyAniListSync();
    expect(out).toMatchObject({ checked: 2, written: 1, syncedUntil: 300 });
    expect(sync.mock.calls.map(row => row[0])).toEqual([1, 2]);
    expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({ update: { value: '300' } }));
  });
  it('keeps the checkpoint unchanged when a page fails', async () => {
    discover.mockResolvedValueOnce([{ id: 1, updatedAt: 300 }]).mockRejectedValueOnce(new Error('network unavailable'));
    sync.mockResolvedValueOnce(true);
    await expect(runHourlyAniListSync()).rejects.toThrow('network unavailable');
    expect(checkpoint).not.toHaveBeenCalled();
  });
});
