# AniStats migration preparation

## Source and destination

The production deployment is Vercel project `anilist-stats`, ID `prj_VzGeA0Rh7zxWlT0inTGMxNmuhpW9`, source commit `3cbd2d43bad978f46e1133cf8d56214223ff62cb` on `main` (verified 2026-11-21).
It uses **Turso/libSQL**, not Supabase. Source production URL is `https://anistats.kluge-it.tech` and the AniList callback is `/api/auth/callback` on that same domain.
Vercel also serves `beta.anistats.kluge-it.tech` and its own deployment hostname. No domain, production environment variable or alias has been changed.

The isolated candidate runs on `apps01`, Docker project `anistats-stage`, loopback port 3300 only.
It connects to database `anistats_stage` on the existing Supabase PostgreSQL server on `supabase01`.
This is a separate PostgreSQL database and non-superuser role, not a new shared Koipond schema.
AniStats uses Prisma/PostgreSQL directly; its AniList login does not require Supabase Auth or PostgREST.
The private TCP proxy binds `10.10.10.30:5433`; the guest forwarding firewall permits only `10.10.10.20`.
It does not publish a database port on a public address. This database connection is on the private Proxmox network.

Open the private candidate from an authorized SSH client:

```sh
ssh -N -L 13300:127.0.0.1:3300 apps01
```

Then visit `http://localhost:13300`. Staging uses a separate AniList test application with callback `http://localhost:13300/api/auth/callback`; it never changes the production OAuth application.
The owner confirmed the test login, dashboard, history and recommendations on 2026-11-21.
`outputs/AniStats-Testzugang-oeffnen.ps1` in the operations workspace can re-establish the local forwarding connection.

## Runtime and builds

`Dockerfile` builds Nitro using the `node-server` preset. The final image contains only `.output`, runs as the unprivileged `node` user and has a database-backed health check.
`--target verify` additionally runs backend, frontend and synthetic performance tests on Linux.
No production secrets enter a build. Runtime variables are in a root-readable env file installed by Ansible with `no_log`.

Required production runtime values:

- `DATABASE_URL`: the new PostgreSQL database URL, never the Turso URL.
- `NUXT_PUBLIC_SITE_URL`: canonical public URL.
- `NUXT_ANILIST_CLIENT_ID`, `NUXT_ANILIST_CLIENT_SECRET`, `NUXT_ANILIST_REDIRECT_URI`: runtime Nitro configuration.
- `CRON_SECRET`: independent random bearer secret. Missing configuration now refuses sync requests.
- `ANISTATS_AUTH_DISABLED=true` until a separate test OAuth profile is configured; current staging has its own profile and this flag is false.
- `ANISTATS_MONITORING_TOKEN`: independent secret for the private aggregate metrics endpoint.
- `ANISTATS_ENVIRONMENT=stage` in staging; the immutable artifact supports a production label when explicitly promoted later.
- `ANISTATS_ENABLE_SYNC_TEST=true` only in staging; enables a protected three-item test endpoint.

`DATABASE_AUTH_TOKEN` is no longer a runtime dependency. Turso credentials remain only in the encrypted source recovery archive.
The preparation branch disables its automatic Vercel deployments. Do not merge this branch into Vercel production before approved cutover: its Prisma provider has changed.

## Data import and recovery evidence

The read-only Turso transaction exported seven tables at `2026-11-21T20:56:08.252Z`:

| Table | Rows |
|---|---:|
| Anime | 22,456 |
| AnimeGenre | 44,396 |
| AnimeRelation | 20,004 |
| AnimeTag | 132,068 |
| Genre | 19 |
| SyncState | 2 |
| Tag | 417 |

Total: 219,362 rows. Timestamps are normalized to UTC millisecond precision and SQLite 0/1 values to PostgreSQL booleans. All IDs and business values are preserved.
PostgreSQL foreign keys and indexes are created from the new Prisma migration; autoincrement sequences are reset to existing maximum IDs.
Legacy SQLite migrations stay intact at `prisma/migrations`; PostgreSQL history is explicitly separate at `prisma/migrations-postgresql`.

Infrastructure scripts live under `/home/leon/homelab-ansible/root-infra/files/anistats`:

- `pg-import.py`: refuses an existing populated target, imports in one transaction, verifies every transformed value. Only `anistats_stage` is allowed in this preparation implementation.
- `pg-backup-proof.py`: consistent `pg_dump -Fc`, restores into a uniquely named disposable database, compares every row and removes only that disposable database.
- `turso-intake.py`: read-only management-token validation and encrypted storage.

