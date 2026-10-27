# Optional Full Auto Mode

Status: ready-for-human
Blocked by: none

## Request

The user requested Full Auto with 15-second questions and 10-second intermissions. Announced interpretation: retain manual mode; the host selects the mode before the first round and cues once; final gacha also runs automatically.

## Acceptance Criteria

- [x] Persist mode; default old/new games to existing manual behavior.
- [x] Host-only selection before first start; stale actions cannot alter subsequent rounds.
- [x] Full 15-second answer window, including when all 20 non-author answers arrive.
- [x] Published results, winner, private giver-only gifts, and 10-second intermission countdown.
- [x] Start the next round without host presence; do not skip unseen rounds after delayed reconnect.
- [x] After round 21's intermission, atomic/idempotent gacha and personal final results.
- [x] Preserve author exclusion, previous-winner eligibility, popup/confetti behavior, and manual controls.
- [x] Full test suite (36/36), both browser suites, typecheck, formatting, CLI migration verification, migration-history check, and production build.

## Implementation

Shared server helpers create rounds and distribute gifts under the existing event lock. Automatic intermission derives from persisted `revealedAt`; each actual new round starts with a fresh database-timed deadline. The additive `0002_full_auto_mode.sql` adds only `auto_mode boolean not null default false`. No production migration, seed, reset, deployment, or commit is performed.

## Verification Notes

Six HTTP/SQL tests cover mode ownership/persistence, full-duration all-answer handling, concurrent reconciliation, stale requests, delayed reconnect, 21-round automatic completion, and gacha-integrity rollback. Full Auto browser tests use a separate disposable event from the manual browser suite; neither has a reset endpoint. PGlite serializes its connection; real independent-process PostgreSQL locking and Supabase latency remain external verification gaps.
