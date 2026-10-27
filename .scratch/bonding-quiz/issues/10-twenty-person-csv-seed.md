# 10 - Twenty-Person CSV Seed

Category: enhancement

Status: ready-for-human

Blocked by: none

## Request

Replace placeholder questions with the provided CSV and change the event from 21 to 20 people, questions, rounds, and gifts. Gift contents remain unknown.

## Implementation

- Preserve the 20 CSV rows, names, question text, option order and correct keys. Stable seed IDs follow CSV order; gift metadata is generic and remains hidden.
- Update game, invitations, display, validation and completion limits to 20; each question has 19 eligible answerers because its author cannot answer.
- Add `0003_twenty_participants.sql` for updated database constraints. The migration does not reset data. It rejects incompatible initialized 21-round events; the seeder refuses to overwrite differing existing content.
- Do not run migration, reset, seed, or invitation generation against the user's database without authorization.

## Verification

- Independently compared all seed values and keys with the CSV.
- SQL/HTTP game tests cover 20 participants, 19 answers, manual and automatic completion, ranking, gifts, authorization and privacy. Browser suites cover both modes.
- Tested repeated migrations and seed against disposable PGlite; verified a 21-round game rejects migration transactionally without losing its data or constraints.
- Supabase migrations, independent PostgreSQL concurrency and deployment remain operator-side checks.
