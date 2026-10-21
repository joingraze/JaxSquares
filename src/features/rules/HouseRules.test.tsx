// The rules editor's house rules: added one line at a time or from the ideas,
// never one that asks anyone to buy anything, and the claim-code switch.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { HOUSE_RULE_PURCHASE_ERROR, HOUSE_RULES_MAX } from "../../../shared/venue";
import { HouseRules } from "./HouseRules";

function Harness({ initial = [] as string[] }) {
  const [rules, setRules] = useState(initial);
  const [codes, setCodes] = useState(false);
  return (
    <>
      <HouseRules rules={rules} claimCodes={codes} onRules={setRules} onClaimCodes={setCodes} />
      <output data-testid="value">{JSON.stringify({ rules, codes })}</output>
    </>
  );
}

const value = () => JSON.parse(screen.getByTestId("value").textContent ?? "{}") as { rules: string[]; codes: boolean };

afterEach(cleanup);

describe("HouseRules", () => {
  it("adds a typed rule (Enter or the button) and an idea, and removes one", () => {
    render(<Harness />);
    const input = screen.getByTestId("house-rule-input");
    fireEvent.change(input, { target: { value: "  Must be   present to win " } });
    fireEvent.click(screen.getByTestId("house-rule-add"));
    expect(value().rules).toEqual(["Must be present to win"]);
    expect(input).toHaveValue("");

    fireEvent.change(input, { target: { value: "Claim at the bar" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // The idea already on the board isn't offered again.
    expect(screen.getAllByTestId("house-rule-idea").map((c) => c.textContent)).not.toContain("Must be present to win");
    fireEvent.click(screen.getAllByTestId("house-rule-idea")[0]);
    expect(value().rules).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: 'Remove "Claim at the bar"' }));
    expect(value().rules).not.toContain("Claim at the bar");
  });

  it("never takes a rule that asks anyone to buy anything", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("house-rule-input"), { target: { value: "Buy a drink to play" } });
    expect(screen.getByText(HOUSE_RULE_PURCHASE_ERROR)).toBeInTheDocument();
    expect(screen.getByTestId("house-rule-add")).toBeDisabled();
    fireEvent.keyDown(screen.getByTestId("house-rule-input"), { key: "Enter" });
    expect(value().rules).toEqual([]);
  });

  it("stops offering more once the board has the most it shows", () => {
    render(<Harness initial={Array.from({ length: HOUSE_RULES_MAX }, (_, i) => `Rule ${i + 1}`)} />);
    expect(within(screen.getByTestId("house-rules")).queryByTestId("house-rule-input")).toBeNull();
    expect(screen.queryAllByTestId("house-rule-idea")).toHaveLength(0);
  });

  it("turns claim codes on and off", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("switch", { name: /Claim codes/ }));
    expect(value().codes).toBe(true);
  });
});
