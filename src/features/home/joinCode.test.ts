import { describe, expect, it } from "vitest";
import { parseJoinCode } from "./joinCode";
import { PULL_MAX, PULL_THRESHOLD, resist } from "./usePullToRefresh";

describe("parseJoinCode", () => {
  it("accepts a typed code in any case, with spaces or dashes", () => {
    expect(parseJoinCode("ab3kx9")).toEqual({ display: "AB3KX9", id: "ab3kx9", error: null });
    expect(parseJoinCode(" AB3-KX9 ")).toMatchObject({ id: "ab3kx9", error: null });
    expect(parseJoinCode("ab3 kx9")).toMatchObject({ id: "ab3kx9" });
  });

  it("waits for all six characters", () => {
    expect(parseJoinCode("ab3")).toEqual({ display: "AB3", id: null, error: null });
    expect(parseJoinCode("")).toEqual({ display: "", id: null, error: null });
  });

  it("pulls the code out of a pasted invite link", () => {
    expect(parseJoinCode("https://jaxsquares.com/g/ab3kx9?invite=1")).toMatchObject({ id: "ab3kx9", error: null });
    expect(parseJoinCode("jaxsquares.com/g/AB3KX9")).toMatchObject({ id: "ab3kx9" });
  });

  it("explains characters codes never use", () => {
    const r = parseJoinCode("ab30");
    expect(r.id).toBeNull();
    expect(r.error).toMatch(/never use 0, 1, I, L or O/);
    expect(r.error).toMatch(/"0"/);
    expect(parseJoinCode("abl").error).toMatch(/"L"/);
  });

  it("rejects symbols and codes that are too long", () => {
    expect(parseJoinCode("ab#kx9").error).toBe("Codes are letters and numbers only.");
    expect(parseJoinCode("ab3kx9z").error).toBe("Codes are 6 characters.");
  });
});

describe("pull-to-refresh resistance", () => {
  it("starts at zero, grows with the drag and never passes the max", () => {
    expect(resist(0)).toBe(0);
    expect(resist(-40)).toBe(0);
    expect(resist(40)).toBeGreaterThan(0);
    expect(resist(80)).toBeGreaterThan(resist(40));
    expect(resist(10_000)).toBeLessThanOrEqual(PULL_MAX);
  });

  it("needs a deliberate pull to reach the refresh line", () => {
    expect(resist(60)).toBeLessThan(PULL_THRESHOLD);
    expect(resist(200)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });
});
