# 07 - Player Popup and Confetti

Category: enhancement

Status: ready-for-human

Blocked by: 05 (implemented locally)

## Request

Player needs confetti and a popup when answering correctly and/or receiving a gift.

## Acceptance Criteria

- [x] Correct-only, gift-only, and combined outcomes get the appropriate player popup.
- [x] No correct-answer popup before published results; hosts receive no celebration.
- [x] Gift messages show only the giver, including gifts from final gacha.
- [x] Polling and refresh in the same tab do not replay acknowledged events when session storage is available.
- [x] Popup supports focus trapping, button/Escape dismissal, and automatic dismissal on the next active round.
- [x] Confetti is brief and removed; reduced motion keeps the popup but suppresses confetti.
- [x] Mobile layout remains usable; no dependency, database migration, or production write is required.

## Verification Plan

Existing browser seam: published correctness after host disconnection, combined celebration, refresh deduplication, already-awarded correct responder, normal/reduced motion, Escape, polling deduplication, automatic next-round dismissal, and a gacha-only gift recipient. Preserve HTTP regression tests and production build.

## Limitations

Per-tab event deduplication is best effort if browser storage is disabled. A new tab can celebrate current results again. The player celebrates authoritative results they receive through existing polling; missed historical rounds are not replayed as a notification feed. No sounds or change to gift eligibility.

## Verification

The browser celebration test failed before implementation, then passed. All 30 HTTP/SQL tests, 3 browser tests, typecheck, format check, and production build passed. Mobile popup and confetti screenshots were visually inspected. The temporary test server was shut down; no production data was modified.
