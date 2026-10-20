// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedEvent } from "../../shared/types";
import type { Env } from "../env";
import { clearMemoryCache } from "./cache";
import { scoreboard, status, TEAMS, type EventFixture } from "./espn.fixtures";
import { ScoreHub } from "./hub";
import { liveVia, scheduleVia } from "./index";

const NOW = Date.parse("2026-10-16T18:00:00Z");
const KICKOFF = Date.parse("2026-10-18T17:00:00Z");

function ev(id: string, st: EventFixture["status"], lines?: [number[], number[]]): EventFixture {
  return { id, date: "2026-10-18T17:00Z", home: { team: TEAMS.kc, lines: lines?.[0] }, away: { team: TEAMS.buf, lines: lines?.[1] }, status: st };
}

const linked = (eventId: string): LinkedEvent => ({ provider: "espn", league: "nfl", eventId, startsAt: KICKOFF, xIsHome: true });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(scoreboard([ev("a", status.inProgress(2, "5:00"), [[7], [3]]), ev("b", status.scheduled())]))),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("caches", undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  clearMemoryCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function hub(): ScoreHub {
  return new ScoreHub({} as DurableObjectState, {} as Env);
}

const post = (body: unknown) => new Request("https://hub/live", { method: "POST", body: JSON.stringify(body) });

describe("ScoreHub", () => {
  it("answers live lookups, with one ESPN fetch for every board on the slate at once", async () => {
    const h = hub();
    const responses = await Promise.all([h.fetch(post(linked("a"))), h.fetch(post(linked("b"))), h.fetch(post(linked("a")))]);
    const [a, b] = await Promise.all(responses.slice(0, 2).map((r) => r.json()));
    expect(a).toMatchObject({ live: { state: "in", scoreX: 7, scoreY: 3 } });
    expect(b).toMatchObject({ live: { state: "pre" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers schedule requests", async () => {
    const res = await hub().fetch(new Request("https://hub/schedule?league=nfl"));
    expect(await res.json()).toMatchObject({ week: { id: "2-6" }, events: [{ eventId: "a" }, { eventId: "b" }] });
  });

  it("rejects bad input and unknown paths", async () => {
    const h = hub();
    expect((await h.fetch(post({ ...linked("a"), league: "custom" }))).status).toBe(400);
    expect((await h.fetch(new Request("https://hub/live", { method: "POST", body: "nope" }))).status).toBe(400);
    expect((await h.fetch(new Request("https://hub/schedule?league=nfl&week=9"))).status).toBe(400);
    expect((await h.fetch(new Request("https://hub/elsewhere"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("through the hub", () => {
  function envWith(fetchImpl: (req: Request) => Promise<Response>): { env: Env; names: string[] } {
    const names: string[] = [];
    const ns = {
      idFromName: (name: string) => {
        names.push(name);
        return name;
      },
      get: () => ({ fetch: (input: RequestInfo, init?: RequestInit) => fetchImpl(new Request(input, init)) }),
    };
    return { env: { SCORE_HUB: ns } as unknown as Env, names };
  }

  it("routes each league to its own hub", async () => {
    const h = hub();
    const { env, names } = envWith((req) => h.fetch(req));
    expect(await liveVia(env, linked("a"))).toMatchObject({ live: { scoreX: 7 } });
    expect((await scheduleVia(env, "ncaaf"))?.week?.id).toBe("2-6");
    expect(names).toEqual(["espn:nfl", "espn:ncaaf"]);
  });

  it("fetches directly when there is no hub or it fails", async () => {
    expect(await liveVia({} as Env, linked("a"))).toMatchObject({ live: { scoreX: 7 } });
    clearMemoryCache();
    const { env } = envWith(async () => {
      throw new Error("hub overloaded");
    });
    expect(await liveVia(env, linked("a"))).toMatchObject({ live: { scoreX: 7 } });
    expect((await scheduleVia(env, "nfl"))?.events.length).toBe(2);
  });
});
