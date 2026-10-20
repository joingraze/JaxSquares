import type { CompProps } from "../types";
import { Easing, interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { Headline } from "../components/Text";
import { EndCard } from "../components/Brand";
import { Sticker } from "../components/Layout";
import { Logo } from "../../../src/components/AppShell";

export const CHAT_FRAMES = 420;
const FPS = 30;

interface Msg {
  from: string;
  text: string;
  color: string;
  me?: boolean;
}

export interface ChatVariant {
  chatName: string;
  icon: string;
  members: string;
  hook: string;
  boardName: string;
  sticker: string;
  endLine: string;
  chaos: Msg[];
  calm: Msg[];
}

const SUNDAY_CHAOS: Msg[] = [
  { from: "Big Mike", text: "who has the 7-3 square??", color: "#facc15" },
  { from: "Tasha", text: "wait were the numbers drawn yet", color: "#f472b6" },
  { from: "Dev", text: "can someone resend the spreadsheet", color: "#f59e0b" },
  { from: "Nina", text: "the whiteboard pic is blurry 😭", color: "#fb7185" },
  { from: "Chris", text: "I thought I had row 4?", color: "#2dd4bf" },
  { from: "Jordan", text: "it's 10-7 so 0-7 wins right??", color: "#22c55e" },
  { from: "Maya", text: "no it's the OTHER way", color: "#38bdf8" },
  { from: "Big Mike", text: "who won the 1st quarter", color: "#facc15" },
  { from: "Tasha", text: "who still owes for squares", color: "#f472b6" },
  { from: "Dev", text: "I'm so confused", color: "#f59e0b" },
  { from: "Nina", text: "MIKE", color: "#fb7185" },
  { from: "Chris", text: "MIKE.", color: "#2dd4bf" },
];

const SUNDAY_CALM: Msg[] = [
  { from: "Maya", text: "claimed 5 🙌", color: "#38bdf8" },
  { from: "Big Mike", text: "wait it draws the numbers for us?", color: "#facc15" },
  { from: "Tasha", text: "and it says who won?? 🤯", color: "#f472b6" },
  { from: "Dev", text: "ok this is clean", color: "#f59e0b" },
];

export const SUNDAY_CHAT: ChatVariant = {
  chatName: "Sunday Crew",
  icon: "🏈",
  members: "14 people",
  hook: "Every squares pool|group chat:",
  boardName: "Sunday Squares 🏈",
  sticker: "One link. Zero spreadsheets.",
  endLine: "The squares pool|your group chat deserves.",
  chaos: SUNDAY_CHAOS,
  calm: SUNDAY_CALM,
};

export const FAMILY_CHAT: ChatVariant = {
  chatName: "Family",
  icon: "🦃",
  members: "23 people",
  hook: "Every Thanksgiving|family group chat:",
  boardName: "Thanksgiving Squares 🦃",
  sticker: "One link. Even Grandma's in.",
  endLine: "Thanksgiving squares.|One link per game.",
  chaos: [
    { from: "Aunt Linda", text: "are we doing squares again this year??", color: "#f472b6" },
    { from: "Grandma", text: "what's a square", color: "#a78bfa" },
    { from: "Uncle Ray", text: "I call the 7-0 🦃", color: "#facc15" },
    { from: "Cousin Jess", text: "can someone explain the numbers to grandma", color: "#2dd4bf" },
    { from: "Dad", text: "I'll make a spreadsheet", color: "#38bdf8" },
    { from: "Mom", text: "who's bringing the pie", color: "#fb7185" },
    { from: "Cousin Tyler", text: "Uncle Ray you can't CALL the 7-0", color: "#22c55e" },
    { from: "Grandma", text: "I have a square?", color: "#a78bfa" },
    { from: "Aunt Linda", text: "which game is this for", color: "#f472b6" },
    { from: "Dad", text: "spreadsheet attached", color: "#38bdf8" },
    { from: "Cousin Jess", text: "DAD", color: "#2dd4bf" },
    { from: "Mom", text: "DAD.", color: "#fb7185" },
  ],
  calm: [
    { from: "Grandma", text: "I got 3 squares! 🥧", color: "#a78bfa" },
    { from: "Uncle Ray", text: "fine I'll take the 2-2 😤", color: "#facc15" },
    { from: "Cousin Jess", text: "it draws the numbers itself??", color: "#2dd4bf" },
    { from: "Dad", text: "ok this beats my spreadsheet", color: "#38bdf8" },
  ],
};

// Chaos messages arrive faster and faster.
const chaosAt = (i: number, n: number) => 24 + Math.round(150 * Math.pow(i / n, 0.72));
const FREEZE = 196;
const LINK = 236;
const calmAt = (i: number) => LINK + 30 + i * 16;
const END = 352;

/** Group-chat chaos → one JaxSquares link. */
export function makeGroupChat(v: ChatVariant) {
  return function GroupChat({ frame }: CompProps) {
    const CHAOS = v.chaos;
    const chaos = frame < LINK;
    const visible = chaos
      ? CHAOS.filter((_, i) => frame >= chaosAt(i, CHAOS.length))
      : v.calm.filter((_, i) => frame >= calmAt(i));
    const unread = chaos ? Math.min(99, Math.floor(interpolate(frame, [24, FREEZE], [3, 140]))) : 0;
    const shake =
      chaos && frame > 120 && frame < FREEZE
        ? Math.sin(frame * 2.1) * interpolate(frame, [120, FREEZE], [0, 2.2])
        : 0;
    const freeze = interpolate(frame, [FREEZE, FREEZE + 6], [0, 1]);

    return (
      <div className="absolute inset-0">
        <Backdrop frame={frame} tint={chaos ? "rose" : "brand"} />

        {/* Chat window */}
        <div
          className="absolute overflow-hidden rounded-[34px]"
          style={{
            left: 22,
            right: 22,
            top: 160,
            height: 340,
            background: "#0d1322",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 40px 80px rgba(0,0,0,0.55)",
            transform: `translateX(${shake}px) rotate(${shake * 0.3}deg)`,
            filter:
              chaos && freeze > 0
                ? `grayscale(${freeze}) brightness(${1 - 0.45 * freeze})`
                : undefined,
          }}
        >
          <div className="relative z-10 flex items-center gap-2 border-b border-white/5 bg-[#0d1322] px-4 py-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/20 text-base">
              {v.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold">{v.chatName}</div>
              <div className="text-[10px] text-slate-400">{v.members}</div>
            </div>
            {unread > 0 && (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-extrabold text-white">
                {unread >= 99 ? "99+" : unread}
              </span>
            )}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 overflow-hidden px-3 pb-3"
            style={{ top: 52, justifyContent: "flex-end" }}
          >
            {!chaos && <LinkBubble frame={frame} boardName={v.boardName} />}
            {visible.map((m, i) => (
              <Bubble
                key={(chaos ? "c" : "k") + i}
                msg={m}
                frame={frame}
                at={chaos ? chaosAt(CHAOS.indexOf(m), CHAOS.length) : calmAt(i)}
              />
            ))}
          </div>
        </div>

        {frame < FREEZE && (
          <Headline
            frame={frame}
            text={v.hook}
            size={34}
            exit={FREEZE - 10}
            style={{ position: "absolute", top: 86, left: 0, right: 0 }}
          />
        )}
        {frame >= FREEZE && frame < LINK && (
          <Headline
            frame={frame}
            start={FREEZE + 4}
            text="or…|send *one link.*"
            size={40}
            style={{ position: "absolute", top: 260, left: 0, right: 0, zIndex: 20 }}
          />
        )}
        <Sticker frame={frame} start={LINK + 4} end={END - 4} tone="brand">
          {v.sticker}
        </Sticker>

        <EndCard frame={frame} start={END} line={v.endLine} />
      </div>
    );
  };
}

function Bubble({ msg, frame, at }: { msg: Msg; frame: number; at: number }) {
  const s = spring(frame - at, FPS, { stiffness: 300, damping: 20 });
  return (
    <div
      className={`flex ${msg.me ? "justify-end" : "justify-start"}`}
      style={{ transform: `scale(${0.6 + 0.4 * s})`, transformOrigin: "bottom left", opacity: s }}
    >
      <div className="max-w-[78%]">
        <div className="mb-0.5 ml-2 text-[9.5px] font-bold" style={{ color: msg.color }}>
          {msg.from}
        </div>
        <div className="rounded-2xl rounded-bl-md bg-[#262f44] px-3 py-1.5 text-[13px] leading-snug">
          {msg.text}
        </div>
      </div>
    </div>
  );
}

function LinkBubble({ frame, boardName }: { frame: number; boardName: string }) {
  const s = spring(frame - LINK, FPS, { stiffness: 220, damping: 18 });
  return (
    <div
      className="flex justify-end"
      style={{ transform: `translateY(${(1 - s) * 40}px)`, opacity: s }}
    >
      <div
        className="w-[82%] overflow-hidden rounded-2xl rounded-br-md"
        style={{ background: "#1f6f3f" }}
      >
        <div className="flex items-center gap-2.5 bg-black/20 p-2.5">
          <Logo size={40} />
          <div className="min-w-0">
            <div className="text-[12px] font-bold leading-tight">
              Join my squares pool: {boardName}
            </div>
            <div className="text-[10px] text-white/70">JaxSquares · tap to claim</div>
          </div>
        </div>
        <div
          className="px-3 py-1.5 text-[13px]"
          style={{
            opacity: interpolate(frame, [LINK + 8, LINK + 14], [0, 1], { easing: Easing.out }),
          }}
        >
          board's up, grab your squares 👇
        </div>
      </div>
    </div>
  );
}
