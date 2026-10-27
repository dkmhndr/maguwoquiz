# 03 - Finish and Gacha

What to build: The host completes 21 rounds, inspects the gift ledger, and performs a persistent idempotent final gacha.

Blocked by: 02

Status: ready-for-agent

- [ ] Advance only after reveal, until all 21 questions are played.
- [ ] Verify remaining gift/participant counts and block integrity failures.
- [ ] Persist gacha atomically and complete only with exactly 21 unique assignments.
- [ ] Test no-winner rounds, duplicate gacha, and count mismatch.
