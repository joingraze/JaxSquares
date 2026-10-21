// The rules editor's venue settings (shared/venue.ts): the "Venue mode"
// switch at the top, and "House rules" at the foot: a few short lines the host
// adds one at a time ("Must be present to win"), with ideas a tap away, the
// claim-code switch and how long a winner has to collect. Used in the create
// flow and the host's rules editor (RulesEditor); the board, its TV and the
// rules sheet show them.

import { useState } from "react";
import { PlusIcon, XIcon } from "../../components/icons";
import { Chip, IconButton, SegmentedControl, Switch, TextField } from "../../components/ui";
import { CLAIM_MINUTES_CHOICES, HOUSE_RULE_IDEAS, HOUSE_RULE_MAX_LENGTH, HOUSE_RULES_MAX, houseRuleProblem } from "../../../shared/venue";

/** "Venue mode": a bar, restaurant or brewery's free board (setVenue in rulesModel sets it up). */
export function VenueMode({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="rounded-2xl bg-surface-3 px-3.5 py-3 ring-1 ring-inset ring-line" data-testid="venue-mode-row">
      <Switch
        checked={on}
        onChange={onChange}
        label="Venue mode"
        description="For a bar, restaurant or brewery: free to play, one square each, and winners collect their prize from staff."
        data-testid="venue-mode"
      />
    </div>
  );
}

export interface HouseRulesProps {
  rules: string[];
  claimCodes: boolean;
  /** Minutes a winner has to collect (with claim codes); null = no limit. */
  claimMinutes: number | null;
  onRules: (rules: string[]) => void;
  onClaimCodes: (on: boolean) => void;
  onClaimMinutes: (minutes: number | null) => void;
}

export function HouseRules({ rules, claimCodes, claimMinutes, onRules, onClaimCodes, onClaimMinutes }: HouseRulesProps) {
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const full = rules.length >= HOUSE_RULES_MAX;
  const problem = houseRuleProblem(text);
  const ideas = HOUSE_RULE_IDEAS.filter((idea) => !rules.some((r) => r.toLowerCase() === idea.toLowerCase()));

  const add = (line: string) => {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean || full || houseRuleProblem(clean)) return;
    if (!rules.some((r) => r.toLowerCase() === clean.toLowerCase())) onRules([...rules, clean]);
  };
  const addTyped = () => {
    setTried(true);
    if (!text.trim() || problem || full) return;
    add(text);
    setText("");
    setTried(false);
  };

  return (
    <section aria-label="House rules" data-testid="house-rules" className="flex flex-col gap-2.5">
      <div className="px-1">
        <p className="eyebrow text-ink-subtle">House rules</p>
        <p className="mt-1 text-footnote text-ink-subtle">How to play and claim a prize, on the board and its TV. Great for a bar or a party.</p>
      </div>

      {rules.length > 0 && (
        <ul className="overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-inset ring-line [&>li+li]:border-t [&>li+li]:border-line">
          {rules.map((rule) => (
            <li key={rule} className="flex min-h-12 items-center gap-2 pl-3.5 pr-1.5 text-callout text-ink">
              <span className="min-w-0 flex-1">{rule}</span>
              <IconButton
                label={`Remove "${rule}"`}
                icon={<XIcon size={16} />}
                variant="ghost"
                size="sm"
                className="text-ink-muted"
                onClick={() => onRules(rules.filter((r) => r !== rule))}
              />
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <>
          <div className="flex items-start gap-2">
            <TextField
              label="Add a house rule"
              className="min-w-0 flex-1"
              value={text}
              maxLength={HOUSE_RULE_MAX_LENGTH}
              placeholder="Must be present to win"
              enterKeyHint="done"
              error={tried || text.length > 0 ? (problem ?? undefined) : undefined}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTyped();
                }
              }}
              data-testid="house-rule-input"
            />
            <IconButton
              label="Add house rule"
              icon={<PlusIcon size={18} strokeWidth={2.6} />}
              variant="solid"
              className="mt-7"
              disabled={!text.trim() || !!problem}
              onClick={addTyped}
              data-testid="house-rule-add"
            />
          </div>
          {ideas.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Ideas">
              {ideas.slice(0, HOUSE_RULES_MAX - rules.length + 1).map((idea) => (
                <Chip key={idea} onClick={() => add(idea)} data-testid="house-rule-idea">
                  {idea}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-3 rounded-2xl bg-surface-3 px-3.5 py-3 ring-1 ring-inset ring-line">
        <Switch
          checked={claimCodes}
          onChange={onClaimCodes}
          label="Claim codes"
          description="Each winner's phone shows a winning pass with a short code. Staff check it, hand over the prize and mark it collected."
          data-testid="claim-codes"
        />
        {claimCodes && (
          <div className="flex flex-col gap-1.5">
            <p className="text-footnote font-semibold text-ink-muted">Time to collect</p>
            <SegmentedControl<number>
              size="sm"
              aria-label="Time to collect"
              data-testid="claim-minutes"
              value={claimMinutes ?? 0}
              onChange={(m) => onClaimMinutes(m || null)}
              options={[{ value: 0, label: "No limit" }, ...CLAIM_MINUTES_CHOICES.map((m) => ({ value: m, label: `${m} min` }))]}
            />
          </div>
        )}
      </div>
    </section>
  );
}
