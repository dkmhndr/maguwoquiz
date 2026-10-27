import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Ranking } from "../src/components/ranking";

const ranking = Array.from({ length: 5 }, (_, index) => ({
  participantId: `p${index + 1}`,
  participantName: `Player ${index + 1}`,
  correctCount: 5 - index,
  rank: index + 1,
}));

describe("ranking display", () => {
  it("shows only the top three and the current player's position outside the top three", () => {
    const html = renderToStaticMarkup(createElement(Ranking, { ranking, myId: "p5" }));
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).not.toContain("Player 4");
    expect(html).toContain("Peringkat 5");
    expect(html).toContain("1 jawaban benar");
  });

  it("shows the player's position even when they are in the top three", () => {
    const html = renderToStaticMarkup(createElement(Ranking, { ranking, myId: "p2" }));
    expect(html).toContain("Player 2");
    expect(html).toContain("Posisimu");
    expect(html).toContain("Peringkat 2");
  });

  it("does not show a personal position for the host", () => {
    const html = renderToStaticMarkup(createElement(Ranking, { ranking }));
    expect(html).not.toContain("Posisimu");
  });
});
