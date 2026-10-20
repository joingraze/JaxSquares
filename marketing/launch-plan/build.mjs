#!/usr/bin/env node
// Builds the launch plan outputs from plan.mjs:
//   LAUNCH_PLAN.md          readable plan with every caption
//   jaxsquares-launch.ics   one calendar event per post/task (import into Google/Apple Calendar)
//   plan.json               plan data
//   calendar.html           the calendar page (calendar.template.html + plan data)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PLAN } from "./plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const KIND_LABEL = { reel: "Reel", carousel: "Carousel", story: "Story", task: "Task", film: "Reel (film it)" };
const KIND_MINUTES = { reel: 20, carousel: 20, story: 10, task: 30, film: 45 };

const items = PLAN.items
  .map((it) => ({ ...it, id: `${it.date}T${it.time.replace(":", "")}-${it.kind}` }))
  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

const ids = new Set();
for (const it of items) {
  if (ids.has(it.id)) throw new Error(`Duplicate item id ${it.id}`);
  ids.add(it.id);
  if (it.hashtags && it.hashtags.length > 5) throw new Error(`${it.id}: Instagram allows at most 5 hashtags`);
  if (!PLAN.weeks.some((w) => w.key === it.week)) throw new Error(`${it.id}: unknown week ${it.week}`);
}

const fmtDay = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtTime = (t) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Where to find an asset in marketing/out/. */
function assetFiles(it) {
  if (!it.asset) return [];
  if (it.asset.startsWith("s-story-frames/")) return [`${it.asset}.png`];
  if (it.slides) return Array.from({ length: it.slides }, (_, i) => `${it.asset}/${String(i + 1).padStart(2, "0")}.png`);
  return [`${it.asset}.mp4`, `${it.asset}-cover.png`];
}

// ----------------------------------------------------------------- markdown

function markdown() {
  const s = PLAN.strategy;
  const out = [];
  out.push(`# ${PLAN.title}`);
  out.push("");
  out.push(
    `A 4-week Instagram launch for ${PLAN.handle} (Oct 26 – Nov 22, 2026), plus a prep week and a Thanksgiving-week bonus. All times US Eastern. Every post's asset is rendered from code in \`marketing/studio\`; run \`npm run marketing:render\` to regenerate them into \`marketing/out/\`.`,
  );
  out.push("");
  out.push("## Positioning");
  out.push("");
  out.push(s.positioning);
  out.push("");
  out.push("## Content pillars");
  out.push("");
  out.push("| Pillar | Share | What |");
  out.push("|---|---|---|");
  for (const p of s.pillars) out.push(`| ${p.name} | ${p.share} | ${p.what} |`);
  out.push("");
  out.push("## Cadence");
  out.push("");
  for (const c of s.cadence) out.push(`- ${c}`);
  out.push("");
  out.push("## Rules that drive reach");
  out.push("");
  for (const r of s.rules) out.push(`- ${r}`);
  out.push("");
  out.push("## Stay out of trouble");
  out.push("");
  for (const r of s.compliance) out.push(`- ${r}`);
  out.push("");
  out.push("## Measure");
  out.push("");
  for (const k of s.kpis) out.push(`- **${k.metric}:** ${k.how.startsWith("npx") ? `\`${k.how}\`` : k.how}`);
  out.push("");
  out.push(s.targets);
  out.push("");
  out.push("## Profile setup");
  out.push("");
  out.push(`- **Name field:** ${s.setup.name}`);
  out.push(`- **Bio:**\n\n  \`\`\`\n${s.setup.bio.split("\n").map((l) => `  ${l}`).join("\n")}\n  \`\`\``);
  out.push(`- **Link:** ${s.setup.link}`);
  out.push(`- **Highlights:** ${s.setup.highlights.join(", ")}`);
  out.push(`- **Category:** ${s.setup.category}`);
  out.push(`- **Profile picture:** ${s.setup.profilePictures.map((p) => `\`out/${p.file}.png\` (${p.label})`).join("; ")}`);
  out.push("");
  out.push("## Outreach templates");
  out.push("");
  out.push(`- **Creators:** ${s.outreach.creator}`);
  out.push(`- **Bars / offices:** ${s.outreach.bar}`);
  out.push(`- **UGC ask:** ${s.outreach.ugc}`);
  out.push("");

  for (const w of PLAN.weeks) {
    const wk = items.filter((it) => it.week === w.key);
    out.push(`## ${w.label} · ${w.dates}: ${w.theme}`);
    out.push("");
    out.push(`**Goal:** ${w.goal}`);
    out.push("");
    out.push("| Day | Time (ET) | Type | Post | Asset |");
    out.push("|---|---|---|---|---|");
    for (const it of wk) {
      out.push(`| ${fmtDay(it.date)} | ${fmtTime(it.time)} | ${KIND_LABEL[it.kind]} | ${it.title} | ${it.asset ? `\`${it.asset}\`` : "—"} |`);
    }
    out.push("");
    for (const it of wk.filter((x) => x.kind !== "story")) {
      out.push(`### ${fmtDay(it.date)}, ${fmtTime(it.time)} · ${KIND_LABEL[it.kind]}: ${it.title}`);
      out.push("");
      if (it.tieIn) out.push(`*${it.tieIn}*`, "");
      if (it.asset) out.push(`**Asset:** ${assetFiles(it).map((f) => `\`out/${f}\``).join(", ")}`, "");
      if (it.script) {
        out.push("**Script:**", "");
        for (const l of it.script) out.push(`1. ${l}`);
        out.push("");
      }
      if (it.checklist) {
        for (const l of it.checklist) out.push(`- [ ] ${l}`);
        out.push("");
      }
      if (it.caption) {
        out.push("**Caption:**", "", "```text", it.caption, "", it.hashtags.join(" "), "```", "");
      }
      if (it.altText) out.push(`**Alt text:** ${it.altText}`, "");
      if (it.notes) {
        for (const n of it.notes) out.push(`- ${n}`);
        out.push("");
      }
    }
    const stories = wk.filter((x) => x.kind === "story");
    if (stories.length) {
      out.push("**Stories:**", "");
      for (const it of stories) {
        const bits = [`**${fmtDay(it.date)} ${fmtTime(it.time)}** · ${it.title}`];
        if (it.asset) bits.push(`frame \`${it.asset}\``);
        bits.push(`sticker: ${it.story.sticker}`);
        out.push(`- ${bits.join(" · ")}. “${it.story.text.replace(/\n/g, " / ")}”${it.notes ? ` (${it.notes.join(" ")})` : ""}`);
      }
      out.push("");
    }
  }
  out.push("## Research behind this plan");
  out.push("");
  out.push(
    "Summaries of the Oct 19, 2026 research (Instagram ranking and cadence, sports-app case studies, the 2026 NFL and college calendars, verified on-this-day facts) are in `research/`. Square stats come from nflverse `games.csv` (NFL final scores 1999–2025) via `marketing/studio/scripts/digit_odds.py`.",
  );
  out.push("");
  return out.join("\n");
}

