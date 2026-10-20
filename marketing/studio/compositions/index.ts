import type { Composition } from "../types";
import { REEL } from "../brand";
import {
  DRAW_FRAMES,
  FEATURES_FRAMES,
  Features,
  HOW_FRAMES,
  HowItWorks,
  JAX_FRAMES,
  LetJaxPick,
  TheDraw,
  WINNERS_FRAMES,
  WinnersLightUp,
} from "./Walkthroughs";
import { BEST_WORST_FRAMES, BestWorst } from "./BestWorst";
import { CHAT_FRAMES, FAMILY_CHAT, SUNDAY_CHAT, makeGroupChat } from "./GroupChat";
import { MATCHUP_FRAMES, OTD_FRAMES, THANKSGIVING_FRAMES, Thanksgiving, makeMatchup, makeOnThisDay } from "./Templates";
import { MATCHUPS, ON_THIS_DAY } from "./data";
import { CAROUSELS, PROFILE, STORIES } from "./Slides";

const reel = (c: Omit<Composition, "width" | "height" | "fps" | "kind">): Composition => ({
  ...REEL,
  fps: 30,
  kind: "video",
  ...c,
});

export const COMPOSITIONS: Composition[] = [
  reel({ id: "01-how-it-works", title: "How it works", durationInFrames: HOW_FRAMES, coverFrame: 300, component: HowItWorks }),
  reel({ id: "02-let-jax-pick", title: "Let Jax pick", durationInFrames: JAX_FRAMES, coverFrame: 30, component: LetJaxPick }),
  reel({ id: "03-the-draw", title: "POV: you hit Draw", durationInFrames: DRAW_FRAMES, coverFrame: 250, component: TheDraw }),
  reel({
    id: "04-best-worst-squares",
    title: "Best & worst squares (data)",
    durationInFrames: BEST_WORST_FRAMES,
    coverFrame: 40,
    component: BestWorst,
  }),
  reel({
    id: "05-group-chat",
    title: "Group chat chaos → one link",
    durationInFrames: CHAT_FRAMES,
    coverFrame: 150,
    component: makeGroupChat(SUNDAY_CHAT),
  }),
  reel({
    id: "05b-group-chat-thanksgiving",
    title: "Family group chat (Thanksgiving)",
    durationInFrames: CHAT_FRAMES,
    coverFrame: 150,
    component: makeGroupChat(FAMILY_CHAT),
  }),
  reel({ id: "06-winners-light-up", title: "Winners light up", durationInFrames: WINNERS_FRAMES, coverFrame: 40, component: WinnersLightUp }),
  reel({ id: "07-features", title: "Feature rundown", durationInFrames: FEATURES_FRAMES, coverFrame: 20, component: Features }),
  reel({
    id: "08-thanksgiving-slate",
    title: "Thanksgiving slate",
    durationInFrames: THANKSGIVING_FRAMES,
    coverFrame: 140,
    component: Thanksgiving,
  }),
  ...MATCHUPS.map(({ id, title, props }) =>
    reel({ id, title, durationInFrames: MATCHUP_FRAMES, coverFrame: 40, component: makeMatchup(props) }),
  ),
  ...ON_THIS_DAY.map(({ id, title, props }) =>
    reel({ id, title, durationInFrames: OTD_FRAMES, coverFrame: 60, component: makeOnThisDay(props) }),
  ),
  ...CAROUSELS,
  ...STORIES,
  PROFILE,
];
