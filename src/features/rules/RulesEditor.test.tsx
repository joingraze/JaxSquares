// The rules & prizes editor as a host uses it: a one-tap square price, the
// board's total, "Split the $1,000", and the every-score setups (the reverse
// at each quarter, amounts by score type), on the editor and the create page's
// Every score card.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultFormat, rulesForPreset, withRules } from "../../../shared/formats";
import type { GameFormat } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => ({ ...(await orig<typeof import("../../lib/native")>()), haptic: vi.fn(async () => {}) }));

const { RulesEditor } = await import("./RulesEditor");
const { FormatPicker } = await import("../create/FormatPicker");
const { byKindOn, reverseQuartersOn } = await import("./rulesModel");
type Draft = import("./rulesModel").RulesDraft;

function Editor({ initial, seen }: { initial: Draft; seen: { draft: Draft } }) {
  const [draft, setDraft] = useState(initial);
  seen.draft = draft;
  return <RulesEditor draft={draft} onChange={setDraft} boardSize={100} />;
}

const quarters = (): Draft => ({ rules: rulesForPreset("quarters", false), choice: "$", squarePrice: null, freshNumbers: false });
const amountsOf = (d: Draft) => d.rules.map((r) => r.square?.amount ?? r.reverse?.amount ?? null);