// ----------------------------------------------------------------- calendar

const VTIMEZONE = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

const esc = (t) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold content lines to 75 octets (RFC 5545 §3.1). */
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

function ics() {
  const stamp = "20261019T220000Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JaxSquares//Launch Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:JaxSquares IG launch",
    `X-WR-TIMEZONE:${PLAN.timezone}`,
    ...VTIMEZONE.split("\n"),
  ];
  for (const it of items) {
    const [h, m] = it.time.split(":").map(Number);
    const start = `${it.date.replace(/-/g, "")}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
    const desc = [];
    if (it.tieIn) desc.push(it.tieIn);
    if (it.asset) desc.push(`Asset: ${assetFiles(it).join(", ")}`);
    if (it.story) desc.push(`Sticker: ${it.story.sticker}`, `Text: ${it.story.text}`);
    if (it.script) desc.push("Script:", ...it.script.map((l) => `- ${l}`));
    if (it.checklist) desc.push(...it.checklist.map((l) => `☐ ${l}`));
    if (it.caption) desc.push("", "CAPTION:", it.caption, "", it.hashtags.join(" "));
    if (it.altText) desc.push("", `Alt text: ${it.altText}`);
    if (it.notes) desc.push("", ...it.notes.map((n) => `• ${n}`));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.id}@jaxsquares-launch`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${PLAN.timezone}:${start}`,
      `DURATION:PT${KIND_MINUTES[it.kind]}M`,
      `SUMMARY:${esc(`[${KIND_LABEL[it.kind]}] ${it.title}`)}`,
      `DESCRIPTION:${esc(desc.join("\n"))}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`${KIND_LABEL[it.kind]}: ${it.title}`)}`,
      "TRIGGER:-PT10M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ----------------------------------------------------------------- write

const json = { ...PLAN, items: items.map((it) => ({ ...it, files: assetFiles(it), kindLabel: KIND_LABEL[it.kind] })) };
await writeFile(path.join(here, "LAUNCH_PLAN.md"), markdown());
await writeFile(path.join(here, "jaxsquares-launch.ics"), ics());
await writeFile(path.join(here, "plan.json"), JSON.stringify(json, null, 2) + "\n");
const template = await readFile(path.join(here, "calendar.template.html"), "utf8");
// Escape "</" so the inlined JSON can never close its <script> tag.
await writeFile(path.join(here, "calendar.html"), template.replace("/*PLAN_JSON*/", () => JSON.stringify(json).replace(/<\//g, "<\\/")));
const counts = items.reduce((m, it) => ((m[it.kind] = (m[it.kind] ?? 0) + 1), m), {});
console.log(`✓ ${items.length} items`, counts);
