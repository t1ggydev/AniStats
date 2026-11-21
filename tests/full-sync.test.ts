import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), write: vi.fn(), states: new Map<string,string>() }));
vi.mock('../utils/prisma', () => ({ prisma: { syncState: {
  findUnique: async ({where}: any) => mock.states.has(where.key) ? {value:mock.states.get(where.key)} : null,
  upsert: async ({where,update}: any) => { mock.states.set(where.key, update.value); },
} } }));
vi.mock('../services/anilist/anilistClient', () => ({anilistRequest:mock.request}));
vi.mock('../services/anilist/syncAnime', () => ({FULL_ANIME_FIELDS:'id',applyAnimeSnapshot:mock.write}));
vi.mock('../services/anilist/syncLock', () => ({withAniListSyncLock:(work:any)=>work(()=>{})}));
import { runFullAniListSync } from '../services/anilist/fullSync.service';
const page=(ids:number[],next=false)=>({Page:{pageInfo:{hasNextPage:next},media:ids.map(id=>({id}))}});
describe('resumable full catch-up',()=>{
  beforeEach(()=>{vi.resetAllMocks();mock.states.clear();mock.states.set('anilist_last_updated_at','100');mock.write.mockResolvedValue(true);});
  it('reuses a recent complete catalog only after checking that the provider has no newer updates',async()=>{
    mock.states.set('anilist_full_sync_progress',JSON.stringify({version:1,watermark:299,bins:[],page:1,checked:2,written:2,completed:true,completedAt:Date.now()/1000}));
    mock.request.mockResolvedValueOnce({Page:{media:[{updatedAt:300}]}});
    expect(await runFullAniListSync({reuseRecent:true})).toMatchObject({completed:true,reused:true,checked:2});
    expect(mock.write).not.toHaveBeenCalled();expect(mock.states.get('anilist_last_updated_at')).toBe('100');
  });
  it('splits deep partitions and only commits the captured watermark after completion',async()=>{
    mock.request.mockResolvedValueOnce({Page:{media:[{updatedAt:300}]}})
      .mockResolvedValueOnce(page([],true)).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([1]))
      .mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([2])).mockResolvedValueOnce({GenreCollection:[],MediaTagCollection:[]});
    const result=await runFullAniListSync();
    expect(result).toMatchObject({completed:true,checked:2,written:2});
    expect(mock.states.get('anilist_last_updated_at')).toBe('299');
    expect(mock.request.mock.calls[2][1]).toEqual({lo:null,hi:50000000,page:100});
    expect(mock.request.mock.calls[2][0]).not.toContain('startDate_greater');
  });
  it('replays an interrupted page without advancing the global checkpoint',async()=>{
    mock.request.mockResolvedValueOnce({Page:{media:[{updatedAt:300}]}}).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([1,2]));
    mock.write.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('database offline'));
    await expect(runFullAniListSync()).rejects.toThrow('database offline');
    expect(mock.states.get('anilist_last_updated_at')).toBe('100');
    expect(JSON.parse(mock.states.get('anilist_full_sync_progress')!)).toMatchObject({page:1,checked:0});
    mock.request.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([1,2])).mockResolvedValueOnce({GenreCollection:[],MediaTagCollection:[]});mock.write.mockResolvedValue(true);
    expect(await runFullAniListSync()).toMatchObject({checked:2,completed:true});
    expect(mock.states.get('anilist_last_updated_at')).toBe('299');
  });
});
