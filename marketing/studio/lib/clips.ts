// Real-app clips recorded by marketing/capture/record.mjs: 30 fps JPEG
// sequences in marketing/out/clips/<scene>/, served by the studio at /clips.

export type Scene = "create" | "invite" | "claim" | "jax" | "draw" | "live" | "home";

export interface ClipInfo {
  scene: Scene;
  frames: number;
  fps: number;
  width: number;
}

let clips: Record<string, ClipInfo> = {};

export async function loadClips(): Promise<void> {
  const res = await fetch("/clips/manifest.json");
  if (!res.ok) throw new Error("No clips: run node marketing/capture/record.mjs first");
  clips = await res.json();
}

export function clip(scene: Scene): ClipInfo {
  const c = clips[scene];
  if (!c) throw new Error(`Clip "${scene}" is missing: run node marketing/capture/record.mjs ${scene}`);
  return c;
}

/** URL of clip frame `i` (0-based), clamped to the clip. */
export function clipFrame(scene: Scene, i: number): string {
  const n = clip(scene).frames;
  const k = Math.min(n, Math.max(1, Math.floor(i) + 1));
  return `/clips/${scene}/${String(k).padStart(5, "0")}.jpg`;
}
