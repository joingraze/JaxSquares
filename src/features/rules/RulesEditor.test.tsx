// The rules & prizes editor as a host uses it: a one-tap square price, the
// board's total, "Use suggested amounts" (and "Even"), the final's "The rest"
// or a fixed amount, and the every-score setups (the reverse at each quarter,
// amounts by score type that follow the touchdown), on the editor and the
// create page's Every score card.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultFormat, ruleFor, rulesForPreset, withRules } from "../../../shared/formats";
import type { GameFormat } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => ({ ...(await orig<typeof import("../../lib/native")>()), haptic: vi.fn(async () => {}) }));

const { RulesEditor } = await import("./RulesEditor");
const { FormatPicker } = await import("../create/FormatPicker");
const { byKindOn, reverseQuartersOn, selectPreset } = await import("./rulesModel");
type Draft = import("./rulesModel").RulesDraft;

function Editor({ initial, seen, squares }: { initial: Draft; seen: { draft: Draft }; squares?: number }) {
  const [draft, setDraft] = useState(initial);
  seen.draft = draft;
  return <RulesEditor draft={draft} onChange={setDraft} boardSize={100} squares={squares} />;
}

const quarters = (): Draft => ({ rules: rulesForPreset("quarters", false), choice: "$", squarePrice: null, freshNumbers: false });
const amountsOf = (d: Draft) => d.rules.map((r) => r.square?.amount ?? r.reverse?.amount ?? null);
const suggest = () => screen.getByTestId("prizes-suggest");

