import { createError, defineEventHandler, getHeader } from "h3";
import { runFullAniListSync } from "../../../services/anilist/fullSync.service";

export default defineEventHandler(async (event) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = getHeader(event, "authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
    }
  } else {
    throw createError({ statusCode: 503, statusMessage: "Scheduled sync is not configured" });
  }

  return runFullAniListSync({ reuseRecent: true });
});
