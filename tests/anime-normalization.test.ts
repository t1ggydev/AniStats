import { describe, expect, it, vi } from 'vitest';
vi.mock('../utils/prisma',()=>({prisma:{}}));
vi.mock('../services/anilist/anilistClient',()=>({anilistRequest:vi.fn()}));
import {normalizeAnimeSnapshot,type FullAnimeResponse} from '../services/anilist/syncAnime';
describe('duplicate upstream catalog metadata',()=>{
  it('keeps one genre/tag/edge while preserving distinct relation types and does not mutate the source',()=>{
    const source={id:1,genres:['Action','Action','Drama'],tags:[{id:2,name:'A'},{id:2,name:'A'}],relations:{edges:[{node:{id:3},relationType:'SEQUEL'},{node:{id:3},relationType:'SEQUEL'},{node:{id:3},relationType:'PREQUEL'}]}} as FullAnimeResponse['Media'];
    const result=normalizeAnimeSnapshot(source);
    expect(result.genres).toEqual(['Action','Drama']);expect(result.tags).toHaveLength(1);expect(result.relations.edges).toHaveLength(2);
    expect(source.genres).toHaveLength(3);expect(normalizeAnimeSnapshot(result)).toEqual(result);
  });
});