describe("RulesEditor: square price and suggested amounts", () => {
  it("sets the price in one tap, shows the board's total, and fills in the suggested amounts", () => {
    const seen = { draft: quarters() };
    render(<Editor initial={quarters()} seen={seen} />);
    expect(screen.queryByTestId("board-total")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "$10" }));
    expect(seen.draft.squarePrice).toBe(10);
    expect(screen.getByTestId("board-total")).toHaveTextContent("$1,000");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("None yet");
    expect(screen.getByTestId("prizes-basis")).toHaveTextContent("From the $1,000 board total");

    // The editor never fills amounts in by itself: the host taps the suggestion.
    expect(amountsOf(seen.draft)).toEqual([null, null, null, null]);
    fireEvent.click(screen.getByRole("button", { name: /^Use suggested amounts/ }));
    expect(amountsOf(seen.draft)).toEqual([200, 200, 200, 400]);
    expect(suggest()).toHaveAttribute("aria-pressed", "true");
    expect(suggest()).toHaveTextContent("In use");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("$1,000 of $1,000");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("Adds up");

    // Still editable after: Q1 goes up, so the board is over and the suggestion isn't in use.
    const q1 = screen.getAllByTestId("rule-amount").find((el) => el.getAttribute("data-moment") === "q1")!;
    expect(q1).toHaveValue("200");
    fireEvent.change(q1, { target: { value: "400" } });
    expect(amountsOf(seen.draft)).toEqual([400, 200, 200, 400]);
    expect(screen.getByTestId("prize-budget")).toHaveAttribute("data-status", "over");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("$200 over");
    expect(suggest()).toHaveAttribute("aria-pressed", "false");
    expect(suggest()).toHaveTextContent("Use suggested amounts");

    // Even is the alternative; the suggestion puts them back.
    fireEvent.click(screen.getByTestId("prize-split"));
    expect(amountsOf(seen.draft)).toEqual([250, 250, 250, 250]);
    fireEvent.click(suggest());
    expect(amountsOf(seen.draft)).toEqual([200, 200, 200, 400]);

    // The picked price clears on a second tap.
    fireEvent.click(screen.getByRole("button", { name: "$10" }));
    expect(seen.draft.squarePrice).toBeNull();
  });

  it("uses the claimed squares' total once the numbers are drawn (the host's editor)", () => {
    render(<Editor initial={{ ...quarters(), squarePrice: 10 }} seen={{ draft: quarters() }} squares={62} />);
    expect(screen.getByText("62 claimed squares")).toBeTruthy();
    expect(screen.getByTestId("board-total")).toHaveTextContent("$620");
    expect(screen.getByTestId("prizes-basis")).toHaveTextContent("From the $620 board total");
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

describe("RulesEditor: the final takes the rest or a fixed amount", () => {
  const card = (squarePrice: number | null = 10): Draft => ({
    rules: selectPreset(rulesForPreset("quarters", false), "every-score"),
    choice: "$",
    squarePrice,
    freshNumbers: false,
  });

  it("switches between the two, only with a square price", () => {
    const seen = { draft: card() };
    render(<Editor initial={card()} seen={seen} />);
    const final = () => screen.getAllByTestId("rule-row").find((el) => el.getAttribute("data-moment") === "final")!;
    expect(within(final()).getByTestId("final-rest")).toBeTruthy();
    fireEvent.click(within(final()).getByTestId("final-rest-on"));
    expect(ruleFor(seen.draft.rules, "final")?.square).toEqual({ amount: null, note: "", rest: true });
    expect(within(final()).getByTestId("final-rest-field")).toHaveTextContent("The rest");
    expect(within(final()).queryByTestId("rule-amount")).toBeNull();
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("Score prizes come out of the $1,000 board total during the game; the final gets the rest.");

    fireEvent.click(within(final()).getByTestId("final-rest-off"));
    expect(ruleFor(seen.draft.rules, "final")?.square?.rest).toBeUndefined();
    expect(within(final()).getByTestId("rule-amount")).toBeTruthy();

    // No price: no total to take the rest of, so no choice (and the rest goes).
    fireEvent.click(within(final()).getByTestId("final-rest-on"));
    fireEvent.click(screen.getByRole("button", { name: "$10" }));
    expect(seen.draft.squarePrice).toBeNull();
    expect(within(final()).queryByTestId("final-rest")).toBeNull();
    expect(ruleFor(seen.draft.rules, "final")?.square?.rest).toBeUndefined();
  });
});

describe("RulesEditor: every score change", () => {
  const every = (choice: Draft["choice"] = "$"): Draft => ({ rules: rulesForPreset("every-score", false), choice, squarePrice: null, freshNumbers: false });
  const field = (scope: HTMLElement, kind: string) => within(scope).getAllByTestId("score-kind-amount").find((el) => el.getAttribute("data-kind") === kind)!;

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
    expect(within(row).getAllByTestId("score-kind-amount").map((el) => el.getAttribute("data-kind"))).toEqual(["touchdown", "fieldGoal", "extraPoint", "twoPoint", "safety"]);
    // No "Other scores": every score has a kind.
    expect(within(row).queryByTestId("score-kind-other")).toBeNull();
    expect(row).not.toHaveTextContent(/Other scores|both teams/i);

    // The touchdown leads: the others follow as clean multiples ($100: $50, $50, $25...).
    fireEvent.change(field(row, "touchdown"), { target: { value: "100" } });
    expect(seen.draft.rules[0].square?.byKind).toEqual({ touchdown: 100, fieldGoal: 50, extraPoint: 25, twoPoint: 50, safety: 50 });
    expect(field(row, "extraPoint")).toHaveValue("25");
    // One set by hand stops following.
    fireEvent.change(field(row, "extraPoint"), { target: { value: "10" } });
    fireEvent.change(field(row, "touchdown"), { target: { value: "" } });
    fireEvent.change(field(row, "touchdown"), { target: { value: "4" } });
    fireEvent.change(field(row, "touchdown"), { target: { value: "40" } });
    expect(seen.draft.rules[0].square?.byKind).toEqual({ touchdown: 40, fieldGoal: 20, extraPoint: 10, twoPoint: 20, safety: 20 });
    expect(row).toHaveTextContent("Amounts you haven't changed follow the touchdown.");
  });

  it("picks dollars when amounts by score type go on before a unit was chosen", () => {
    const seen = { draft: every(null) };
    render(<Editor initial={every(null)} seen={seen} />);
    fireEvent.click(screen.getByTestId("every-score-by-kind"));
    expect(seen.draft.choice).toBe("$");
    expect(byKindOn(seen.draft.rules)).toBe(true);
    expect(screen.getAllByTestId("score-kind-amount")).toHaveLength(5);
  });

  it("has no amounts by score type on a just-for-fun board", () => {
    render(<Editor initial={every("fun")} seen={{ draft: every("fun") }} />);
    expect(screen.getByTestId("every-score-reverse")).toBeTruthy();
    expect(screen.queryByTestId("every-score-by-kind")).toBeNull();
  });

  it("suggests amounts by score type and says what a typical game uses", () => {
    const initial: Draft = { rules: selectPreset(rulesForPreset("quarters", false), "every-score"), choice: "$", squarePrice: 10, freshNumbers: false };
    const seen = { draft: initial };
    render(<Editor initial={initial} seen={seen} />);
    // The Every score card starts with amounts by score type on.
    expect(screen.getByTestId("every-score-by-kind")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /^Use suggested amounts/ }));
    expect(seen.draft.rules[0].square?.byKind).toEqual({ touchdown: 20, fieldGoal: 10, extraPoint: 5, twoPoint: 10, safety: 10 });
    expect(ruleFor(seen.draft.rules, "final")?.square?.rest).toBe(true);
    expect(screen.getByTestId("prize-estimate")).toHaveTextContent("A typical game uses about $270, leaving about $730 for the final.");
    expect(screen.queryByTestId("prize-warning")).toBeNull();
  });

  it("warns when a typical game would use most of the board total", () => {
    const initial: Draft = { rules: selectPreset(rulesForPreset("quarters", false), "every-score"), choice: "$", squarePrice: 1, freshNumbers: false };
    render(<Editor initial={initial} seen={{ draft: initial }} squares={25} />);
    fireEvent.click(screen.getByRole("button", { name: /^Use suggested amounts/ }));
    expect(screen.getByTestId("prize-warning")).toHaveTextContent("A typical game would use about $27 of the $25 board total, leaving little for the final.");
  });
});