Verification files are on `supabase01` at `/srv/anistats-stage/import-verification.json` and `/srv/anistats-stage/backups/restore-verification.json`.
The source snapshot and credentials are Ansible-Vault encrypted under `root-infra/recovery/anistats/` with root-only permissions.
No credentials belong in this repository, a PR description, a build log or chat.

## Sync issues found and corrected in the candidate

The source snapshot contains a stuck `anilist_sync_running=1`; its checkpoint predates this migration by months.
A session-owned PostgreSQL advisory lock now controls admission; the legacy persisted flag cannot block all future runs after a crash.
Normal failures clear the status in `finally`, and process/session termination releases the actual lock automatically.
Discovery now sorts by update timestamp instead of ID, and an unchanged page does not prematurely skip older updated pages.
Rate-limit retries run outside the occupied request queue, with bounded delay and HTTP request timeouts.

These fixes are tested with injected failures, concurrent requests, unchanged pages, checkpoint failures and simulated HTTP 429 responses.
The bounded live test processed three entries into PostgreSQL successfully, without advancing the global checkpoint. Metadata/genres/tags/relations now commit together in one transaction and changed entries are counted correctly.
The private full catch-up uses batches of 50 complete records and recursively partitions start dates to stay below AniList's 5,000-entry page boundary. Unknown dates are included. The shared queue leaves headroom under the observed 30-requests/minute provider limit.
A persisted `anilist_full_sync_progress` cursor resumes an interrupted page; hashes make replay idempotent. Duplicate provider genres, tags and identical relation edges are normalized before the transaction, while distinct relation types are retained. Global genres and tags are refreshed as part of completion.
A dedicated lock heartbeat prevents the private database proxy from closing an idle lock session. The global checkpoint advances only after every partition completes. AniList periodically updates large blocks of records at the same timestamp; the daily cron therefore uses this batched date-partitioned pass rather than a per-record incremental tail that can hit the 5,000-entry boundary. Unchanged hashes skip database rewrites. The legacy incremental helper remains available for bounded regression checks, with timestamp overlap and boundary-tie replay.
Actual full-run, restart/resume, backup and cron acceptance evidence is retained under `root-infra/work/anistats-*` and in the central ITFlow AniStats document. Production Vercel/Turso remains unchanged.

## Jenkins and operational monitoring

The existing dedicated Jenkins agent runs job `AniStats-Preparation`. It pins the exact commit, builds through the existing Ansible controller, runs Linux backend/frontend/performance checks, and archives JUnit XML plus an immutable image ID/revision record.
The real GitHub status is `jenkins/anistats`, authenticated with a fine-grained token restricted to this repository. Failure to publish the status marks the build unstable.
The pipeline polls this preparation branch, retains 20 build records and has no deployment/migration/DNS step. Stage promotion is a separate explicit Ansible operation using the tested image ID/tag.

Grafana dashboard `anistats-stage` is in folder `pve01`: application and database readiness, requests/second, HTTP status classes, 5xx error ratio, p90/p95 latency, individual Docker CPU/RAM, database connections/size, backup/restore freshness and Jenkins results.
Metrics contain no user IDs, IP addresses, tokens, cookies or request URLs. Health probes and metrics scraping are excluded from HTTP request instrumentation. These are server request measurements, not browser visitor analytics.
Histogram samples carry process-generation and schema labels; quantile queries select a compatible bucket schema and show no latency value when there are no observations.
Collectors run every 30 seconds through existing node exporters; no parallel monitoring platform is introduced.
Native Grafana warnings use the existing Telegram contact point, persistence windows and 24-hour repeats. Missing collectors, service/database failures, failed/stale backups, stale restore/config backups and CI failures are monitored. Failure scenarios are tested offline without sending fake alerts.

## Daily AniList scheduler

