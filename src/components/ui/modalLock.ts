// Background lock shared by every open sheet: the app root becomes inert
// (no focus, no clicks, hidden from assistive tech) and stops scrolling.
// Counted so nested sheets don't unlock each other.

let locks = 0;
let savedOverflow = "";

export function lockBackground(): () => void {
  locks++;
  if (locks === 1) {
    const root = document.getElementById("root");
    if (root) root.inert = true;
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks--;
    if (locks === 0) {
      const root = document.getElementById("root");
      if (root) root.inert = false;
      document.body.style.overflow = savedOverflow;
    }
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function focusablesIn(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hasAttribute("inert") && n.getClientRects().length > 0);
}
