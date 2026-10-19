import type { FC } from "react";

export interface CompProps {
  frame: number;
}

export interface Composition {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  /** "video" encodes an MP4; "stills" writes each frame as a numbered PNG (carousel slides). */
  kind: "video" | "stills";
  /** Video frame also saved as a PNG for the Reel cover. */
  coverFrame?: number;
  component: FC<CompProps>;
}
