# AniStats self-hosting

Production stays on Vercel/Turso until migration acceptance and the owner's explicit cutover approval.
Preparation branch: `codex/anistats-self-hosting`. Reference: [migration runbook](SELF-HOSTING.md).

## Tasks

- [x] Prepare isolated PostgreSQL migration and private self-hosted candidate (PR #115, draft; not merged).
  - [x] Inspect the actual Vercel production commit, domains and encrypted environment.
  - [x] Export Turso with a read-only transaction; verify a full SQLite restore and encrypted archive round trip.
  - [x] Import seven tables into a separate Supabase PostgreSQL database and compare every transformed value.
  - [x] Create a consistent PostgreSQL dump and prove restoration into an empty disposable database.
  - [x] Adapt Prisma, private runtime, guarded cron authentication and process-owned sync exclusion.
  - [x] Fix incremental update sorting, premature pagination termination and rate-limit retry queue deadlock.
  - [x] Complete final Linux candidate checks after the sync fixes and private HTTP smoke tests.
- [x] Prepare Jenkins, operational monitoring, consistent recurring backups and bounded AniList acceptance (PR #115).
  - [x] Real Jenkins Linux build, JUnit/release artifacts and repository-scoped GitHub commit status.
  - [x] Private application/database/container/request metrics and tested native Grafana alerts.
  - [x] Daily consistent PostgreSQL dumps, weekly full restore proof and encrypted recovery configuration copies.
  - [x] Owner confirmed separate AniList test login, dashboard, history and recommendations.
  - [x] Bounded live sync processed three entries without advancing the global checkpoint.
  - [x] Process generation/schema isolation prevents mixing histogram versions across restarts.
- [ ] Cut over `anistats.kluge-it.tech` only after explicit owner approval and fresh data copy; retain Vercel and Turso rollback.
- [ ] Retire Turso only after a stable production observation period and verified recovery copy, with explicit owner approval.
