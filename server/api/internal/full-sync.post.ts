import { createError, defineEventHandler, getHeader } from 'h3';
import { runFullAniListSync } from '../../../services/anilist/fullSync.service';
import { runHourlyAniListSync } from '../../../services/anilist/hourlySync.service';
export default defineEventHandler(async event => {
  if (process.env.ANISTATS_ENABLE_SYNC_TEST !== 'true') throw createError({ statusCode: 404 });
  if (!process.env.CRON_SECRET || getHeader(event, 'authorization') !== 'Bearer '+process.env.CRON_SECRET) throw createError({ statusCode: 401 });
  const full = await runFullAniListSync();
  const followup = await runHourlyAniListSync();
  return { full, followup };
});
