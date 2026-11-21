import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  runningValue: null as null | string,
  authorization: 'Bearer test-cron-secret' as string | undefined,
}))

vi.mock('h3', async (importOriginal) => ({
  ...await importOriginal<typeof import('h3')>(),
  getHeader: () => state.authorization,
}))

const runHourlyAniListSyncMock = vi.hoisted(
  () => vi.fn<() => Promise<any>>(async () => ({ ok: true }))
)

vi.mock("../utils/prisma", () => ({
  prisma: {
    syncState: {
      findUnique: vi.fn(async () =>
        state.runningValue === null ? null : { value: state.runningValue }
      ),
    },
  },
}))

vi.mock("../services/anilist/fullSync.service", () => ({
  runFullAniListSync: runHourlyAniListSyncMock,
}))

describe("api/cron/anilist-sync.get", () => {
  beforeEach(() => {
    vi.resetModules()
    runHourlyAniListSyncMock.mockClear()
    state.runningValue = null
    runHourlyAniListSyncMock.mockResolvedValue({ ok: true })
    state.authorization = 'Bearer test-cron-secret'
    vi.stubEnv('CRON_SECRET', 'test-cron-secret')
  })

  it('fails closed when no cron secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const mod = await import('../server/api/cron/anilist-sync.get')
    await expect(mod.default({} as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(runHourlyAniListSyncMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated cron requests', async () => {
    state.authorization = undefined
    const mod = await import('../server/api/cron/anilist-sync.get')
    await expect(mod.default({} as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(runHourlyAniListSyncMock).not.toHaveBeenCalled()
  })

  it("returns 409 when sync is already running", async () => {
    runHourlyAniListSyncMock.mockRejectedValueOnce(Object.assign(new Error('AniList sync already running'), {
      statusCode: 409, statusMessage: 'AniList sync already running',
    }))
    const mod = await import("../server/api/cron/anilist-sync.get")

    await expect(mod.default({} as any)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "AniList sync already running",
    })
    expect(runHourlyAniListSyncMock).toHaveBeenCalledTimes(1)
  })

  it("runs sync when no active lock exists", async () => {
    state.runningValue = "0"
    runHourlyAniListSyncMock.mockResolvedValueOnce({ synced: 12 })

    const mod = await import("../server/api/cron/anilist-sync.get")
    await expect(mod.default({} as any)).resolves.toEqual({ synced: 12 })
    expect(runHourlyAniListSyncMock).toHaveBeenCalledTimes(1)
  })
})
