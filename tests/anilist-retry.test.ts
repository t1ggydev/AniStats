import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
describe('AniList bounded retries through the real rate queue', () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('retries a 429 without waiting on its own queue entry', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(Response.json({ data: { ok: true } }));
    vi.stubGlobal('fetch', fetch);
    const { anilistRequest } = await import('../services/anilist/anilistClient');
    const result = anilistRequest('query Test { Viewer { id } }', {});
    await vi.advanceTimersByTimeAsync(2500);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('deduplicates concurrent identical requests', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: { id: 1 } }));
    vi.stubGlobal('fetch', fetch);
    const { anilistRequest } = await import('../services/anilist/anilistClient');
    const first = anilistRequest('query Test { Viewer { id } }', {});
    const second = anilistRequest('query Test { Viewer { id } }', {});
    await vi.advanceTimersByTimeAsync(1500);
    expect(await first).toEqual(await second);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