describe("FormatPicker: the Every score card's setups", () => {
  function Picker({ seen }: { seen: { format: GameFormat; choice: Draft["choice"] } }) {
    const [format, setFormat] = useState(() => withRules(defaultFormat()));
    const [choice, setChoice] = useState<Draft["choice"]>(null);
    seen.format = format;
    seen.choice = choice;
    return (
      <FormatPicker
        format={format}
        onChange={(f, c) => {
          setFormat(f);
          if (c !== undefined) setChoice(c);
        }}
        prizeChoice={choice}
      />
    );
  }

  it("offers them right under the cards, and stays on Every score with the reverse at each quarter", () => {
    const seen = { format: withRules(defaultFormat()), choice: null as Draft["choice"] };
    render(<Picker seen={seen} />);
    expect(screen.queryByTestId("every-score-options")).toBeNull();
    const card = () => screen.getAllByTestId("format-option").find((el) => el.getAttribute("data-format") === "every-score")!;
    fireEvent.click(card());
    expect(screen.getByTestId("every-score-options")).toBeTruthy();
    // The card comes with the final score (which takes the rest once there's a price).
    expect(seen.format.rules?.map((r) => r.moment)).toEqual(["score", "final"]);

    fireEvent.click(screen.getByTestId("every-score-reverse"));
    expect(reverseQuartersOn(seen.format.rules!)).toBe(true);
    expect(card()).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("format-custom")).toBeNull();
    // Tapping the picked card again keeps the setup.
    fireEvent.click(card());
    expect(reverseQuartersOn(seen.format.rules!)).toBe(true);

    // Amounts by score type pick dollars; TD $100 in a few taps, the others following.
    fireEvent.click(screen.getByTestId("every-score-by-kind"));
    expect(seen.choice).toBe("$");
    const field = (kind: string) => screen.getAllByTestId("score-kind-amount").find((el) => el.getAttribute("data-kind") === kind)!;
    fireEvent.change(field("touchdown"), { target: { value: "100" } });
    fireEvent.change(screen.getByTestId("every-score-reverse-amount"), { target: { value: "200" } });
    expect(seen.format.rules?.map((r) => (r.moment === "score" ? r.square?.byKind : r.reverse?.amount))).toEqual([
      { touchdown: 100, fieldGoal: 50, extraPoint: 25, twoPoint: 50, safety: 50 },
      200,
      200,
      200,
      200,
    ]);
  });
});
