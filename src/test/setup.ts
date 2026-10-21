import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; Board measures its scroller with one unguarded.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// jsdom has no scrollIntoView. The app calls it from animation frames (the
// create flow's "bring the problem into view"), which can land after a test
// ends and fail the whole run at random.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}
