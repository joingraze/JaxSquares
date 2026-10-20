import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../../index.html?raw";

/** Node built-ins without Node types in the app tsconfig (as in worker/push/sw.test.ts); vitest doesn't load CSS, even ?raw. */
const nodeModule = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);
async function readRepoFile(path: string): Promise<string> {
  const { readFileSync } = (await nodeModule("fs")) as { readFileSync: (p: string, enc: "utf8") => string };
  const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return readFileSync(`${cwd}/${path}`, "utf8");
}

const native = vi.hoisted(() => ({ stored: new Map<string, string>(), statusBar: [] as string[] }));
vi.mock("./native", () => ({
  getStored: vi.fn(async (key: string) => native.stored.get(key) ?? null),
  setStored: vi.fn(async (key: string, value: string) => void native.stored.set(key, value)),
  setStatusBarTheme: vi.fn(async (theme: string) => void native.statusBar.push(theme)),
}));

type ThemeModule = typeof import("./theme");
const KEY = "jaxsquares.theme";

/** A matchMedia whose OS appearance and reduced-motion setting the test controls. */
function fakeMedia(initial: { light?: boolean; reduce?: boolean } = {}) {
  const state = { light: !!initial.light, reduce: !!initial.reduce };
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() {
      if (query.includes("prefers-color-scheme: light")) return state.light;
      if (query.includes("prefers-reduced-motion")) return state.reduce;
      return false;
    },
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
  return {
    setLight(light: boolean) {
      state.light = light;
      for (const l of [...listeners]) l();
    },
  };
}

/** A fresh copy of the module, so its saved-preference state starts from localStorage again. */
async function load(): Promise<ThemeModule> {
  vi.resetModules();
  return import("./theme");
}

const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
const html = () => document.documentElement;

let cleanup: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  native.stored.clear();
  native.statusBar.length = 0;
  html().removeAttribute("data-theme");
  html().className = "";
  document.head.innerHTML = '<meta name="theme-color" content="#060c09" /><meta name="color-scheme" content="dark" />';
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  fakeMedia();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