`vercel.json` defines `GET /api/cron/anilist-sync` at `0 3 * * *`: **03:00 UTC**, not 03:00 local time. `anistats-sync.yml` preserves that schedule using native timer `anistats-stage-cron-sync.timer` with an explicit UTC calendar and persistent catch-up after downtime.
The endpoint now performs the resumable batched catalog pass. A duplicate invocation within five minutes can reuse a completed pass only after checking that AniList reports no newer update timestamp. This avoids redundant full work immediately after manual acceptance. The existing Vercel job is unchanged and targets the separate Turso source. The native stage job targets only `anistats_stage`; it does not create a second scheduler for the same database.
The root-only runner reads the independent bearer secret from the container environment, uses a single-process file lock to avoid overlapping native full/daily jobs and records attempts, success, running state and duration without secrets. Long requests use native Node HTTP without a short fetch header timeout.
The private full-run service is `anistats-stage-full-sync.service`. Only stage enables its guarded endpoint; disable `ANISTATS_ENABLE_SYNC_TEST` in production. Public reverse-proxy routing must deny `/api/internal/` and `/api/cron/` during production preparation.
Grafana separately shows the latest cron success and duration, plus full-run progress. Native alerts cover failed cron runs and success older than 30 hours, with persistence windows and 24-hour repeats. Background jobs and probes are excluded from interactive request latency.

## Recurring backups

- Daily 01:30 Europe/Berlin: controller copies an integrity-checked archive of encrypted Vault recovery inputs and public operation sources to `supabase01:/srv/anistats-stage/recovery/`.
- Daily 01:45 Europe/Berlin: consistent PostgreSQL custom-format dump; retain the latest 14 archive copies.
- Sunday 01:15 Europe/Berlin: create a dump, restore into a new disposable database and compare all eight tables, including Prisma migration metadata.
- Each dump and its expected data hashes use the same exported PostgreSQL read snapshot, so legitimate concurrent writes do not create false restore failures.
- Existing PBS job `pbs-daily-pve01` already includes VM130 (`supabase01`) and VM120 (`apps01`). Its 03:15 schedule is retained. Logical dumps and the encrypted recovery bundle reside inside the backed-up VM filesystem.
- A simulated dump failure in an isolated fixture retained the old archive and last-success timestamp. It did not modify live backup state.

The Ansible Vault decryption key is deliberately not included alongside encrypted recovery inputs; use the established infrastructure recovery access. No current secret values are stored in repository documentation or Jenkins artifacts.

## Accepted private data refresh (2026-11-22)

The native full refresh and the real authenticated daily cron both completed successfully, each checking **22,571 anime**. The daily pass took approximately 18 minutes under the observed provider limit. The raw Anime table also retains relation-target placeholders; its row count is intentionally larger than the provider catalog count.
Thirty deterministic samples match all stored business fields, genres, tags, relations and normalized source hashes against AniList. The duplicate-genre regression stores Fantasy exactly once for the affected provider record. The real container restart resumed the same durable cursor, and the sync lock/status cleared after completion.
A fresh post-cron custom-format dump was restored into an isolated disposable database and all eight tables matched. Native collectors are current, seven offline alert scenarios pass, and p90/p95 produce finite values from real HTTP smoke requests without Prometheus warnings. Dashboard panels use six aligned sections and fixed stat text sizes.
The tested running application is the immutable Jenkins 10 candidate from code revision `f4b991bec221bfdb7eebf662936cfb197330940d`; subsequent documentation-only commits do not require a runtime rollout.

## Production cutover gates

1. Private login, full data refresh, actual daily cron, restart/resume, complete sampled data comparison and post-catch-up restore acceptance passed. Keep their evidence with the release.
2. Jenkins, immutable artifacts, request/service/container metrics and recurring backup/restore checks are installed. Preserve their explicit stage/production separation during promotion.
3. Obtain explicit owner approval for production cutover.
4. Capture a fresh read-only Turso source archive and encrypted rollback configuration. This schema contains catalog/cache tables and sync state, not user accounts. Seed the separate production database/role from the verified caught-up PostgreSQL catalog; do not overwrite it with the older Turso checkpoint. Review any source changes before promotion.
5. Verify initial data, constraints, sequences and consistent backup/restore of the final production copy.
6. Prepare reverse proxy/TLS and blocked public cron routing; verify the existing AniList callback on the unchanged canonical hostname.
7. Coordinate the old Vercel scheduler with the new single scheduler. Never leave two active schedulers writing the same destination.
8. Change only the approved DNS/routing, test login, private analytics and sync, and verify monitoring/backups.
9. Roll back DNS to the captured Vercel target and fence the new scheduler if acceptance fails. Retain the untouched source Turso database and Vercel deployment.
10. Cancel Turso only after owner-approved retirement; account billing and database deletion are not part of preparation.

The backup restore test and Linux build are technical preparation evidence; they do not replace OAuth acceptance or authorize going live.
