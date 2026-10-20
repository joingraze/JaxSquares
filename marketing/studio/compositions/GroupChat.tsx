import type { CompProps } from "../types";
import { Easing, interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { Headline } from "../components/Text";
import { EndCard } from "../components/Brand";
import { Sticker, poseTrack, POSE_LOW } from "../components/Layout";
import { Cuts, Phone, type Cut } from "../components/Phone";
import { ASSETS } from "../lib/assets";
import { COLORS } from "../brand";

const FPS = 30;

interface Msg {
  from: string;
  text: string;
  color: string;
}

export interface ChatVariant {
  chatName: string;
  icon: string;
  members: string;
  hook: string;
  /** The invite text the app writes ("Grab a square on my … board 🏈"). */
  invite: string;
  sticker: string;
  endLine: string;
  chaos: Msg[];
  calm: Msg[];
}

export const SUNDAY_CHAT: ChatVariant = {
  chatName: "Sunday Crew",
  icon: "🏈",
  members: "14 people",
  hook: "Every squares|group chat:",
  invite: "Grab a square on my Hawks vs Wolves board 🏈",
  sticker: "One link. Zero spreadsheets.",
  endLine: "The squares board|your group chat deserves.",
  chaos: [
    { from: "Big Mike", text: "who has the 7-3 square??", color: "#ffd23f" },
    { from: "Tasha", text: "wait were the numbers drawn yet", color: "#ff4f9a" },
    { from: "Dev", text: "can someone resend the spreadsheet", color: "#ffa26b" },
    { from: "Nina", text: "the whiteboard pic is blurry 😭", color: "#ff4757" },
    { from: "Chris", text: "I thought I had row 4?", color: "#1fd1c1" },
    { from: "Jordan", text: "it's 10-7 so 0-7 wins right??", color: "#c6f91f" },
    { from: "Maya", text: "no it's the OTHER way", color: "#38b6ff" },
    { from: "Big Mike", text: "who won the 1st quarter", color: "#ffd23f" },
    { from: "Tasha", text: "who's even got the Q1 square", color: "#ff4f9a" },
    { from: "Dev", text: "I'm so confused", color: "#ffa26b" },
    { from: "Nina", text: "MIKE", color: "#ff4757" },
    { from: "Chris", text: "MIKE.", color: "#1fd1c1" },
  ],
  calm: [
    { from: "Maya", text: "grabbed 5 🙌", color: "#38b6ff" },
    { from: "Big Mike", text: "wait it draws the numbers for us?", color: "#ffd23f" },
    { from: "Tasha", text: "and it shows who won?? 🤯", color: "#ff4f9a" },
    { from: "Dev", text: "ok this is clean", color: "#ffa26b" },
  ],
};

export const FAMILY_CHAT: ChatVariant = {
  chatName: "Family",
  icon: "🦃",
  members: "23 people",
  hook: "Every Thanksgiving|family group chat:",
  invite: "Grab a square on my Bears vs Lions board 🏈",
  sticker: "One link. Even Grandma's in.",
  endLine: "Thanksgiving squares.|One link per game.",
  chaos: [
    { from: "Aunt Linda", text: "are we doing squares again this year??", color: "#ff4f9a" },
    { from: "Grandma", text: "what's a square", color: "#9b6bff" },
    { from: "Uncle Ray", text: "I call the 7-0 🦃", color: "#ffd23f" },
    { from: "Cousin Jess", text: "can someone explain the numbers to grandma", color: "#1fd1c1" },
    { from: "Dad", text: "I'll make a spreadsheet", color: "#38b6ff" },
    { from: "Mom", text: "who's bringing the pie", color: "#ff4757" },
    { from: "Cousin Tyler", text: "Uncle Ray you can't CALL the 7-0", color: "#c6f91f" },
    { from: "Grandma", text: "I have a square?", color: "#9b6bff" },
    { from: "Aunt Linda", text: "which game is this for", color: "#ff4f9a" },
    { from: "Dad", text: "spreadsheet attached", color: "#38b6ff" },
    { from: "Cousin Jess", text: "DAD", color: "#1fd1c1" },
    { from: "Mom", text: "DAD.", color: "#ff4757" },
  ],
  calm: [
    { from: "Grandma", text: "I got 3 squares! 🥧", color: "#9b6bff" },
    { from: "Uncle Ray", text: "fine I'll take the 2-2 😤", color: "#ffd23f" },
    { from: "Cousin Jess", text: "it draws the numbers itself??", color: "#1fd1c1" },
    { from: "Dad", text: "ok this beats my spreadsheet", color: "#38b6ff" },
  ],
};

// Chaos messages arrive faster and faster.
const chaosAt = (i: number, n: number) => 24 + Math.round(150 * Math.pow(i / n, 0.72));
const FREEZE = 196;
const LINK = 236;
const calmAt = (i: number) => LINK + 34 + i * 16;
const PHONE = 344;
const END = 430;
export const CHAT_FRAMES = 510;

const CLAIM: Cut = { at: PHONE, scene: "claim", from: 10, speed: 1.4 };

/** Group-chat chaos → one JaxSquares link → everyone picks. */
export function makeGroupChat(v: ChatVariant) {
  return function GroupChat({ frame }: CompProps) {
    const chaos = frame < LINK;
    const visible = chaos
      ? v.chaos.filter((_, i) => frame >= chaosAt(i, v.chaos.length))
      : v.calm.filter((_, i) => frame >= calmAt(i));
    const unread = chaos ? Math.floor(interpolate(frame, [24, FREEZE], [3, 140])) : 0;
    const shake =
      chaos && frame > 120 && frame < FREEZE
        ? Math.sin(frame * 2.1) * interpolate(frame, [120, FREEZE], [0, 2.2])
        : 0;
    const freeze = interpolate(frame, [FREEZE, FREEZE + 6], [0, 1]);
    const away = spring(frame - PHONE, FPS, { stiffness: 140, damping: 20 });
    const pose = poseTrack(frame, [
      [0, POSE_LOW],
      [PHONE, { cx: 180, top: 138, scale: 0.62 }],
    ]);

    return (
      <div className="absolute inset-0">
        <Backdrop frame={frame} tint={chaos ? "flare" : "volt"} />

        {/* Chat window */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: 22,
            right: 22,
            top: 150,
            height: 392,
            borderRadius: 34,
            background: "#0b0d0c",
            border: `1px solid ${COLORS.line}`,
            boxShadow: "0 40px 80px rgba(0,0,0,0.55)",
            transform: `translateX(${shake}px) rotate(${shake * 0.3}deg) translateY(${away * -640}px)`,
            opacity: 1 - away,
            filter: chaos && freeze > 0 ? `grayscale(${freeze}) brightness(${1 - 0.45 * freeze})` : undefined,
          }}
        >
          <div
            className="relative z-10 flex flex-col items-center"
            style={{ padding: "10px 16px 8px", background: "#141615", borderBottom: `1px solid ${COLORS.line}` }}
          >
            <span className="grid place-items-center rounded-full" style={{ width: 34, height: 34, background: "#2a2d2b", fontSize: 18 }}>
              {v.icon}
            </span>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>
              {v.chatName} <span style={{ color: COLORS.subtle, fontWeight: 500 }}>· {v.members}</span>
            </div>
            {unread > 0 && (
              <span
                className="absolute rounded-full"
                style={{ right: 14, top: 16, padding: "2px 8px", fontSize: 11, fontWeight: 800, background: COLORS.live, color: "#fff" }}
              >
                {unread >= 99 ? "99+" : unread}
              </span>
            )}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
            style={{ top: 66, gap: 6, padding: "0 12px 12px", justifyContent: "flex-end" }}
          >
            {!chaos && <LinkBubble frame={frame} text={v.invite} />}
            {visible.map((m, i) => (
              <Bubble
                key={(chaos ? "c" : "k") + i}
                msg={m}
                frame={frame}
                at={chaos ? chaosAt(v.chaos.indexOf(m), v.chaos.length) : calmAt(i)}
              />
            ))}
          </div>
        </div>

        {frame >= PHONE - 4 && (
          <Phone {...pose}>
            <Cuts frame={frame} cuts={[CLAIM]} />
          </Phone>
        )}

        {frame < FREEZE && (
          <Headline
            frame={frame}
            text={v.hook}
            size={34}
            exit={FREEZE - 10}
            style={{ position: "absolute", top: 84, left: 0, right: 0 }}
          />
        )}
        {frame >= FREEZE && frame < LINK && (
          <Headline
            frame={frame}
            start={FREEZE + 4}
            text="or…|send *one link.*"
            size={42}
            style={{ position: "absolute", top: 262, left: 0, right: 0, zIndex: 20 }}
          />
        )}
        <Sticker frame={frame} start={LINK + 4} end={PHONE - 4} tone="volt">
          {v.sticker}
        </Sticker>
        <Sticker frame={frame} start={PHONE + 6} end={END - 4}>
          Everyone picks from their phone
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
      className="flex justify-start"
      style={{ transform: `scale(${0.6 + 0.4 * s})`, transformOrigin: "bottom left", opacity: s }}
    >
      <div style={{ maxWidth: "78%" }}>
        <div style={{ margin: "0 0 2px 10px", fontSize: 9.5, fontWeight: 700, color: msg.color }}>{msg.from}</div>
        <div style={{ borderRadius: 18, background: "#262827", padding: "6px 12px", fontSize: 13, lineHeight: 1.3 }}>
          {msg.text}
        </div>
      </div>
    </div>
  );
}

/** What the invite looks like in a chat: the app's text plus the jaxsquares.com link preview. */
function LinkBubble({ frame, text }: { frame: number; text: string }) {
  const s = spring(frame - LINK, FPS, { stiffness: 220, damping: 18 });
  const textIn = interpolate(frame, [LINK + 10, LINK + 16], [0, 1], { easing: Easing.out });
  return (
    <div
      className="flex flex-col items-end"
      style={{ gap: 4, transform: `translateY(${(1 - s) * 40}px)`, opacity: s }}
    >
      <div className="overflow-hidden" style={{ width: "70%", borderRadius: 18, background: "#262827" }}>
        <img src={ASSETS.og} alt="" style={{ display: "block", width: "100%" }} />
        <div style={{ padding: "7px 11px 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>You're invited to play squares</div>
          <div style={{ fontSize: 10.5, color: COLORS.subtle }}>jaxsquares.com</div>
        </div>
      </div>
      <div
        style={{
          maxWidth: "80%",
          borderRadius: 18,
          background: "#0a84ff",
          padding: "6px 12px",
          fontSize: 13,
          lineHeight: 1.3,
          opacity: textIn,
        }}
      >
        {text}
      </div>
    </div>
  );
}
