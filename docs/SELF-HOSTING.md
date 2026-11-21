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

Then visit `http://localhost:13300`. Staging OAuth is deliberately disabled; it must not redirect users through production while testing a copied database.
Full OAuth acceptance needs an independent AniList test application/callback, or an explicitly coordinated test of the real hostname routed privately. Do not change the live OAuth application's callback merely to test staging.

## Runtime and builds

`Dockerfile` builds Nitro using the `node-server` preset. The final image contains only `.output`, runs as the unprivileged `node` user and has a database-backed health check.
`--target verify` additionally runs backend, frontend and synthetic performance tests on Linux.
No production secrets enter a build. Runtime variables are in a root-readable env file installed by Ansible with `no_log`.

Required production runtime values:

- `DATABASE_URL`: the new PostgreSQL database URL, never the Turso URL.
- `NUXT_PUBLIC_SITE_URL`: canonical public URL.
- `NUXT_ANILIST_CLIENT_ID`, `NUXT_ANILIST_CLIENT_SECRET`, `NUXT_ANILIST_REDIRECT_URI`: runtime Nitro configuration.
- `CRON_SECRET`: independent random bearer secret. Missing configuration now refuses sync requests.
- `ANISTATS_AUTH_DISABLED=true` in isolated staging only; remove for accepted production.

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
No full catalog refresh has been started against either production or staging. The initial catch-up must be budgeted and observed against AniList's rate limits before production acceptance.

## Remaining acceptance and cutover gates

1. Finish isolated candidate acceptance: real AniList OAuth, authenticated analytics screens and an observed sync, including recovery from interruption.
2. Connect a scoped Jenkins status credential for this repository, immutable release artifacts, service metrics, recurring logical backups and backup freshness checks. These are not yet claimed as complete.
3. Obtain explicit owner approval for production cutover.
4. Capture a fresh read-only source snapshot and encrypted rollback configuration. Prepare a separate production database/role; do not silently promote the stale test copy.
5. Verify initial data, constraints, sequences and consistent backup/restore of the final production copy.
6. Prepare reverse proxy/TLS and blocked public cron routing; verify the existing AniList callback on the unchanged canonical hostname.
7. Coordinate the old Vercel scheduler with the new single scheduler. Never leave two active schedulers writing the same destination.
8. Change only the approved DNS/routing, test login, private analytics and sync, and verify monitoring/backups.
9. Roll back DNS to the captured Vercel target and fence the new scheduler if acceptance fails. Retain the untouched source Turso database and Vercel deployment.
10. Cancel Turso only after owner-approved retirement; account billing and database deletion are not part of preparation.

The backup restore test and Linux build are technical preparation evidence; they do not replace OAuth acceptance or authorize going live.
