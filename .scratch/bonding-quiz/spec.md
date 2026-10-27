# Private Bonding Quiz v1

Status: ready-for-agent

## Problem Statement

Twenty friends need a private phone-based quiz that distributes their twenty gifts fairly without double winners, leaked answers, or timing decisions made by browsers.

## Solution

A separately authenticated host runs twenty persisted, shuffled rounds. Invitation holders answer from their own devices. The first eligible correct server-received answer wins the author's gift. Remaining participants receive remaining gifts through an atomic final gacha.

## User Stories

1. As a participant, I want a private invitation so that I join as my seeded identity.
2. As a participant, I want my identity to survive refresh so that I can rejoin a round.
3. As a participant, I want to know my connection status so that I can recover from an interruption.
4. As a participant, I want to see the lobby and participants so that I know who is playing.
5. As a participant, I want four large answer options so that I can play on my phone.
6. As a participant, I want one immutable submission so that answers cannot be changed retrospectively.
7. As a participant, I want a server deadline so that device clocks cannot influence eligibility.
8. As an author, I want to be excluded from my own question so that the game is fair.
9. As a previous winner, I want to keep answering without winning again so that I can keep playing.
10. As a participant, I want answers hidden during the active round and automatically shown when it ends so that I cannot inspect the key while answering.
11. As a participant, I want clear submitted, correct, incorrect, winner, and no-winner states.
12. As a participant, I want my gift assignment to persist and identify only the giver so that reconnecting cannot lose it and gift contents remain a surprise.
13. As a host, I want separate authentication so that invitation holders cannot control the game.
14. As a host, I want to initialize once so that question order cannot be reshuffled mid-game.
15. As a host, I want to cue each round's start, optionally close early, and advance with safe repeated actions, without needing to reveal results manually.
16. As a host, I want submission progress and answer logs after reveal.
17. As a host, I want deadline closure to recover even when my browser disconnects.
18. As a host, I want a persistent gift ledger so that every assignment is auditable.
19. As a host, I want atomic, idempotent final gacha so that everyone receives exactly one gift.
20. As an operator, I want migrations and seeds to run from commands without dashboard table creation.
21. As an operator, I want seeds safe to rerun without changing active results.
22. As an operator, I want an invitation export stored privately, with a documented bearer-link limitation.
23. As an operator, I want documented setup, deployment, and automated multiplayer tests.
24. As a participant, I want accessible colors, reduced motion, and a mobile-first layout.
25. As a participant, I want an end-of-game ranking showing who answered the most questions correctly, independent of gift eligibility.
26. As a participant, I want a popup and confetti when my revealed answer is correct and/or I receive a gift, without leaking answers, gift contents, or blocking the next round.
27. As a host, I want an optional Full Auto mode: cue once, then 15-second questions and 10-second result intermissions until automatic final gacha and ranking.

## Implementation Decisions

- Empty repository: Next.js App Router, TypeScript, npm, CSS, Drizzle, Supabase PostgreSQL.
- Exactly one private event, with 20 participants, 20 questions, 20 gifts, stable seed IDs and a fifteen-second fixed default deadline. The supplied CSV provides the names, questions, answer choices and keys; gift contents are unknown.
- All mutations and authoritative reads go through server endpoints. No direct browser database access; enable RLS and revoke public roles as defense in depth, without Realtime publication.
- Poll authoritative state every second while active or in an automatic intermission and every two seconds otherwise; requests reconcile expired phases on the server, independently of the host browser. Optional protected scheduled reconciliation.
- Serialize mutations on the game row in PostgreSQL transactions. Use database time and a monotonic database submission ID to resolve timestamp ties.
- Closure stops acceptance and atomically computes winner/allocation and publishes correctness/results. In default manual mode it occurs on deadline, all nineteen non-author submissions, or early host closure. The host advances and cues each next round. No key is included during the active round.
- Optional Full Auto is selected by the host before the first round and persisted through a default-false additive database column. The host still cues the initial start. Each question stays open for a full 15 seconds, then published results remain for at least 10 seconds before the next question starts automatically. After round 20's intermission, the same transactional, integrity-checked gacha completes the event automatically. No early-close/advance controls or mid-game mode changes in Full Auto. Reconciliation uses database time and the shared game lock; delayed reconnect never skips unseen rounds or shortens their answer windows. Polling latency can extend a phase.
- Legacy closed-but-unrevealed rounds publish their existing results on reconciliation, without recomputing awards. Keep the existing database columns and constraints; no migration or reseed is required.
- Gift assignments sent to any browser contain giver/recipient identities and source only (plus an opaque gift ID), never gift names or descriptions. Round results and final-gacha ledgers do not reveal gift contents, including on the host screen.
- After game completion, show the host and all participants the same ranking of all 20 players by number of correct answers, including previous gift winners and zero scores. Equal scores share the same competition rank (1, 1, 3), and stable participant IDs only determine display order within ties. Highlight the current participant on their own screen. The former question-specific personal result is removed. Ranking is derived from persisted answers and does not affect gifts.
- Player-only celebrations use published correctness and confirmed personal gift assignments, including gacha. Combine simultaneous events; deduplicate by participant and round/gift within a browser tab, with best-effort reload persistence. Provide keyboard-accessible dismissal, clear the modal on the next active round, honor reduced motion, and stop confetti after a brief burst. No early correctness disclosure, gift-content reveal, host celebration, sound, or external animation dependency.
- Random invitation/session tokens are stored as hashes. Host passwords are scrypt hashes. HttpOnly, same-site sessions are server validated and expire.
- Invitations use URL fragments to avoid sending tokens in request paths or referrers; exchange removes the fragment before any network request. A private server command exports links once; later reruns require explicit rotation.
- One gift allocation per gift and one recipient per game, with composite foreign keys linking submissions to their actual round/question/options.
- No self-gift exclusion during final gacha because the PRD does not require it.
- One editable seed source contains the user's 20 participants, questions, four options and answer keys, plus generic secret-gift placeholders. A migration changes the event constraints from 21 to 20 and never resets existing data; incompatible existing events must be preserved or handled explicitly.

## Testing Decisions

Approved seams: seed validation; server HTTP endpoints backed by a test PostgreSQL database; browser refresh/reconnect and mobile UI. Test observable behavior, not internal collaborator calls. Use embedded PostgreSQL (PGlite) for isolated integration tests and offer the same harness against a dedicated real PostgreSQL test database. Include a 20-device simulated game, concurrent submissions, authorization, deadlines, ordering, duplicate allocations, and final gacha.

## Out of Scope

Registration, content editing, multi-event administration, public leaderboards, Supabase client access, sounds, and live deployment without supplied credentials.

## Further Notes

Original source: the user-supplied PRD v1 attachment, amended on 2026-10-13 by the user's private-gift and semi-automatic-result requests. The user confirmed that round starts remain on the host's cue. Bearer invitations may be used by anyone holding the link; the app cannot prove physical identity. Polling reconciles on the next trusted request; with no clients or scheduler connected, closure and publication are persisted on reconnection, while late answers are always rejected.