describe("RulesEditor: square price and split", () => {
  it("sets the price in one tap, shows the board's total, and splits it into the prizes", () => {
    const seen = { draft: quarters() };
    render(<Editor initial={quarters()} seen={seen} />);
    expect(screen.queryByTestId("board-total")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "$10" }));
    expect(seen.draft.squarePrice).toBe(10);
    expect(screen.getByTestId("board-total")).toHaveTextContent("$1,000");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("None yet");

    fireEvent.click(screen.getByRole("button", { name: /^Bigger final/ }));
    expect(amountsOf(seen.draft)).toEqual([200, 200, 200, 400]);
    expect(screen.getByRole("button", { name: /^Bigger final/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("$1,000 of $1,000");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("Adds up");

    // Still editable after: Q1 goes up, so the board is over and no split reads as picked.
    const q1 = screen.getAllByTestId("rule-amount").find((el) => el.getAttribute("data-moment") === "q1")!;
    expect(q1).toHaveValue("200");
    fireEvent.change(q1, { target: { value: "400" } });
    expect(amountsOf(seen.draft)).toEqual([400, 200, 200, 400]);
    expect(screen.getByTestId("prize-budget")).toHaveAttribute("data-status", "over");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("$200 over");
    for (const b of screen.getAllByTestId("prize-split")) expect(b).toHaveAttribute("aria-pressed", "false");

    // The picked price clears on a second tap.
    fireEvent.click(screen.getByRole("button", { name: "$10" }));
    expect(seen.draft.squarePrice).toBeNull();
  });

  it("offers point values on a points board", () => {
    render(<Editor initial={{ ...quarters(), choice: "pts" }} seen={{ draft: quarters() }} />);
    const chips = screen.getAllByTestId("price-chip").map((b) => b.textContent);
    expect(chips[0]).toBe("1");
    expect(chips).not.toContain("$1");
  });

  it("keeps every amount input at 16px or more (iOS never zooms)", () => {
    render(<Editor initial={{ ...quarters(), squarePrice: 10 }} seen={{ draft: quarters() }} />);
    for (const input of document.querySelectorAll("input")) expect(input.className).toMatch(/\btext-body\b/);
  });
});

describe("RulesEditor: every score change", () => {
  const every = (choice: Draft["choice"] = "$"): Draft => ({ rules: rulesForPreset("every-score", false), choice, squarePrice: null, freshNumbers: false });

  it("turns on the reverse at each quarter and amounts by score type right in its row", () => {
    const seen = { draft: every() };
    render(<Editor initial={every()} seen={seen} />);
    const row = screen.getAllByTestId("rule-row").find((el) => el.getAttribute("data-moment") === "score")!;
    fireEvent.click(within(row).getByTestId("every-score-reverse"));
    expect(reverseQuartersOn(seen.draft.rules)).toBe(true);
    expect(seen.draft.rules.map((r) => [r.moment, !!r.square, !!r.reverse])).toEqual([
      ["score", true, false],
      ["q1", false, true],
      ["q2", false, true],
      ["q3", false, true],
      ["final", false, true],
    ]);

    fireEvent.click(within(row).getByTestId("every-score-by-kind"));
    const field = (kind: string) => within(row).getAllByTestId("score-kind-amount").find((el) => el.getAttribute("data-kind") === kind)!;
    fireEvent.change(field("touchdown"), { target: { value: "50" } });
    fireEvent.change(field("conversion"), { target: { value: "10" } });
    expect(seen.draft.rules[0].square?.byKind).toEqual({ touchdown: 50, conversion: 10 });
    // The one amount moves into the grid as "Other scores".
    fireEvent.change(within(row).getByTestId("score-kind-other"), { target: { value: "30" } });
    expect(seen.draft.rules[0].square?.amount).toBe(30);
    expect(field("fieldGoal")).toHaveAttribute("placeholder", "30");
  });

  it("picks dollars when amounts by score type go on before a unit was chosen", () => {
    const seen = { draft: every(null) };
    render(<Editor initial={every(null)} seen={seen} />);
    fireEvent.click(screen.getByTestId("every-score-by-kind"));
    expect(seen.draft.choice).toBe("$");
    expect(byKindOn(seen.draft.rules)).toBe(true);
    expect(screen.getAllByTestId("score-kind-amount")).toHaveLength(4);
  });

  it("has no amounts by score type on a just-for-fun board", () => {
    render(<Editor initial={every("fun")} seen={{ draft: every("fun") }} />);
    expect(screen.getByTestId("every-score-reverse")).toBeTruthy();
    expect(screen.queryByTestId("every-score-by-kind")).toBeNull();
  });
});

describe("FormatPicker: the Every score card's setups", () => {
  function Picker({ seen }: { seen: { format: GameFormat; choice: Draft["choice"] } }) {
    const [format, setFormat] = useState(() => withRules(defaultFormat()));
    const [choice, setChoice] = useState<Draft["choice"]>(null);
    seen.format = format;
    seen.choice = choice;
    return <FormatPicker format={format} onChange={setFormat} prizeChoice={choice} onPrizeChoice={setChoice} />;
  }

  it("offers them right under the cards, and stays on Every score with the reverse at each quarter", () => {
    const seen = { format: withRules(defaultFormat()), choice: null as Draft["choice"] };
    render(<Picker seen={seen} />);
    expect(screen.queryByTestId("every-score-options")).toBeNull();
    const card = () => screen.getAllByTestId("format-option").find((el) => el.getAttribute("data-format") === "every-score")!;
    fireEvent.click(card());
    expect(screen.getByTestId("every-score-options")).toBeTruthy();

    fireEvent.click(screen.getByTestId("every-score-reverse"));
    expect(reverseQuartersOn(seen.format.rules!)).toBe(true);
    expect(card()).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("format-custom")).toBeNull();
    // Tapping the picked card again keeps the setup.
    fireEvent.click(card());
    expect(reverseQuartersOn(seen.format.rules!)).toBe(true);

    // Amounts by score type pick dollars; the owner's example in a few taps.
    fireEvent.click(screen.getByTestId("every-score-by-kind"));
    expect(seen.choice).toBe("$");
    const field = (kind: string) => screen.getAllByTestId("score-kind-amount").find((el) => el.getAttribute("data-kind") === kind)!;
    fireEvent.change(field("touchdown"), { target: { value: "50" } });
    fireEvent.change(field("conversion"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("every-score-reverse-amount"), { target: { value: "200" } });
    expect(seen.format.rules?.map((r) => (r.moment === "score" ? r.square?.byKind : r.reverse?.amount))).toEqual([
      { touchdown: 50, conversion: 10 },
      200,
      200,
      200,
      200,
    ]);
  });
});
