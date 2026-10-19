import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { COMPOSITIONS } from "./compositions";
import { SCALE } from "./brand";
import type { Composition } from "./types";
import "./studio.css";

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

function Gallery() {
  const [id, setId] = useState(COMPOSITIONS[0].id);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const comp = COMPOSITIONS.find((c) => c.id === id)!;

  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - (frame / comp.fps) * 1000;
    let raf = 0;
    const tick = (now: number) => {
      const f = Math.floor(((now - start) / 1000) * comp.fps);
      setFrame(f % comp.durationInFrames);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, comp]);

  return (
    <div style={{ display: "flex", gap: 24, padding: 24, fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
        {COMPOSITIONS.map((c) => (
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
              background: c.id === id ? "#22c55e" : "#131c30",
              color: c.id === id ? "#060a16" : "#e6edf6",
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
        <div style={{ outline: "1px solid #1e2a44", width: "fit-content" }}>
          <Stage comp={comp} frame={frame} />
        </div>
      </div>
    </div>
  );
}

const compId = params.get("comp");
const comp = compId ? COMPOSITIONS.find((c) => c.id === compId) : undefined;

window.__studio = {
  comps: COMPOSITIONS.map(
    ({ id, title, width, height, fps, durationInFrames, kind, coverFrame }) => ({
      id,
      title,
      width,
      height,
      fps,
      durationInFrames,
      kind,
      coverFrame,
    }),
  ),
  setFrame: (n) =>
    new Promise((resolve) => {
      flushSync(() => pushFrame(n));
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }),
};

root.render(comp ? <Capture comp={comp} /> : <Gallery />);
