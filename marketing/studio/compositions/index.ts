import type { Composition } from "../types";
import { REEL } from "../brand";
import { HERO_FRAMES, makeHero } from "./Hero";
import { DRAW_FRAMES, TheDraw } from "./TheDraw";
import { BEST_WORST_FRAMES, BestWorst } from "./BestWorst";
import { CHAT_FRAMES, FAMILY_CHAT, SUNDAY_CHAT, makeGroupChat } from "./GroupChat";
import { WINNERS_FRAMES, Winners } from "./Winners";
import { FEATURES_FRAMES, Features } from "./Features";
import {
  MATCHUP_FRAMES,
  OTD_FRAMES,
  THANKSGIVING_FRAMES,
  Thanksgiving,
  makeMatchup,
  makeOnThisDay,
} from "./Templates";
import { MATCHUPS, ON_THIS_DAY } from "./data";
import { CAROUSELS, STORIES } from "./Slides";

const reel = (c: Omit<Composition, "width" | "height" | "fps" | "kind">): Composition => ({
  ...REEL,
  fps: 30,
  kind: "video",
  ...c,
});

export const COMPOSITIONS: Composition[] = [
  reel({
    id: "01-how-it-works",
    title: "How it works (20s)",
    durationInFrames: HERO_FRAMES,
    coverFrame: 40,
    component: makeHero(5),
  }),
  reel({
    id: "02-how-it-works-free",
    title: "How it works — free pool",
    durationInFrames: HERO_FRAMES,
    coverFrame: 40,
    component: makeHero(0),
  }),
  reel({
    id: "03-the-draw",
    title: "POV: you hit Lock",
    durationInFrames: DRAW_FRAMES,
    coverFrame: 30,
    component: TheDraw,
  }),
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
  reel({
    id: "06-winners-light-up",
    title: "Winners light up",
    durationInFrames: WINNERS_FRAMES,
    coverFrame: 120,
    component: Winners,
  }),
  reel({
    id: "07-features",
    title: "Feature rundown",
    durationInFrames: FEATURES_FRAMES,
    coverFrame: 30,
    component: Features,
  }),
  reel({
    id: "08-thanksgiving-slate",
    title: "Thanksgiving slate",
    durationInFrames: THANKSGIVING_FRAMES,
    coverFrame: 140,
    component: Thanksgiving,
  }),
  ...MATCHUPS.map(({ id, title, props }) =>
    reel({
      id,
      title,
      durationInFrames: MATCHUP_FRAMES,
      coverFrame: 40,
      component: makeMatchup(props),
    }),
  ),
  ...ON_THIS_DAY.map(({ id, title, props }) =>
    reel({
      id,
      title,
      durationInFrames: OTD_FRAMES,
      coverFrame: 60,
      component: makeOnThisDay(props),
    }),
  ),
  ...CAROUSELS,
  ...STORIES,
];
