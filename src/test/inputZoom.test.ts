// @vitest-environment node
// iOS zooms the page into any focused text field whose font is under 16px and
// leaves it zoomed (the page then scrolls sideways), even for an invisible
// field. So every text input and textarea in the app sets its own size of 16px
// or more, never inheriting a smaller one from its parent.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

/** Type scale steps of 16px or more (src/index.css). */
const LARGE = /(?<![\w:[-])text-(body|headline|title-[123]|hero|score)(?![\w-])/;
/** Steps under 16px, without a variant prefix (placeholder:text-callout only styles the placeholder). */
const SMALL = /(?<![\w:[-])text-(callout|subhead|footnote|caption)(?![\w-])|(?<![\w:-])text-\[(?:1[0-5]|[0-9])px\]/;
/** Fields that aren't typed into, so iOS doesn't zoom for them. */
const NOT_TEXT = /\btype=["'](checkbox|radio|range|file|hidden|color|submit|button)["']/;
/** Classes sized in a stylesheet instead of a utility (each one checked at 16px or more). */
const CSS_SIZED = ["hx-score-input"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** The full opening tag starting at `start` (JSX attributes can hold braces and "=>"). */
function tagAt(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0 && source[i - 1] !== "=") return source.slice(start, i + 1);
  }
  return source.slice(start);
}

interface Field {
  where: string;
  tag: string;
}

function textFields(): Field[] {
  const out: Field[] = [];
  for (const path of files(SRC)) {
    const source = readFileSync(path, "utf8");
    for (const m of source.matchAll(/<(input|textarea)\b/g)) {
      const tag = tagAt(source, m.index);
      if (NOT_TEXT.test(tag)) continue;
      const line = source.slice(0, m.index).split("\n").length;
      out.push({ where: `${relative(SRC, path)}:${line}`, tag });
    }
  }
  return out;
}

describe("text fields never trigger iOS focus zoom", () => {
  const fields = textFields();

  it("finds the app's text fields", () => {
    expect(fields.length).toBeGreaterThan(4);
  });

  it("gives every text field an explicit size of 16px or more", () => {
    const bad = fields
      .filter(({ tag }) => SMALL.test(tag) || !(LARGE.test(tag) || CSS_SIZED.some((c) => tag.includes(c))))
      .map((f) => `${f.where}: ${f.tag.replace(/\s+/g, " ").slice(0, 160)}`);
    expect(bad).toEqual([]);
  });

  it("keeps stylesheet-sized fields at 16px or more", () => {
    const sheets = (readdirSync(SRC, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(join(SRC, f), "utf8"));
    for (const cls of CSS_SIZED) {
      const rule = sheets.map((s) => new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(s)?.[1]).find(Boolean);
      const size = /font-size:\s*([\d.]+)(rem|px)/.exec(rule ?? "");
      expect(size, `${cls} sets a font-size`).toBeTruthy();
      const px = Number(size![1]) * (size![2] === "rem" ? 16 : 1);
      expect(px).toBeGreaterThanOrEqual(16);
    }
  });

  it("keeps TextField overrides at 16px or more", () => {
    const overrides = files(SRC).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/inputClassName=["{]`?["']?([^"'`}]*)/g)].map((m) => `${relative(SRC, path)}: ${m[1]}`),
    );
    expect(overrides.filter((o) => SMALL.test(o))).toEqual([]);
  });
});
