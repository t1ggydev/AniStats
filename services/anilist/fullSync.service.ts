import { prisma } from '../../utils/prisma';
import { anilistRequest } from './anilistClient';
import { applyAnimeSnapshot, FULL_ANIME_FIELDS, type FullAnimeResponse } from './syncAnime';
import { withAniListSyncLock } from './syncLock';

type Progress = { version: 1; watermark: number; bins: [number, number][]; page: number; checked: number; written: number; completed?: boolean };
const KEY = 'anilist_full_sync_progress';
const QUERY = `query FullPage($page:Int!,$lo:FuzzyDateInt,$hi:FuzzyDateInt) {
  Page(page:$page,perPage:50) { pageInfo { hasNextPage } media(type:ANIME,startDate_greater:$lo,startDate_lesser:$hi,sort:ID) { ${FULL_ANIME_FIELDS} } }
}`;
type PageResponse = { Page: { pageInfo: { hasNextPage: boolean }; media: FullAnimeResponse['Media'][] } };

// Date partitions avoid AniList's hard 5,000-entry pagination boundary.
// A page is committed before its cursor: replay following interruption is idempotent.
export async function runFullAniListSync() {
  return withAniListSyncLock(async assertHeld => {
    const stored = await prisma.syncState.findUnique({ where: { key: KEY } });
    let progress: Progress | undefined = stored ? JSON.parse(stored.value) : undefined;
    if (!progress || progress.completed) {
      const newest = await anilistRequest<{ Page: { media: { updatedAt: number }[] } }>(
        'query { Page(page:1,perPage:1) { media(type:ANIME,sort:UPDATED_AT_DESC) { updatedAt } } }', {});
      progress = { version: 1, watermark: newest.Page.media[0]!.updatedAt - 1, bins: [[0, 100000000]], page: 1, checked: 0, written: 0 };
    }
    if (progress.version !== 1) throw new Error('Unsupported sync cursor');
    const persist = async () => {
      assertHeld();
      const value = JSON.stringify(progress);
      await prisma.syncState.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
    };
    await persist();
    while (progress.bins.length) {
      assertHeld();
      const [lo, hi] = progress.bins[0]!;
      const variables = { lo: lo === 0 ? null : lo - 1, hi: hi === 100000000 ? null : hi };
      if (progress.page === 1) {
        const probe = await anilistRequest<{ Page: { pageInfo: { hasNextPage: boolean } } }>(
          'query($lo:FuzzyDateInt,$hi:FuzzyDateInt){Page(page:100,perPage:50){pageInfo{hasNextPage} media(type:ANIME,startDate_greater:$lo,startDate_lesser:$hi,sort:ID){id}}}', variables);
        if (probe.Page.pageInfo.hasNextPage) {
          if (hi - lo < 2) throw new Error('Unsplittable date partition exceeds provider depth');
          const mid = Math.floor((lo + hi) / 2);
          progress.bins.splice(0, 1, [lo, mid], [mid, hi]);
          await persist();
          continue;
        }
      }
      if (progress.page > 100) throw new Error('Date partition grew beyond provider depth; checkpoint unchanged');
      const result = await anilistRequest<PageResponse>(QUERY, { ...variables, page: progress.page });
      for (const media of result.Page.media) {
        assertHeld();
        if (await applyAnimeSnapshot(media)) progress.written++;
        progress.checked++;
      }
      if (result.Page.pageInfo.hasNextPage) progress.page++;
      else { progress.bins.shift(); progress.page = 1; }
      await persist();
      console.log(`[AniList full] checked=${progress.checked} written=${progress.written} partitions=${progress.bins.length} page=${progress.page}`);
    }
    // Never advance the global watermark until all partitions succeeded.
    assertHeld();
    await prisma.syncState.upsert({ where: { key: 'anilist_last_updated_at' }, update: { value: String(progress.watermark) }, create: { key: 'anilist_last_updated_at', value: String(progress.watermark) } });
    progress.completed = true;
    await persist();
    return progress;
  });
}
