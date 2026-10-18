// Joining a board: one field (your name), an optional emoji + color with
// sensible defaults already picked, and one button that says exactly what
// happens next ("Join & claim 2 squares"). Someone this phone already knows
// skips the name step: "Welcome back, Sam" and the same one button.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import type { GameState } from "../../../shared/types";
import { AlertIcon, CheckIcon, ShuffleIcon } from "../../components/icons";
import { Avatar, BottomSheet, Button, cx, TextField } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { contrastText, shortMatchup } from "../../lib/format";
import { getPlayerId, getProfile, hasProfileName, NAME_MAX_LENGTH, PLAYER_COLORS, PLAYER_EMOJIS, setProfile } from "../../lib/identity";
import { haptic } from "../../lib/native";
import "./invite.css";
import { boardStats, defaultLook, hostOf, joinLabel, nameClash, nameProblem, shuffleLook, type Look } from "./inviteModel";

export interface JoinSheetProps {
  state: GameState;
  open: boolean;
  /** Called with the fresh state after the join request succeeds. */
  onJoined: (state: GameState) => void;
  onClose: () => void;
  /**
   * Squares the newcomer picked before joining (the board claims them right
   * after onJoined). 0 = joining without a pick; omitted = assume a claim.
   */
  selectedCount?: number;
}

const COLOR_VALUES = PLAYER_COLORS.map((c) => c.value);
/** Pale "Chalk" reads as an empty circle, so it's never the default (still pickable). */
const AVOID_DEFAULT_COLORS = PLAYER_COLORS.filter((c) => c.name === "Chalk").map((c) => c.value);

