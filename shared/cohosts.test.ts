import { describe, expect, it } from "vitest";
import { MAX_COHOSTS, cohostIdsOf, hasCohostRoom, hostRoleOf, isCohostOf, isCohostToken } from "./cohosts";

const ANA = "anaPublicId00000000000";
const BEN = "benPublicId00000000000";

describe("co-hosts", () => {
  it("allows three co-hosts, in one constant", () => {
    expect(MAX_COHOSTS).toBe(3);
    expect(hasCohostRoom({ cohostIds: [ANA, BEN] })).toBe(true);
    expect(hasCohostRoom({ cohostIds: [ANA, BEN, "c"] })).toBe(false);
    expect(hasCohostRoom({})).toBe(true);
  });

  it("reads an older state without co-hosts as none", () => {
    expect(cohostIdsOf({})).toEqual([]);
    expect(isCohostOf({}, ANA)).toBe(false);
    expect(isCohostOf({ cohostIds: [ANA] }, ANA)).toBe(true);
    expect(isCohostOf({ cohostIds: [ANA] }, "")).toBe(false);
  });

  it("says this device's role: the admin token makes it the host, its public id a co-host", () => {
    const game = { cohostIds: [ANA] };
    expect(hostRoleOf(game, ANA, false)).toBe("cohost");
    expect(hostRoleOf(game, BEN, false)).toBeNull();
    expect(hostRoleOf(game, BEN, true)).toBe("host");
    // A co-host who also holds a host link runs it as the host.
    expect(hostRoleOf(game, ANA, true)).toBe("host");
  });

  it("knows an invite token when it sees one", () => {
    expect(isCohostToken("A".repeat(43))).toBe(true);
    expect(isCohostToken("a_b-c".padEnd(43, "x"))).toBe(true);
    expect(isCohostToken("A".repeat(42))).toBe(false);
    expect(isCohostToken("A".repeat(42) + "=")).toBe(false);
    expect(isCohostToken(null)).toBe(false);
  });
});
