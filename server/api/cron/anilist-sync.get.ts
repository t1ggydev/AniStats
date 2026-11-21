import { createError, defineEventHandler, getHeader } from "h3";
import { runHourlyAniListSync } from "../../../services/anilist/hourlySync.service";

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

  return runHourlyAniListSync();
});
