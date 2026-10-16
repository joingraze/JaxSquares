// A slice of a board with me on it: exactly how my square looks to everyone,
// updating live while I change my emoji and color.

import type { CSSProperties } from "react";
import { contrastText, initialsOf } from "../../../lib/format";
import type { Profile } from "../../../lib/identity";
import "../notifications.css";

type Slot = { name: string; color: string; emoji: string } | "me" | null;

const MAYA = { name: "Maya", color: "#ff6b6b", emoji: "🦊" };
const DRE = { name: "Dre", color: "#4dabf7", emoji: "🐻" };
const PRIYA = { name: "Priya", color: "#ffd43b", emoji: "🌮" };
const LUIS = { name: "Luis", color: "#69db7c", emoji: "🦖" };
const TESS = { name: "Tess", color: "#da77f2", emoji: "🎸" };
const OMAR = { name: "Omar", color: "#ffa94d", emoji: "🚀" };
const KIM = { name: "Kim Lee", color: "#63e6be", emoji: "" };

const SLOTS: Slot[][] = [
  [MAYA, null, DRE, PRIYA, null],
  [LUIS, TESS, "me", null, OMAR],
  [null, KIM, PRIYA, MAYA, null],
];

function Sticker({ person }: { person: { name: string; color: string; emoji: string } }) {
  const style = { "--p": person.color, "--pi": contrastText(person.color) } as CSSProperties;
  return (
    <span className="jxn-sticker" data-initials={!person.emoji} style={style}>
      <span>{person.emoji || initialsOf(person.name || "?")}</span>
    </span>
  );
}

export function SquarePreview({ profile, size = 44, rows = 3 }: { profile: Profile; size?: number; rows?: 1 | 3 }) {
  const me = { name: profile.name || "You", color: profile.color, emoji: profile.emoji };
  const slots = rows === 1 ? [SLOTS[1]] : SLOTS;
  return (
    <div
      role="img"
      aria-label={`Your square: ${profile.emoji || initialsOf(me.name)} on ${profile.name ? `${profile.name}'s` : "your"} color`}
      className="jxn-preview"
      style={{ "--cell": `${size}px` } as CSSProperties}
    >
      {slots.flatMap((line, r) =>
        line.map((slot, c) =>
          slot === "me" ? (
            <span key={`${r}${c}`} className="jxn-cell" data-mine="true">
              <MeSticker person={me} />
            </span>
          ) : slot ? (
            <span key={`${r}${c}`} className="jxn-cell" data-dim="true" style={{ "--p": slot.color } as CSSProperties}>
              <Sticker person={slot} />
            </span>
          ) : (
            <span key={`${r}${c}`} className="jxn-cell" data-empty="true" />
          ),
        ),
      )}
    </div>
  );
}

function MeSticker({ person }: { person: { name: string; color: string; emoji: string } }) {
  // Keyed wrapper: a new emoji/color replays the pop animation.
  return <Sticker key={`${person.emoji}|${person.color}`} person={person} />;
}

/** One big square, for the editor. */
export function BigSquare({ profile, size = 76 }: { profile: Profile; size?: number }) {
  const me = { name: profile.name || "You", color: profile.color, emoji: profile.emoji };
  return (
    <span className="jxn-preview" style={{ "--cell": `${size}px`, gridTemplateColumns: "var(--cell)" } as CSSProperties} aria-hidden>
      <span className="jxn-cell" data-mine="true" style={{ transform: "none" }}>
        <MeSticker person={me} />
      </span>
    </span>
  );
}
