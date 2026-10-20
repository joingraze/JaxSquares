// Edit how I show up on boards: name, emoji sticker and color, with a live
// preview square. Changes save as you go; closing pushes the new look to the
// boards I'm on (see profileSync).

import { useRef } from "react";
import { CheckIcon } from "../../../components/icons";
import { BottomSheet, Button, TextField, cx } from "../../../components/ui";
import { contrastText } from "../../../lib/format";
import { NAME_MAX_LENGTH, PLAYER_COLORS, PLAYER_EMOJIS, setProfile, useProfile } from "../../../lib/identity";
import { haptic } from "../../../lib/native";
import { colorName } from "./profileSync";
import { BigSquare } from "./SquarePreview";

export interface LookSheetProps {
  open: boolean;
  onClose: () => void;
}

export function LookSheet({ open, onClose }: LookSheetProps) {
  const profile = useProfile();
  const nameRef = useRef<HTMLInputElement>(null);
  const named = profile.name.trim().length > 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Your look"
      description="How you show up on every board."
      initialFocusRef={named ? undefined : nameRef}
      footer={
        <Button
          size="lg"
          block
          data-testid="look-done"
          onClick={() => {
            if (named) onClose();
            else {
              void haptic("warning");
              nameRef.current?.focus();
            }
          }}
        >
          {named ? "Done" : "Add your name"}
        </Button>
      }
    >
      <div className="flex items-center gap-4">
        <BigSquare profile={profile} size={72} />
        <TextField
          ref={nameRef}
          label="Name"
          className="min-w-0 flex-1"
          value={profile.name}
          maxLength={NAME_MAX_LENGTH}
          counter
          placeholder="What friends call you"
          autoComplete="nickname"
          enterKeyHint="done"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          data-testid="profile-name"
        />
      </div>

      <h3 className="eyebrow mb-2.5 mt-6 px-1 text-ink-subtle">Sticker</h3>
      <div role="radiogroup" aria-label="Sticker" className="grid grid-cols-8 gap-1.5">
        {PLAYER_EMOJIS.map((emoji) => {
          const on = emoji === profile.emoji;
          return (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={emoji}
              onClick={() => {
                void haptic("selection");
                setProfile({ emoji });
              }}
              className={cx(
                "pressable grid aspect-square place-items-center rounded-xl text-[1.45rem] leading-none",
                on ? "bg-brand-400/18 ring-2 ring-brand-line" : "bg-surface-3 ring-1 ring-inset ring-line",
              )}
            >
              <span aria-hidden className="translate-y-[0.04em]">
                {emoji}
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="eyebrow mb-2.5 mt-6 flex gap-1.5 px-1 text-ink-subtle">
        Color
        {colorName(profile.color) && <span className="text-ink-muted">· {colorName(profile.color)}</span>}
      </h3>
      <div role="radiogroup" aria-label="Color" className="grid grid-cols-6 gap-2.5 pb-1">
        {PLAYER_COLORS.map((c) => {
          const on = c.value.toLowerCase() === profile.color.toLowerCase();
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              onClick={() => {
                void haptic("selection");
                setProfile({ color: c.value });
              }}
              style={{ backgroundColor: c.value, color: contrastText(c.value) }}
              className={cx(
                "pressable grid aspect-square place-items-center rounded-full",
                "shadow-[inset_0_-3px_0_rgb(0_0_0/0.18),inset_0_2px_0_rgb(255_255_255/0.35)]",
                on && "ring-2 ring-brand-line ring-offset-[3px] ring-offset-surface-2",
              )}
            >
              {on && <CheckIcon size={18} strokeWidth={3.2} />}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