describe("theme preference", () => {
  it("parses saved values, falling back to the phone's setting", async () => {
    const { parseThemePreference } = await load();
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
  });

  it("resolves system from the OS: light only when the phone asks for it", async () => {
    const { resolveTheme } = await load();
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("follows the phone when nothing is saved", async () => {
    fakeMedia({ light: true });
    const theme = await load();
    cleanup = theme.initTheme();
    expect(theme.getThemePreference()).toBe("system");
    expect(html().dataset.theme).toBe("light");
    expect(meta("theme-color")).toBe(theme.THEME_COLORS.light);
    expect(meta("color-scheme")).toBe("light");
  });

  it("is dark on a dark phone when nothing is saved", async () => {
    fakeMedia({ light: false });
    const theme = await load();
    cleanup = theme.initTheme();
    expect(theme.getThemePreference()).toBe("system");
    expect(html().dataset.theme).toBe("dark");
    expect(meta("theme-color")).toBe(theme.THEME_COLORS.dark);
  });

  it("applies a saved light choice: data-theme, metas and the status bar", async () => {
    localStorage.setItem(KEY, "light");
    const theme = await load();
    cleanup = theme.initTheme();
    expect(html().dataset.theme).toBe("light");
    expect(meta("theme-color")).toBe(theme.THEME_COLORS.light);
    expect(meta("color-scheme")).toBe("light");
    expect(native.statusBar.at(-1)).toBe("light");
  });

  it("saves a new choice locally and in the native store, and switches at once", async () => {
    const theme = await load();
    cleanup = theme.initTheme();
    const seen = vi.fn();
    theme.subscribeTheme(seen);

    theme.setThemePreference("light");
    expect(localStorage.getItem(KEY)).toBe("light");
    await vi.waitFor(() => expect(native.stored.get(KEY)).toBe("light"));
    expect(html().dataset.theme).toBe("light");
    expect(theme.getResolvedTheme()).toBe("light");
    expect(seen).toHaveBeenCalled();

    theme.setThemePreference("dark");
    expect(localStorage.getItem(KEY)).toBe("dark");
    expect(html().dataset.theme).toBe("dark");
    expect(meta("theme-color")).toBe(theme.THEME_COLORS.dark);
  });

  it("follows the OS live while the choice is system", async () => {
    const media = fakeMedia({ light: false });
    const theme = await load();
    cleanup = theme.initTheme();
    theme.setThemePreference("system");
    expect(html().dataset.theme).toBe("dark");

    const seen = vi.fn();
    theme.subscribeTheme(seen);
    media.setLight(true);
    expect(html().dataset.theme).toBe("light");
    expect(theme.getResolvedTheme()).toBe("light");
    expect(meta("theme-color")).toBe(theme.THEME_COLORS.light);
    expect(seen).toHaveBeenCalledTimes(1);

    media.setLight(false);
    expect(html().dataset.theme).toBe("dark");
  });

  it("ignores OS changes when the choice is explicit", async () => {
    const media = fakeMedia({ light: false });
    const theme = await load();
    cleanup = theme.initTheme();
    theme.setThemePreference("dark");
    media.setLight(true);
    expect(html().dataset.theme).toBe("dark");
    theme.setThemePreference("light");
    media.setLight(false);
    expect(html().dataset.theme).toBe("light");
  });

  it("stops following the OS after cleanup", async () => {
    const media = fakeMedia({ light: false });
    localStorage.setItem(KEY, "system");
    const theme = await load();
    theme.initTheme()();
    media.setLight(true);
    expect(html().dataset.theme).toBe("dark");
  });

  it("restores the choice from the native store when localStorage lost it", async () => {
    native.stored.set(KEY, "light");
    const theme = await load();
    cleanup = theme.initTheme();
    await vi.waitFor(() => expect(html().dataset.theme).toBe("light"));
    expect(theme.getThemePreference()).toBe("light");
    expect(localStorage.getItem(KEY)).toBe("light");
  });

  it("re-renders hooks when the theme changes", async () => {
    const media = fakeMedia({ light: false });
    const theme = await load();
    cleanup = theme.initTheme();
    const { result } = renderHook(() => ({ pref: theme.useThemePreference(), resolved: theme.useResolvedTheme() }));
    expect(result.current).toEqual({ pref: "system", resolved: "dark" });
    act(() => theme.setThemePreference("light"));
    expect(result.current).toEqual({ pref: "light", resolved: "light" });
    act(() => theme.setThemePreference("system"));
    expect(result.current).toEqual({ pref: "system", resolved: "dark" });
    act(() => media.setLight(true));
    expect(result.current).toEqual({ pref: "system", resolved: "light" });
  });

  it("crossfades with a view transition, or a short CSS fade, and switches instantly with reduced motion", async () => {
    const theme = await load();
    cleanup = theme.initTheme();

    const startViewTransition = vi.fn((update: () => void) => update());
    (document as { startViewTransition?: unknown }).startViewTransition = startViewTransition;
    theme.setThemePreference("light");
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(html().dataset.theme).toBe("light");

    delete (document as { startViewTransition?: unknown }).startViewTransition;
    vi.useFakeTimers();
    theme.setThemePreference("dark");
    expect(html().classList.contains("theme-switching")).toBe(true);
    vi.runAllTimers();
    expect(html().classList.contains("theme-switching")).toBe(false);

    fakeMedia({ reduce: true });
    (document as { startViewTransition?: unknown }).startViewTransition = startViewTransition;
    theme.setThemePreference("light");
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(html().classList.contains("theme-switching")).toBe(false);
    expect(html().dataset.theme).toBe("light");
  });
});

describe("pre-paint script (index.html)", () => {
  const boot = /<script id="theme-boot">([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? "";

  it("resolves exactly like theme.ts for every saved value and OS setting", async () => {
    const { parseThemePreference, resolveTheme, THEME_COLORS } = await load();
    expect(boot).toContain(KEY);
    for (const saved of [null, "dark", "light", "system", "nonsense"]) {
      for (const osLight of [false, true]) {
        localStorage.clear();
        if (saved !== null) localStorage.setItem(KEY, saved);
        fakeMedia({ light: osLight });
        html().removeAttribute("data-theme");
        document.head.innerHTML = '<meta name="theme-color" content="#060c09" /><meta name="color-scheme" content="dark" />';
        new Function(boot)();
        const want = resolveTheme(parseThemePreference(saved), osLight);
        expect(html().dataset.theme, `${saved} / os ${osLight ? "light" : "dark"}`).toBe(want);
        expect(meta("theme-color")).toBe(THEME_COLORS[want]);
        expect(meta("color-scheme")).toBe(want);
      }
    }
  });

  it("paints the same canvas colors as the theme (index.html, index.css, theme.ts)", async () => {
    const { THEME_COLORS } = await load();
    const css = await readRepoFile("src/index.css");
    const lightBlock = css.slice(css.indexOf(':root[data-theme="light"] {'));
    expect(css).toContain(`--color-canvas: ${THEME_COLORS.dark};`);
    expect(lightBlock).toContain(`--color-canvas: ${THEME_COLORS.light};`);
    expect(indexHtml).toContain(`<meta name="theme-color" content="${THEME_COLORS.dark}" />`);
    expect(indexHtml).toContain(`html { background: ${THEME_COLORS.dark};`);
    expect(indexHtml).toContain(`html[data-theme="light"] { background: ${THEME_COLORS.light};`);
    expect(boot).toContain(`"${THEME_COLORS.light}" : "${THEME_COLORS.dark}"`);
  });
});
