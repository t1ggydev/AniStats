import { prisma } from "../../utils/prisma"
import { discoverNewAnime } from "./discoverNewAnime"
import { syncAnime } from "./syncAnime"
import { withAniListSyncLock } from "./syncLock"

const PER_PAGE = 50

export async function runHourlyAniListSync(options: { maxItems?: number } = {}) {
  if (options.maxItems !== undefined && (!Number.isInteger(options.maxItems) || options.maxItems < 1 || options.maxItems > 3)) {
    throw new Error('Test sync limit must be between one and three items')
  }
  return withAniListSyncLock(async (assertHeld) => {
  console.log("[AniList Sync] 🚀 started")

  const state = await prisma.syncState.findUnique({
    where: { key: "anilist_last_updated_at" },
  })

  const lastUpdatedAt = Number(state?.value ?? 0)
  let newestSeen = lastUpdatedAt

  console.log(`[AniList Sync] lastUpdatedAt=${lastUpdatedAt || "none"}`)

  let page = 1
  let stop = false
  let checked = 0
  let written = 0
  let partial = false

  while (!stop) {
    assertHeld()
    if (page > 100) throw new Error('AniList page depth exhausted; full catch-up required; checkpoint unchanged')
    console.log(`[AniList Sync] fetching page=${page}`)

    const media = await discoverNewAnime(page, PER_PAGE)
    assertHeld()

    if (media.length === 0) {
      console.log("[AniList Sync] no more media → stop")
      break
    }

    const pageMax = Math.max(...media.map(m => m.updatedAt))
    const pageMin = Math.min(...media.map(m => m.updatedAt))

    console.log(
      `[AniList Sync] page=${page} updatedAt range ${pageMax}..${pageMin}`
    )

    for (const m of media) {
      if (m.updatedAt <= lastUpdatedAt) {
        console.log(
          `[AniList Sync] reached already-synced anime (id=${m.id}) → stop`
        )
        stop = true
        break
      }

      console.log(
        `[AniList Sync] checking anime id=${m.id} updatedAt=${m.updatedAt}`
      )

      const changed = await syncAnime(m.id)
      assertHeld()
      checked++

      if (changed) {
        written++
      }

      if (m.updatedAt > newestSeen) {
        newestSeen = m.updatedAt
      }
      if (options.maxItems !== undefined && checked >= options.maxItems) {
        partial = true
        stop = true
        break
      }
    }

    page++
  }

  // Retain a one-second overlap: new records can acquire the same provider
  // timestamp while pagination is in progress. Hashes make replay harmless.
  const completedCheckpoint = Math.max(lastUpdatedAt, newestSeen - 1)
  if (!partial && completedCheckpoint > lastUpdatedAt) {
    await prisma.syncState.upsert({
      where: { key: "anilist_last_updated_at" },
      update: { value: String(completedCheckpoint) },
      create: {
        key: "anilist_last_updated_at",
        value: String(completedCheckpoint),
      },
    })

    console.log(
      `[AniList Sync] updated syncState → ${completedCheckpoint}`
    )
  }

  console.log(
    `[AniList Sync] ✅ finished – checked=${checked}, written=${written}`
  )

  return {
    syncedUntil: partial ? lastUpdatedAt : completedCheckpoint,
    observedUntil: newestSeen,
    partial,
    previous: lastUpdatedAt,
    checked,
    written,
  }
  })
}
