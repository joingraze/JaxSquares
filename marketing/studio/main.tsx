import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "virtual:app.css";
import "./studio.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { SCALE } from "./brand";
import { loadClips } from "./lib/clips";
import type { Composition } from "./types";

// Two modes:
//   ?comp=<id>  capture mode, driven frame by frame by render.mjs via window.__studio
//   (no query)  gallery with a scrubber for previewing compositions while editing

declare global {
  interface Window {
    __studio?: {
      comps: Pick<
        Composition,
        "id" | "title" | "width" | "height" | "fps" | "durationInFrames" | "kind" | "coverFrame"
      >[];
      setFrame: (frame: number) => Promise<void>;
    };
  }
}

const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById("root")!);

function Stage({ comp, frame }: { comp: Composition; frame: number }) {
  const C = comp.component;
  return (
    <div className="stage" style={{ width: comp.width / SCALE, height: comp.height / SCALE }}>
      <C frame={frame} />
    </div>
  );
}

let pushFrame: (n: number) => void = () => {};

function Capture({ comp }: { comp: Composition }) {
  const [frame, setFrame] = useState(Number(params.get("frame") ?? 0));
  pushFrame = setFrame;
  return <Stage comp={comp} frame={frame} />;
}

function Gallery({ comps }: { comps: Composition[] }) {
  const [id, setId] = useState(comps[0].id);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const comp = comps.find((c) => c.id === id)!;

  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - (frame / comp.fps) * 1000;
    let raf = 0;
    const tick = (now: number) => {
      setFrame(Math.floor(((now - start) / 1000) * comp.fps) % comp.durationInFrames);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, comp]);

  return (
    <div style={{ display: "flex", gap: 24, padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240 }}>
        {comps.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setId(c.id);
              setFrame(0);
            }}
            style={{
              textAlign: "left",
              padding: "6px 10px",
              borderRadius: 8,
              background: c.id === id ? "#c6f91f" : "#16211b",
              color: c.id === id ? "#060c09" : "#f3f7f1",
            }}
          >
            {c.title}
          </button>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <button onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>
          <input
            type="range"
            min={0}
            max={comp.durationInFrames - 1}
            value={frame}
            onChange={(e) => setFrame(Number(e.target.value))}
            style={{ width: 360 }}
          />
          <span>
            {frame} / {comp.durationInFrames - 1}
          </span>
        </div>
        <Stage comp={comp} frame={frame} />
      </div>
    </div>
  );
}

/** Resolves once every image on the page has decoded, so a capture never shows a half-loaded clip frame. */
function imagesReady(): Promise<unknown> {
  return Promise.all(
    [...document.images].map((img) =>
      img.complete && img.naturalWidth > 0
        ? img.decode().catch(() => {})
        : new Promise((r) => {
            img.addEventListener("load", r, { once: true });
            img.addEventListener("error", r, { once: true });
          }),
    ),
  );
}

// Clip lengths decide composition timing, so they load before anything renders.
await loadClips();
const { COMPOSITIONS } = await import("./compositions");

const compId = params.get("comp");
const comp = compId ? COMPOSITIONS.find((c) => c.id === compId) : undefined;

window.__studio = {
  comps: COMPOSITIONS.map(({ id, title, width, height, fps, durationInFrames, kind, coverFrame }) => ({
    id,
    title,
    width,
    height,
    fps,
    durationInFrames,
    kind,
    coverFrame,
  })),
  setFrame: async (n) => {
    flushSync(() => pushFrame(n));
    await imagesReady();
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  },
};

root.render(comp ? <Capture comp={comp} /> : <Gallery comps={COMPOSITIONS} />);
