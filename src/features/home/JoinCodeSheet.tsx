// "Join with a code": six boxes for the code at the end of an invite link.
// Pasting a whole link works too. Checks the board exists before leaving Home,
// so a typo gets a friendly answer instead of a dead page.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertIcon, ArrowRightIcon } from "../../components/icons";
import { BottomSheet, Button, cx } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { primeGame } from "../../lib/live";
import { haptic } from "../../lib/native";
import "./home.css";
import { CODE_LENGTH, parseJoinCode } from "./joinCode";

export interface JoinCodeSheetProps {
  open: boolean;
  onClose: () => void;
}

type Lookup = { kind: "idle" } | { kind: "checking" } | { kind: "error"; message: string };

export function JoinCodeSheet({ open, onClose }: JoinCodeSheetProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" });
  const [shakeKey, setShakeKey] = useState(0);
  const parsed = parseJoinCode(raw);
  const error = parsed.error ?? (lookup.kind === "error" ? lookup.message : null);

  useEffect(() => {
    if (!open) {
      setRaw("");
      setLookup({ kind: "idle" });
    }
  }, [open]);

  const submit = async (id: string | null = parsed.id) => {
    if (!id || lookup.kind === "checking") return;
    setLookup({ kind: "checking" });
    try {
      const state = await api.getGame(id);
      primeGame(state);
      void haptic("success");
      onClose();
      navigate(`/g/${id}`);
    } catch (err) {
      void haptic("error");
      setShakeKey((k) => k + 1);
      const message =
        err instanceof ApiError && err.isNotFound
          ? `No board with code ${id.toUpperCase()}. Double-check it with your host.`
          : err instanceof ApiError
            ? err.message
            : "Couldn't check that code. Try again.";
      setLookup({ kind: "error", message });
    }
  };

  const onChange = (value: string) => {
    const next = parseJoinCode(value);
    // Keep only what fits; a pasted link collapses to its code.
    const shown = next.error ? value.replace(/\s/g, "").slice(0, CODE_LENGTH + 1) : next.display;
    setRaw(shown);
    if (lookup.kind !== "idle") setLookup({ kind: "idle" });
    if (next.error) {
      void haptic("warning");
      setShakeKey((k) => k + 1);
    }
    // Typing the last character (or pasting a link) goes straight to the board.
    if (next.id && next.id !== parsed.id) void submit(next.id);
    else if (next.display.length > parsed.display.length) void haptic("selection");
  };

  const chars = parsed.display.padEnd(CODE_LENGTH, " ").slice(0, CODE_LENGTH).split("");
  const caret = Math.min(parsed.display.length, CODE_LENGTH - 1);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Join with a code"
      description="It's the 6 characters at the end of the invite link, like jaxsquares.com/g/AB3KX9."
      initialFocusRef={inputRef}
      footer={
        <Button
          block
          size="lg"
          // Until there's a whole code, a plainly inactive grey button (not a dimmed volt one that still looks tappable).
          variant={parsed.id ? "primary" : "secondary"}
          disabled={!parsed.id}
          loading={lookup.kind === "checking"}
          onClick={() => void submit()}
          trailing={<ArrowRightIcon size={20} strokeWidth={2.6} />}
        >
          Join board
        </Button>
      }
    >
      <label className="relative block" onPointerDown={() => inputRef.current?.focus()}>
        <span className="sr-only">Board code</span>
        <div key={shakeKey} className={cx("grid grid-cols-6 gap-2", shakeKey > 0 && error && "animate-shake")}>
          {chars.map((c, i) => {
            const filled = c !== " ";
            const active = i === caret && lookup.kind !== "checking";
            return (
              <span
                key={i}
                aria-hidden
                className={cx(
                  "relative grid h-15 place-items-center rounded-2xl bg-surface-3 font-display text-title-2 font-extrabold uppercase text-ink ring-1 ring-inset transition-[box-shadow,background-color] duration-150",
                  error ? "ring-danger-500/70" : filled ? "ring-brand-400/50" : "ring-line-strong",
                  active && !error && "join-code-active ring-2 ring-brand-400",
                )}
              >
                {filled ? <span className="animate-pop">{c}</span> : null}
              </span>
            );
          })}
        </div>
        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby="join-code-help"
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
      </label>
      <p
        id="join-code-help"
        role={error ? "alert" : undefined}
        className={cx("mt-3 flex min-h-5 items-start gap-1.5 px-1 text-footnote", error ? "font-semibold text-danger-400" : "text-ink-subtle")}
      >
        {error ? (
          <>
            <AlertIcon size={15} className="mt-px shrink-0" />
            {error}
          </>
        ) : (
          "Pasting the whole link works too."
        )}
      </p>
    </BottomSheet>
  );
}
