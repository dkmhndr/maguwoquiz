# 09 - Final Ranking

Category: enhancement

Status: ready-for-human

Blocked by: none

## Request

Replace the question-specific "who knows me best" result with a ranking of participants by total correct answers at the end of the game.

## Decisions

- Show the same ranking to hosts and participants only after game completion.
- Count all correct accepted answers, including those from previous gift winners. Authors remain unable to answer their own question.
- Include all 21 participants, including zero scores. Equal scores share competition ranks (1, 1, 3); stable participant IDs determine display order only.
- Highlight the authenticated participant without changing the ranking. Ranking does not affect gift allocation or gacha.
- Derive scores from persisted submissions, with no migration or seed changes.

## Verification

HTTP/SQL coverage includes all rounds, correct and incorrect submissions, previous winners, ties, zero scores, host and participant visibility, refresh, and Full Auto completion. Browser coverage checks the new ranking on mobile, old personal result removal, and reload. Existing gift privacy and celebration coverage remains in place.
