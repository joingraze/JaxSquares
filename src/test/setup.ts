import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; Board measures its scroller with one unguarded.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