export function JoinSheet({ state, open, onJoined, onClose, selectedCount }: JoinSheetProps) {
  const { game } = state;
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const emojiRow = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [look, setLook] = useState<Look>(() => ({ color: COLOR_VALUES[0], emoji: PLAYER_EMOJIS[0] }));
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A returning player (name saved on this phone) sees "Welcome back" and skips the name step unless they choose to edit.
  const [returningName, setReturningName] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);

  // Fresh defaults every time the sheet opens: the saved profile, or a look nobody on this board has yet.
  const players = state.players;
  useEffect(() => {
    if (!open) return;
    const profile = getProfile();
    const returning = hasProfileName();
    setName(profile.name);
    setReturningName(returning ? profile.name.trim() : null);
    // A name someone else here already uses opens the editor so they can add an initial.
    setEditing(!returning || !!nameClash(profile.name, players, getPlayerId()));
    setLook(
      defaultLook(profile, players, {
        returning,
        myId: getPlayerId(),
        colors: COLOR_VALUES,
        emojis: PLAYER_EMOJIS,
        avoidColors: AVOID_DEFAULT_COLORS,
      }),
    );
    setNameError(null);
    setError(null);
    setBusy(false);
    // Only on open; later board updates must not reset what the player is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the chosen emoji in view.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = emojiRow.current?.querySelector<HTMLElement>('[aria-checked="true"]');
      el?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "instant" as ScrollBehavior });
    }, 60);
    return () => clearTimeout(t);
  }, [open, look.emoji]);

  // "Change": open the editor and put the cursor in the name.
  const startEditing = () => {
    void haptic("selection");
    setEditing(true);
    setTimeout(() => nameRef.current?.focus(), 30);
  };

  const host = hostOf(state);
  const clash = useMemo(() => nameClash(name, players, getPlayerId()), [name, players]);
  const full = boardStats(state).left === 0;
  const label = joinLabel(game.status, selectedCount, full);
  const welcome = returningName !== null;

  const pick = (patch: Partial<Look>) => {
    void haptic("selection");
    setLook((l) => ({ ...l, ...patch }));
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const problem = nameProblem(name);
    if (problem) {
      setEditing(true);
      setNameError(problem);
      void haptic("error");
      setTimeout(() => nameRef.current?.focus(), 30);
      return;
    }
    const profile = { name: name.trim().slice(0, NAME_MAX_LENGTH), ...look };
    setBusy(true);
    setError(null);
    try {
      const res = await api.join(game.id, profile);
      setProfile(profile);
      void haptic("success");
      onJoined(res.state);
    } catch (err) {
      setError(errorMessage(err));
      void haptic("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      initialFocusRef={nameRef}
      title={welcome ? `Welcome back, ${returningName}!` : "What should we call you?"}
      description={`${shortMatchup(game)}${host ? ` · ${host.name}'s board` : ""}`}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-500/12 px-3 py-2 text-footnote font-semibold text-ink-danger ring-1 ring-inset ring-danger-500/30">
              <AlertIcon size={16} className="mt-px shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
            </p>
          )}
          <Button
            data-testid="join-submit"
            type="submit"
            form={formId}
            size="lg"
            block
            loading={busy}
            haptic="medium"
            trailing={<span aria-hidden className="text-title-3 leading-none">{look.emoji}</span>}
          >
            {error ? "Try again" : label}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        {!editing && (
          <div className="flex animate-fade-in items-center gap-3 rounded-card bg-surface-3 py-3 pl-3 pr-1.5 ring-1 ring-inset ring-line">
            <span key={`${look.emoji}${look.color}`} className="animate-pop">
              <Avatar name={name || "You"} color={look.color} emoji={look.emoji} size="lg" decorative />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-headline font-extrabold text-ink">{name}</p>
              <p className="text-footnote text-ink-muted">How friends see you</p>
            </div>
            <button
              type="button"
              onClick={startEditing}
              disabled={busy}
              className="pressable inline-flex h-11 shrink-0 items-center rounded-full px-3.5 text-subhead font-bold text-ink-brand hover:bg-ink/6"
            >
              Change
            </button>
          </div>
        )}
        {editing && (
          <>
            <TextField
              ref={nameRef}
              data-testid="join-name"
              label="Your name"
              hideLabel
              placeholder="Your name"
              value={name}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="nickname"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              error={nameError}
              hint={clash ?? "No sign-up. We'll remember you on this phone."}
              leading={
                <span key={`${look.emoji}${look.color}`} className="animate-pop -ml-1">
                  <Avatar name={name || "You"} color={look.color} emoji={look.emoji} size="md" decorative />
                </span>
              }
              inputClassName="text-headline font-bold"
            />

            <fieldset className="flex min-w-0 flex-col gap-3" disabled={busy}>
              <legend className="sr-only">Your look</legend>
              <div className="flex items-center justify-between px-1">
                <span aria-hidden className="text-subhead font-bold text-ink-muted">
                  Your look
                </span>
                <button
                  type="button"
                  onClick={() => pick(shuffleLook(look, COLOR_VALUES, PLAYER_EMOJIS))}
                  className="pressable tap-target -mr-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-footnote font-bold text-ink-brand hover:bg-ink/6"
                >
                  <ShuffleIcon size={15} strokeWidth={2.4} />
                  Shuffle
                </button>
              </div>

              <div
                ref={emojiRow}
                role="radiogroup"
                aria-label="Emoji"
                className="join-scroller scrollbar-none -mx-5 flex gap-1.5 overflow-x-auto px-5 py-1"
              >
                {PLAYER_EMOJIS.map((emoji) => {
                  const selected = emoji === look.emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={emoji}
                      onClick={() => pick({ emoji })}
                      style={selected ? { backgroundColor: look.color } : undefined}
                      className={cx(
                        "pressable grid h-11 w-11 shrink-0 place-items-center rounded-full text-[1.4rem] leading-none",
                        selected
                          ? "ring-2 ring-ink ring-offset-2 ring-offset-surface-2 shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)]"
                          : "bg-surface-3 ring-1 ring-inset ring-line",
                      )}
                    >
                      <span aria-hidden className="translate-y-[0.04em]">
                        {emoji}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Each swatch owns an equal, full-height slice of the row, so hit areas never overlap. */}
              <div role="radiogroup" aria-label="Color" className="-my-2 flex">
                {PLAYER_COLORS.map((c) => {
                  const selected = c.value === look.color;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={c.name}
                      title={c.name}
                      onClick={() => pick({ color: c.value })}
                      className="pressable grid h-11 min-w-0 flex-1 place-items-center"
                    >
                      <span
                        aria-hidden
                        style={{ backgroundColor: c.value, color: contrastText(c.value) }}
                        className={cx(
                          "grid h-6 w-6 place-items-center rounded-full transition-transform duration-200 ease-spring",
                          "shadow-[inset_0_-2px_0_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.35)]",
                          selected && "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface-2",
                        )}
                      >
                        {selected && <CheckIcon size={13} strokeWidth={3.4} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}
      </form>
    </BottomSheet>
  );
}
