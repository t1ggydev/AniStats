import { prisma } from "../../utils/prisma"
import { discoverNewAnime } from "./discoverNewAnime"
import { syncAnime } from "./syncAnime"
import { withAniListSyncLock } from "./syncLock"

const PER_PAGE = 50

export async function runHourlyAniListSync() {
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

  while (!stop) {
    assertHeld()
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
    }

    page++
  }

  if (newestSeen > lastUpdatedAt) {
    await prisma.syncState.upsert({
      where: { key: "anilist_last_updated_at" },
      update: { value: String(newestSeen) },
      create: {
        key: "anilist_last_updated_at",
        value: String(newestSeen),
      },
    })

    console.log(
      `[AniList Sync] updated syncState → ${newestSeen}`
    )
  }

  console.log(
    `[AniList Sync] ✅ finished – checked=${checked}, written=${written}`
  )

  return {
    syncedUntil: newestSeen,
    previous: lastUpdatedAt,
    checked,
    written,
  }
  })
}
