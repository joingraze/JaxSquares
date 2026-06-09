import { PLAYER_COLORS } from "../lib/identity";
import { TextInput } from "./ui";

/** Compact identity editor: who you are + your square color. */
export function PlayerBar({
  name,
  color,
  onName,
  onColor,
}: {
  name: string;
  color: string;
  onName: (v: string) => void;
  onColor: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-pitch-900/60 p-3">
      <div className="flex items-center gap-2">
        <span
          className="h-9 w-9 shrink-0 rounded-full ring-2 ring-white/20"
          style={{ backgroundColor: color }}
        />
        <TextInput
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          aria-label="Your name"
          className="flex-1"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {PLAYER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Pick color ${c}`}
            onClick={() => onColor(c)}
            className={`h-7 w-7 rounded-full transition ${
              c === color ? "ring-2 ring-white ring-offset-2 ring-offset-pitch-900" : "opacity-80"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
