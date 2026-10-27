# 06 - Who Knows You Best

Category: enhancement

Status: ready-for-human

Blocked by: 05 (implemented locally)

## Request

Show "Siapa yang paling kenal kamu?" in each participant's final point of view.

## Definition

Each participant has one authored question. Use all correct accepted answers to that question, sorted by database receipt time and then submission sequence. Highlight the first friend, show response time, and let the participant inspect other correct friends. Previous gift winners still count. Recognition does not grant gifts or change any eligibility/gacha rule.

## Acceptance Criteria

- [x] Personal results appear only after `game_complete`, never during active rounds or final gacha.
- [x] Each participant sees only their own personal result; URL-supplied identity is ignored and the host has no personal result.
- [x] Correct responders are ordered by timestamp/sequence; authors, incorrect answers, and nonresponses cannot be highlighted.
- [x] Previously awarded participants remain eligible for recognition.
- [x] Wrong-only/no-response results explain the outcome without making up a friend.
- [x] Refresh/reconnect retains the same results without migration/reseed.
- [x] Mobile final screens fit the viewport; gift contents stay private.

## Testing

Existing public HTTP/database and browser seams. A complete 21-participant HTTP game verifies all personal results, identity scoping, empty cases, gift-eligibility independence, deterministic ordering, and reconnect. The browser finishes a host-cued event and checks distinct participant viewpoints, the expandable friend list, mobile layout, and reload.

## Scope

No host-wide leaderboard, extra questions, friendship scoring, new gift assignment, automatic next-round start, database reset, or production writes.

## Verification

Implemented locally. 30 tests in 9 files, 3 browser tests, typecheck, formatting, and production build passed. Final 320px/390px screenshots were inspected. The temporary browser server was stopped by the test runner; no Supabase data was changed.
